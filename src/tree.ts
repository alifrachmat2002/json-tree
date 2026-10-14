import type { JsonNode } from './parser'
import type { Segment } from './path'

export const RANGE_SIZE = 100
const EXPANDED_LEVELS = 2
const PREVIEW_KEYS = 3
const PREVIEW_STRING_LENGTH = 60

export type RowKind = 'node' | 'range'

export interface Row {
  id: string
  parentId: string | null
  depth: number
  kind: RowKind
  /** Key, Index or range label such as `[0…99]`; null for the root. */
  label: string | null
  /** True when the label is an array Index rather than an object Key. */
  isIndex: boolean
  node: JsonNode
  expandable: boolean
  expanded: boolean
  /** Number of children (for ranges: items inside the range). */
  childCount: number
}

export function childCount(node: JsonNode): number {
  if (node.type === 'object') return node.entries.length
  if (node.type === 'array') return node.items.length
  return 0
}

export function rangeLabel(start: number, end: number): string {
  return `[${start}…${end}]`
}

/** Ids of the containers that start expanded: the first two levels. */
export function defaultExpanded(root: JsonNode): Set<string> {
  const expanded = new Set<string>()
  const visit = (node: JsonNode, id: string, depth: number) => {
    if (depth >= EXPANDED_LEVELS || childCount(node) === 0) return
    expanded.add(id)
    if (node.type === 'object') node.entries.forEach((e, i) => visit(e.value, `${id}/${i}`, depth + 1))
    if (node.type === 'array') node.items.forEach((item, i) => visit(item, `${id}/${i}`, depth + 1))
  }
  visit(root, 'root', 0)
  return expanded
}

/** Flatten the Document into the rows currently visible given the expanded set. */
export function buildRows(root: JsonNode, expanded: Set<string>): Row[] {
  const rows: Row[] = []

  const pushNode = (
    node: JsonNode,
    id: string,
    parentId: string | null,
    depth: number,
    label: string | null,
    isIndex = false,
  ) => {
    const count = childCount(node)
    const isExpanded = count > 0 && expanded.has(id)
    rows.push({
      id,
      parentId,
      depth,
      kind: 'node',
      label,
      isIndex,
      node,
      expandable: count > 0,
      expanded: isExpanded,
      childCount: count,
    })
    if (!isExpanded) return

    if (node.type === 'object') {
      node.entries.forEach((e, i) => pushNode(e.value, `${id}/${i}`, id, depth + 1, e.key))
    } else if (node.type === 'array') {
      if (node.items.length <= RANGE_SIZE) {
        node.items.forEach((item, i) => pushNode(item, `${id}/${i}`, id, depth + 1, String(i), true))
        return
      }
      for (let start = 0; start < node.items.length; start += RANGE_SIZE) {
        const end = Math.min(start + RANGE_SIZE, node.items.length) - 1
        const rangeId = `${id}#${start}`
        const rangeExpanded = expanded.has(rangeId)
        rows.push({
          id: rangeId,
          parentId: id,
          depth: depth + 1,
          kind: 'range',
          label: rangeLabel(start, end),
          isIndex: false,
          node,
          expandable: true,
          expanded: rangeExpanded,
          childCount: end - start + 1,
        })
        if (!rangeExpanded) continue
        for (let i = start; i <= end; i++) {
          pushNode(node.items[i], `${id}/${i}`, rangeId, depth + 2, String(i), true)
        }
      }
    }
  }

  pushNode(root, 'root', null, 0, null)
  return rows
}

/** A string value cut to the length shown in a row. */
export function truncateString(value: string): string {
  return value.length > PREVIEW_STRING_LENGTH ? `${value.slice(0, PREVIEW_STRING_LENGTH)}…` : value
}

/** One-line summary of a Node shown beside its Key. */
export function preview(node: JsonNode, expanded: boolean): string {
  switch (node.type) {
    case 'string':
      return JSON.stringify(truncateString(node.value))
    case 'number':
      return node.source
    case 'boolean':
      return String(node.value)
    case 'null':
      return 'null'
    case 'array':
      return expanded ? '' : `Array(${node.items.length})`
    case 'object': {
      if (expanded) return ''
      if (node.entries.length === 0) return '{}'
      const keys = node.entries.slice(0, PREVIEW_KEYS).map((e) => e.key)
      const more = node.entries.length > PREVIEW_KEYS ? ', …' : ''
      return `{${keys.join(', ')}${more}}`
    }
  }
}

export type NavKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'

export interface NavResult {
  select?: string
  setExpanded?: { id: string; expanded: boolean }
}

/** Decide what a navigation key does given the visible rows and the selection. */
export function navigate(rows: Row[], selectedId: string | null, key: NavKey): NavResult {
  if (rows.length === 0) return {}
  const index = rows.findIndex((r) => r.id === selectedId)
  if (index === -1) return { select: rows[0].id }
  const row = rows[index]

  switch (key) {
    case 'ArrowUp':
      return index > 0 ? { select: rows[index - 1].id } : {}
    case 'ArrowDown':
      return index < rows.length - 1 ? { select: rows[index + 1].id } : {}
    case 'ArrowRight':
      if (!row.expandable) return {}
      if (!row.expanded) return { setExpanded: { id: row.id, expanded: true } }
      return rows[index + 1]?.parentId === row.id ? { select: rows[index + 1].id } : {}
    case 'ArrowLeft':
      if (row.expandable && row.expanded) return { setExpanded: { id: row.id, expanded: false } }
      return row.parentId ? { select: row.parentId } : {}
  }
}

/** Path of the Node a row stands for. A range row stands for its array. */
export function segmentsForRow(root: JsonNode, rowId: string): Segment[] {
  const segments: Segment[] = []
  const positions = rowId.split('#')[0].split('/').slice(1).map(Number)
  let node = root
  for (const position of positions) {
    if (node.type === 'object') {
      const entry = node.entries[position]
      segments.push({ kind: 'key', key: entry.key })
      node = entry.value
    } else if (node.type === 'array') {
      segments.push({ kind: 'index', index: position })
      node = node.items[position]
    }
  }
  return segments
}

/** Id of the row at the given child positions, plus the container ids that must be expanded to show it. */
export function locate(root: JsonNode, positions: number[]): { id: string; expand: string[] } {
  const expand: string[] = []
  let id = 'root'
  let node = root
  for (const position of positions) {
    expand.push(id)
    if (node.type === 'array') {
      if (node.items.length > RANGE_SIZE) {
        expand.push(`${id}#${Math.floor(position / RANGE_SIZE) * RANGE_SIZE}`)
      }
      node = node.items[position]
    } else if (node.type === 'object') {
      node = node.entries[position].value
    }
    id = `${id}/${position}`
  }
  return { id, expand }
}

/**
 * Carry the expanded set across a Document change. Row ids are positions, so inserting or
 * removing array items shifts them; untouched containers are shared between the old and new
 * Document, so they are followed by identity. Containers that were rebuilt (ancestors of the
 * change) keep their id.
 */
export function remapExpanded(oldRoot: JsonNode, newRoot: JsonNode, expanded: Set<string>): Set<string> {
  const oldIds = new Map<JsonNode, string>()
  const collect = (node: JsonNode, id: string) => {
    if (childCount(node) === 0) return
    oldIds.set(node, id)
    if (node.type === 'object') node.entries.forEach((e, i) => collect(e.value, `${id}/${i}`))
    if (node.type === 'array') node.items.forEach((item, i) => collect(item, `${id}/${i}`))
  }
  collect(oldRoot, 'root')

  const moved = new Map<string, string>()
  const present = new Set<string>()
  const follow = (node: JsonNode, id: string) => {
    if (childCount(node) === 0) return
    present.add(id)
    const was = oldIds.get(node)
    if (was !== undefined) moved.set(was, id)
    if (node.type === 'object') node.entries.forEach((e, i) => follow(e.value, `${id}/${i}`))
    if (node.type === 'array') node.items.forEach((item, i) => follow(item, `${id}/${i}`))
  }
  follow(newRoot, 'root')
  const claimed = new Set(moved.values())

  const next = new Set<string>()
  for (const entry of expanded) {
    const [base, range] = entry.split('#')
    const suffix = range === undefined ? '' : `#${range}`
    const target = moved.get(base) ?? (present.has(base) && !claimed.has(base) ? base : undefined)
    if (target !== undefined) next.add(target + suffix)
  }
  return next
}
