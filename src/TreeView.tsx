import { Fragment, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { copyToClipboard } from './clipboard'
import type { JsonNode } from './parser'
import { PathBar } from './PathBar'
import { DEFAULT_ROOT_NAME, describeFailure, formatPath, parsePath, resolvePath } from './path'
import { usePathSettings } from './pathSettings'
import { findMatches, splitHighlight, type Match } from './search'
import { copyText } from './serialize'
import {
  buildRows,
  defaultExpanded,
  locate,
  navigate,
  preview,
  truncateString,
  segmentsForRow,
  type NavKey,
  type Row,
} from './tree'

const NAV_KEYS: NavKey[] = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
/** Beyond this many matches only the current one is revealed, to keep the tree small. */
const AUTO_EXPAND_LIMIT = 500

export function TreeView({ root }: { root: JsonNode }) {
  const [expanded, setExpanded] = useState(() => defaultExpanded(root))
  const [selectedId, setSelectedId] = useState<string | null>('root')
  const [menu, setMenu] = useState<{ rowId: string; x: number; y: number } | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [current, setCurrent] = useState(0)
  const treeRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const settings = usePathSettings()
  const rootName = settings.rootName.trim() || DEFAULT_ROOT_NAME

  const rows = useMemo(() => buildRows(root, expanded), [root, expanded])

  const searchQuery = useDeferredValue(query)
  const matches = useMemo(() => findMatches(root, searchQuery), [root, searchQuery])
  // `current` can briefly outlive a shrinking result set, so clamp it when reading.
  const currentIndex = Math.min(current, matches.length - 1)
  const currentMatch: Match | undefined = matches[currentIndex]
  const currentId = useMemo(
    () => (currentMatch ? locate(root, currentMatch.positions).id : null),
    [root, currentMatch],
  )
  const searchStale = query !== searchQuery

  const reveal = (found: Match[]) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      for (const m of found) locate(root, m.positions).expand.forEach((id) => next.add(id))
      return next
    })

  const goTo = (index: number) => {
    const target = matches[index]
    if (!target) return
    setCurrent(index)
    reveal([target])
    setSelectedId(locate(root, target.positions).id)
  }

  /** Move to the current match first (typing doesn't select), then step with wrap-around. */
  const step = (delta: 1 | -1) => {
    if (matches.length === 0 || searchStale) return
    if (selectedId !== currentId) goTo(currentIndex)
    else goTo((currentIndex + delta + matches.length) % matches.length)
  }

  // A new result set starts at its first match with every ancestor revealed; selection waits for navigation.
  useEffect(() => {
    setCurrent(0)
    if (matches.length === 0) return
    reveal(matches.length <= AUTO_EXPAND_LIMIT ? matches : [matches[0]])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)
      const ctrlF = (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f'
      if (ctrlF || (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey)) {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
      <div className="search-bar">
        <input
          ref={searchRef}
          className="search"
          type="search"
          aria-label="Search"
          placeholder="Search Keys and values ( / or Ctrl+F )"
          value={query}
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              step(e.shiftKey ? -1 : 1)
            } else if (e.key === 'Escape') {
              treeRef.current?.focus()
            }
          }}
        />
        <button
          aria-label="Previous match"
          disabled={matches.length === 0}
          onClick={() => step(-1)}
        >
          ↑
        </button>
        <button
          aria-label="Next match"
          disabled={matches.length === 0}
          onClick={() => step(1)}
        >
          ↓
        </button>
        {query !== '' && (
          <span className="match-count" aria-live="polite">
            {matches.length === 0 ? 'No matches' : `${currentIndex + 1} of ${matches.length}`}
          </span>
        )}
      </div>
      <div ref={treeRef} className="tree" role="tree" tabIndex={0} onKeyDown={onKeyDown}>
        {rows.map((row) => (
          <TreeRow
            key={row.id}
            row={row}
            selected={row.id === selectedId}
            query={searchQuery}
            currentPart={row.id === currentId ? currentMatch.part : null}
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
  query,
  currentPart,
  onSelect,
  onToggle,
  onMenu,
}: {
  row: Row
  selected: boolean
  query: string
  currentPart: 'key' | 'value' | null
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
          {row.isIndex || isRange ? (
            row.isIndex ? `[${row.label}]` : row.label
          ) : (
            <>
              <Highlighted text={row.label} query={query} current={currentPart === 'key'} />:
            </>
          )}
        </span>
      )}
      {!isRange && <span className={`badge ${type}`}>{type}</span>}
      {row.expandable && (
        <span className="count">
          {row.childCount} {unit}
        </span>
      )}
      {!isRange && <span className={`value ${type}`}>
          {node.type === 'string' ? (
            <QuotedString value={node.value} query={query} current={currentPart === 'value'} />
          ) : (
            <Highlighted
              text={preview(node, row.expanded)}
              query={isPrimitive(node) ? query : ''}
              current={currentPart === 'value'}
            />
          )}
        </span>}
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

function isPrimitive(node: JsonNode): boolean {
  return node.type !== 'object' && node.type !== 'array'
}

function Highlighted({ text, query, current }: { text: string; query: string; current: boolean }) {
  if (query === '') return <>{text}</>
  return (
    <>
      {splitHighlight(text, query).map((part, i) =>
        part.hit ? (
          <mark key={i} className={current ? 'current' : undefined}>
            {part.text}
          </mark>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </>
  )
}

/** A string value as shown in a row: JSON-quoted, with only the raw text (not quotes or escapes) highlighted. */
function QuotedString({ value, query, current }: { value: string; query: string; current: boolean }) {
  const inner = (text: string) => JSON.stringify(text).slice(1, -1)
  return (
    <>
      &quot;
      {splitHighlight(truncateString(value), query).map((part, i) =>
        part.hit ? (
          <mark key={i} className={current ? 'current' : undefined}>
            {inner(part.text)}
          </mark>
        ) : (
          <Fragment key={i}>{inner(part.text)}</Fragment>
        ),
      )}
      &quot;
    </>
  )
}
