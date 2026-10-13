import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { copyToClipboard } from './clipboard'
import type { JsonNode } from './parser'
import { PathBar } from './PathBar'
import { DEFAULT_ROOT_NAME, describeFailure, formatPath, parsePath, resolvePath } from './path'
import { usePathSettings } from './pathSettings'
import { copyText } from './serialize'
import {
  buildRows,
  defaultExpanded,
  locate,
  navigate,
  preview,
  segmentsForRow,
  type NavKey,
  type Row,
} from './tree'

const NAV_KEYS: NavKey[] = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']

export function TreeView({ root }: { root: JsonNode }) {
  const [expanded, setExpanded] = useState(() => defaultExpanded(root))
  const [selectedId, setSelectedId] = useState<string | null>('root')
  const [menu, setMenu] = useState<{ rowId: string; x: number; y: number } | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const treeRef = useRef<HTMLDivElement>(null)
  const settings = usePathSettings()
  const rootName = settings.rootName.trim() || DEFAULT_ROOT_NAME

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

  useEffect(() => {
    if (!status) return
    const timer = setTimeout(() => setStatus(null), 1500)
    return () => clearTimeout(timer)
  }, [status])

  const copy = async (text: string, what: string) => {
    setStatus((await copyToClipboard(text)) ? `Copied ${what}` : 'Copy failed')
  }

  const copyPath = (rowId: string) =>
    copy(formatPath(segmentsForRow(root, rowId), settings.format, rootName), 'Path')

  const copyValue = (rowId: string) => {
    const node = rows.find((r) => r.id === rowId)?.node
    if (node) void copy(copyText(node), 'value')
  }

  const jump = (text: string): string | null => {
    const parsed = parsePath(text, rootName)
    if (!parsed.ok) return parsed.message
    const resolved = resolvePath(root, parsed.segments)
    if (!resolved.ok) return describeFailure(resolved, parsed.format, rootName)
    const { id, expand } = locate(root, resolved.positions)
    setExpanded((prev) => new Set([...prev, ...expand]))
    setSelectedId(id)
    treeRef.current?.focus()
    return null
  }

  const selectedBase = selectedId ? selectedId.split('#')[0] : 'root'

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey && e.shiftKey && e.code === 'KeyC') {
      e.preventDefault()
      void copyPath(selectedBase)
      return
    }
    if (!NAV_KEYS.includes(e.key as NavKey)) return
    e.preventDefault()
    const result = navigate(rows, selectedId, e.key as NavKey)
    if (result.select) setSelectedId(result.select)
    if (result.setExpanded) setRowExpanded(result.setExpanded.id, result.setExpanded.expanded)
  }

  return (
    <>
      <PathBar
        segments={segmentsForRow(root, selectedBase)}
        format={settings.format}
        rootName={settings.rootName}
        status={status}
        onFormatChange={settings.setFormat}
        onRootNameChange={settings.setRootName}
        onSelectAncestor={(depth) => {
          setSelectedId(selectedBase.split('/').slice(0, depth + 1).join('/'))
          treeRef.current?.focus()
        }}
        onCopy={() => {
          void copyPath(selectedBase)
          treeRef.current?.focus()
        }}
        onJump={jump}
      />
      <div ref={treeRef} className="tree" role="tree" tabIndex={0} onKeyDown={onKeyDown}>
        {rows.map((row) => (
          <TreeRow
            key={row.id}
            row={row}
            selected={row.id === selectedId}
            onSelect={() => setSelectedId(row.id)}
            onToggle={() => setRowExpanded(row.id, !row.expanded)}
            onMenu={(x, y) => {
              setSelectedId(row.id)
              setMenu({ rowId: row.id, x, y })
            }}
          />
        ))}
      </div>
      {menu && (
        <RowMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onCopyPath={() => void copyPath(menu.rowId)}
          onCopyValue={() => copyValue(menu.rowId)}
        />
      )}
    </>
  )
}

function RowMenu({
  x,
  y,
  onClose,
  onCopyPath,
  onCopyValue,
}: {
  x: number
  y: number
  onClose: () => void
  onCopyPath: () => void
  onCopyValue: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  // Keep the menu inside the viewport when opened near the right or bottom edge.
  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect()
    if (!box) return
    setPos({
      left: Math.max(4, Math.min(x, window.innerWidth - box.width - 4)),
      top: Math.max(4, Math.min(y, window.innerHeight - box.height - 4)),
    })
  }, [x, y])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('click', onClose)
    window.addEventListener('blur', onClose)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', onClose)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div ref={ref} className="menu" role="menu" style={pos}>
      <button role="menuitem" onClick={onCopyPath}>
        Copy Path
      </button>
      <button role="menuitem" onClick={onCopyValue}>
        Copy value
      </button>
    </div>
  )
}

function TreeRow({
  row,
  selected,
  onSelect,
  onToggle,
  onMenu,
}: {
  row: Row
  selected: boolean
  onSelect: () => void
  onToggle: () => void
  onMenu: (x: number, y: number) => void
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
      onContextMenu={(e) => {
        if (isRange) return
        e.preventDefault()
        onMenu(e.clientX, e.clientY)
      }}
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
      {!isRange && (
        <button
          className="row-menu"
          aria-label="Copy options"
          onClick={(e) => {
            e.stopPropagation()
            const box = e.currentTarget.getBoundingClientRect()
            onMenu(box.left, box.bottom)
          }}
        >
          ⧉
        </button>
      )}
    </div>
  )
}
