import type { JsonNode } from './parser'

export type NodeType = JsonNode['type']

export const NODE_TYPES: NodeType[] = ['object', 'array', 'string', 'number', 'boolean', 'null']

const NUMBER_TEXT = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/

export type EditResult = { ok: true; root: JsonNode } | { ok: false; message: string }
export type AddResult =
  | { ok: true; root: JsonNode; positions: number[] }
  | { ok: false; message: string }
export type ValueResult = { ok: true; node: JsonNode } | { ok: false; message: string }

/** Child positions of the Node a row stands for; a range row stands for its array. */
export function positionsForRow(rowId: string): number[] {
  return rowId.split('#')[0].split('/').slice(1).map(Number)
}

export function getAt(root: JsonNode, positions: number[]): JsonNode | undefined {
  let node: JsonNode | undefined = root
  for (const position of positions) {
    if (node?.type === 'object') node = node.entries[position]?.value
    else if (node?.type === 'array') node = node.items[position]
    else return undefined
  }
  return node
}

/** Rebuild the path down to `positions`, sharing every untouched Node with the input. */
function updateAt(
  node: JsonNode,
  positions: number[],
  fn: (target: JsonNode) => JsonNode,
): JsonNode {
  if (positions.length === 0) return fn(node)
  const [head, ...rest] = positions
  if (node.type === 'object') {
    const entries = node.entries.map((e, i) =>
      i === head ? { key: e.key, value: updateAt(e.value, rest, fn) } : e,
    )
    return { type: 'object', entries }
  }
  if (node.type === 'array') {
    return { type: 'array', items: node.items.map((c, i) => (i === head ? updateAt(c, rest, fn) : c)) }
  }
  return node
}

/** Parse text typed into an inline editor as a new value of the same type as `node`. */
export function editPrimitive(node: JsonNode, text: string): ValueResult {
  switch (node.type) {
    case 'string':
      if (node.value === text) return { ok: true, node }
      return { ok: true, node: { type: 'string', value: text } }
    case 'number': {
      const source = text.trim()
      if (!NUMBER_TEXT.test(source)) return { ok: false, message: 'Not a valid JSON number' }
      if (node.source === source) return { ok: true, node }
      return { ok: true, node: { type: 'number', source } }
    }
    case 'boolean': {
      const word = text.trim()
      if (word !== 'true' && word !== 'false') return { ok: false, message: 'Must be true or false' }
      if (node.value === (word === 'true')) return { ok: true, node }
      return { ok: true, node: { type: 'boolean', value: word === 'true' } }
    }
    default:
      return { ok: false, message: `A${node.type === 'null' ? '' : 'n'} ${node.type} has no inline value` }
  }
}

/** Text shown when an inline value edit starts. */
export function editableText(node: JsonNode): string {
  switch (node.type) {
    case 'string':
      return node.value
    case 'number':
      return node.source
    case 'boolean':
      return String(node.value)
    default:
      return ''
  }
}

export function isEditable(node: JsonNode): boolean {
  return node.type === 'string' || node.type === 'number' || node.type === 'boolean'
}

/** Change a Node's type, carrying the value over between primitives where sensible. */
export function convertType(node: JsonNode, type: NodeType): JsonNode {
  if (node.type === type) return node
  switch (type) {
    case 'object':
      return { type: 'object', entries: [] }
    case 'array':
      return { type: 'array', items: [] }
    case 'null':
      return { type: 'null' }
    case 'string':
      if (node.type === 'number') return { type: 'string', value: node.source }
      if (node.type === 'boolean') return { type: 'string', value: String(node.value) }
      return { type: 'string', value: '' }
    case 'number':
      if (node.type === 'string') {
        const source = node.value.trim()
        return { type: 'number', source: NUMBER_TEXT.test(source) ? source : '0' }
      }
      if (node.type === 'boolean') return { type: 'number', source: node.value ? '1' : '0' }
      return { type: 'number', source: '0' }
    case 'boolean':
      if (node.type === 'string') return { type: 'boolean', value: node.value.trim() === 'true' }
      if (node.type === 'number') return { type: 'boolean', value: Number(node.source) !== 0 }
      return { type: 'boolean', value: false }
  }
}

export function replaceAt(root: JsonNode, positions: number[], node: JsonNode): JsonNode {
  if (getAt(root, positions) === node) return root
  return updateAt(root, positions, () => node)
}

export function renameKey(root: JsonNode, positions: number[], newKey: string): EditResult {
  const parent = getAt(root, positions.slice(0, -1))
  if (positions.length === 0 || parent?.type !== 'object') {
    return { ok: false, message: 'Only object Keys can be renamed' }
  }
  const index = positions[positions.length - 1]
  if (parent.entries[index].key === newKey) return { ok: true, root }
  if (parent.entries.some((e, i) => i !== index && e.key === newKey)) {
    return { ok: false, message: `Key "${newKey}" already exists` }
  }
  const renamed = updateAt(root, positions.slice(0, -1), (target) => {
    if (target.type !== 'object') return target
    return {
      type: 'object',
      entries: target.entries.map((e, i) => (i === index ? { key: newKey, value: e.value } : e)),
    }
  })
  return { ok: true, root: renamed }
}

export function deleteAt(root: JsonNode, positions: number[]): JsonNode {
  if (positions.length === 0) return root
  const index = positions[positions.length - 1]
  return updateAt(root, positions.slice(0, -1), (target) => {
    if (target.type === 'object') {
      return { type: 'object', entries: target.entries.filter((_, i) => i !== index) }
    }
    if (target.type === 'array') {
      return { type: 'array', items: target.items.filter((_, i) => i !== index) }
    }
    return target
  })
}

export interface AddTarget {
  /** Positions of the container that receives the new Node. */
  container: number[]
  /** Array position to insert after; null appends. */
  after: number | null
  /** Objects need a Key for the new Node. */
  needsKey: boolean
}

/** Where "Add" puts a Node for the current selection: after it in arrays, at the end of its object otherwise. */
export function addTarget(root: JsonNode, selected: number[]): AddTarget | null {
  if (selected.length === 0) return null
  const container = selected.slice(0, -1)
  const parent = getAt(root, container)
  if (parent?.type === 'array') {
    return { container, after: selected[selected.length - 1], needsKey: false }
  }
  if (parent?.type === 'object') return { container, after: null, needsKey: true }
  return null
}

/** Where "Add child" puts a Node: at the end of the selected container. */
export function childTarget(root: JsonNode, selected: number[]): AddTarget | null {
  const node = getAt(root, selected)
  if (node?.type === 'array') return { container: selected, after: null, needsKey: false }
  if (node?.type === 'object') return { container: selected, after: null, needsKey: true }
  return null
}

export function addNode(
  root: JsonNode,
  target: AddTarget,
  key: string | null,
  node: JsonNode = { type: 'null' },
): AddResult {
  const container = getAt(root, target.container)
  if (container?.type === 'object') {
    if (key === null) return { ok: false, message: 'A Key is required' }
    if (container.entries.some((e) => e.key === key)) {
      return { ok: false, message: `Key "${key}" already exists` }
    }
    const position = container.entries.length
    const updated = updateAt(root, target.container, (c) =>
      c.type === 'object' ? { type: 'object', entries: [...c.entries, { key, value: node }] } : c,
    )
    return { ok: true, root: updated, positions: [...target.container, position] }
  }
  if (container?.type === 'array') {
    const position = target.after === null ? container.items.length : target.after + 1
    const updated = updateAt(root, target.container, (c) => {
      if (c.type !== 'array') return c
      const items = [...c.items]
      items.splice(position, 0, node)
      return { type: 'array', items }
    })
    return { ok: true, root: updated, positions: [...target.container, position] }
  }
  return { ok: false, message: 'Nothing to add to' }
}

export interface Diff {
  /** Row ids of Nodes that differ from the Baseline (containers included when anything beneath them differs). */
  edited: Set<string>
  /** Row id of a container → number of Baseline children no longer present. */
  removed: Map<string, number>
}

export function emptyDiff(): Diff {
  return { edited: new Set(), removed: new Map() }
}

/**
 * Compare the Document with its Baseline. Object children match by Key; array
 * children match by identity (untouched Nodes are shared with the Baseline), then
 * by position for Nodes that were replaced in place.
 */
export function diffAgainstBaseline(baseline: JsonNode, current: JsonNode): Diff {
  const diff = emptyDiff()

  const walk = (node: JsonNode, base: JsonNode | undefined, id: string): boolean => {
    if (node === base) return false
    const edited = compare(node, base, id)
    if (edited) diff.edited.add(id)
    return edited
  }

  const compare = (node: JsonNode, base: JsonNode | undefined, id: string): boolean => {
    if (base === undefined || base.type !== node.type) return true
    switch (node.type) {
      case 'string':
        return node.value !== (base as typeof node).value
      case 'number':
        return node.source !== (base as typeof node).source
      case 'boolean':
        return node.value !== (base as typeof node).value
      case 'null':
        return false
      case 'object': {
        const baseEntries = new Map((base as typeof node).entries.map((e) => [e.key, e.value]))
        let edited = false
        node.entries.forEach((e, i) => {
          if (walk(e.value, baseEntries.get(e.key), `${id}/${i}`)) edited = true
        })
        const kept = node.entries.filter((e) => baseEntries.has(e.key)).length
        const removed = baseEntries.size - kept
        if (removed > 0) diff.removed.set(id, removed)
        return edited || removed > 0
      }
      case 'array': {
        const baseItems = (base as typeof node).items
        const byRef = new Map(baseItems.map((item, i) => [item, i]))
        const claimed = new Set<number>()
        node.items.forEach((item) => {
          const at = byRef.get(item)
          if (at !== undefined) claimed.add(at)
        })
        let edited = false
        node.items.forEach((item, i) => {
          if (byRef.has(item)) return
          // A replaced Node pairs with the Baseline item at its position, else the first unclaimed one.
          let counterpart: number | undefined = i < baseItems.length && !claimed.has(i) ? i : undefined
          if (counterpart === undefined) {
            const free = baseItems.findIndex((_, at) => !claimed.has(at))
            counterpart = free === -1 ? undefined : free
          }
          if (counterpart !== undefined) claimed.add(counterpart)
          if (walk(item, counterpart === undefined ? undefined : baseItems[counterpart], `${id}/${i}`)) {
            edited = true
          }
        })
        const removed = baseItems.length - claimed.size
        if (removed > 0) diff.removed.set(id, removed)
        return edited || removed > 0
      }
    }
  }

  walk(current, baseline, 'root')
  return diff
}

export interface History {
  past: JsonNode[]
  present: JsonNode
  future: JsonNode[]
}

export function createHistory(present: JsonNode): History {
  return { past: [], present, future: [] }
}

export function commit(history: History, next: JsonNode): History {
  if (next === history.present) return history
  return { past: [...history.past, history.present], present: next, future: [] }
}

export function undo(history: History): History {
  if (history.past.length === 0) return history
  const past = history.past.slice(0, -1)
  return { past, present: history.past[history.past.length - 1], future: [history.present, ...history.future] }
}

export function redo(history: History): History {
  if (history.future.length === 0) return history
  const [present, ...future] = history.future
  return { past: [...history.past, history.present], present, future }
}
