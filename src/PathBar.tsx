import { useState } from 'react'
import { DEFAULT_ROOT_NAME, PATH_FORMATS, formatRoot, formatSegment, type PathFormat, type Segment } from './path'

interface Props {
  segments: Segment[]
  format: PathFormat
  rootName: string
  status: string | null
  onFormatChange: (format: PathFormat) => void
  onRootNameChange: (name: string) => void
  /** Select the ancestor reached after `depth` segments (0 = root). */
  onSelectAncestor: (depth: number) => void
  onCopy: () => void
  /** Returns an error message, or null when the Path was found and selected. */
  onJump: (text: string) => string | null
}

export function PathBar({
  segments,
  format,
  rootName,
  status,
  onFormatChange,
  onRootNameChange,
  onSelectAncestor,
  onCopy,
  onJump,
}: Props) {
  const [jumpText, setJumpText] = useState('')
  const [jumpError, setJumpError] = useState<string | null>(null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (jumpText.trim() === '') return
    const error = onJump(jumpText)
    setJumpError(error)
    if (!error) setJumpText('')
  }

  return (
    <div className="path-bar">
      <div className="path-row">
        <select
          aria-label="Path format"
          value={format}
          onChange={(e) => onFormatChange(e.target.value as PathFormat)}
        >
          {PATH_FORMATS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
        {format === 'js' && (
          <input
            className="root-name"
            aria-label="Root name"
            title="Root name"
            value={rootName}
            spellCheck={false}
            onChange={(e) => onRootNameChange(e.target.value)}
          />
        )}
        <nav className="crumbs" aria-label="Path">
          <button className="crumb" onClick={() => onSelectAncestor(0)}>
            {formatRoot(format, rootName.trim() || DEFAULT_ROOT_NAME) || '(root)'}
          </button>
          {segments.map((segment, i) => (
            <button key={i} className="crumb" onClick={() => onSelectAncestor(i + 1)}>
              {formatSegment(segment, format)}
            </button>
          ))}
        </nav>
        {status && <span className="status">{status}</span>}
        <button onClick={onCopy} title="Copy Path (Ctrl+Shift+C)">
          Copy Path
        </button>
      </div>
      <form className="path-row" onSubmit={submit}>
        <input
          className="jump"
          aria-label="Jump to Path"
          placeholder="Jump to Path: data.users[0].name, $.users[0].name or /users/0/name"
          value={jumpText}
          spellCheck={false}
          onChange={(e) => {
            setJumpText(e.target.value)
            setJumpError(null)
          }}
        />
        <button type="submit">Go</button>
      </form>
      {jumpError && <div className="jump-error">{jumpError}</div>}
    </div>
  )
}
