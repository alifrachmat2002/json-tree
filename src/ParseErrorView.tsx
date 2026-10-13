import { useEffect, useRef, useState } from 'react'
import type { ParseError } from './parser'

interface Props {
  text: string
  error: ParseError
  onRetry: (text: string) => void
}

export function ParseErrorView({ text, error, onRetry }: Props) {
  const [draft, setDraft] = useState(text)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    const crsBefore = text.slice(0, error.offset).split('\r').length - 1
    const start = error.offset - crsBefore
    el.setSelectionRange(start, Math.min(start + 1, el.value.length))
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 18
    el.scrollTop = Math.max(0, (error.line - 3) * lineHeight)
  }, [error, text])

  return (
    <section className="error-view">
      <div className="error-banner" role="alert">
        <strong>
          Line {error.line}, column {error.column}
        </strong>
        <span>{error.message}</span>
      </div>
      <textarea
        ref={ref}
        spellCheck={false}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onRetry(draft)
        }}
      />
      <div className="actions">
        <button className="primary" onClick={() => onRetry(draft)}>
          Retry
        </button>
      </div>
    </section>
  )
}
