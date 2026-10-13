import { useEffect, useMemo, useRef, useState } from 'react'
import type { JsonNode } from './parser'
import { buildRows, defaultExpanded, navigate, preview, type NavKey, type Row } from './tree'

const NAV_KEYS: NavKey[] = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']

export function TreeView({ root }: { root: JsonNode }) {
  const [expanded, setExpanded] = useState(() => defaultExpanded(root))
  const [selectedId, setSelectedId] = useState<string | null>('root')
  const treeRef = useRef<HTMLDivElement>(null)

  const rows = useMemo(() => buildRows(root, expanded), [root, expanded])

  const setRowExpanded = (id: string, open: boolean) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (open) next.add(id)
      else next.delete(id)
      return next
    })

  useEffect(() => {
    treeRef.current?.focus()
  }, [])

  useEffect(() => {
    treeRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!NAV_KEYS.includes(e.key as NavKey)) return
    e.preventDefault()
    const result = navigate(rows, selectedId, e.key as NavKey)
    if (result.select) setSelectedId(result.select)
    if (result.setExpanded) setRowExpanded(result.setExpanded.id, result.setExpanded.expanded)
  }

  return (
    <div
      ref={treeRef}
      className="tree"
      role="tree"
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      {rows.map((row) => (
        <TreeRow
          key={row.id}
          row={row}
          selected={row.id === selectedId}
          onSelect={() => setSelectedId(row.id)}
          onToggle={() => setRowExpanded(row.id, !row.expanded)}
        />
      ))}
    </div>
  )
}

function TreeRow({
  row,
  selected,
  onSelect,
  onToggle,
}: {
  row: Row
  selected: boolean
  onSelect: () => void
  onToggle: () => void
}) {
  const { node } = row
  const isRange = row.kind === 'range'
  const type = isRange ? 'range' : node.type
  const unit = isRange || node.type === 'array' ? 'items' : 'keys'

  return (
    <div
      className={`row${selected ? ' selected' : ''}`}
      role="treeitem"
      aria-selected={selected}
      aria-expanded={row.expandable ? row.expanded : undefined}
      style={{ paddingLeft: `${row.depth * 18 + 8}px` }}
      onClick={onSelect}
    >
      <span
        className="chevron"
        onClick={(e) => {
          e.stopPropagation()
          onSelect()
          if (row.expandable) onToggle()
        }}
      >
        {row.expandable ? (row.expanded ? '▾' : '▸') : ''}
      </span>
      {row.label !== null && (
        <span className={`label${row.isIndex || isRange ? ' index' : ''}`}>
          {row.isIndex ? `[${row.label}]` : isRange ? row.label : `${row.label}:`}
        </span>
      )}
      {!isRange && <span className={`badge ${type}`}>{type}</span>}
      {row.expandable && (
        <span className="count">
          {row.childCount} {unit}
        </span>
      )}
      {!isRange && <span className={`value ${type}`}>{preview(node, row.expanded)}</span>}
    </div>
  )
}
