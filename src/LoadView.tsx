import { useState } from 'react'

interface Props {
  onLoadText: (text: string) => void
  onLoadFile: (file: File) => void
}

export function LoadView({ onLoadText, onLoadFile }: Props) {
  const [text, setText] = useState('')

  return (
    <section className="load-view">
      <p className="hint">Paste JSON, drop a file anywhere, or choose a file.</p>
      <textarea
        autoFocus
        spellCheck={false}
        placeholder='{"paste": "JSON here"}'
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={(e) => {
          if (text.trim() !== '') return
          e.preventDefault()
          onLoadText(e.clipboardData.getData('text'))
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onLoadText(text)
        }}
      />
      <div className="actions">
        <button className="primary" disabled={text.trim() === ''} onClick={() => onLoadText(text)}>
          Load
        </button>
        <label className="file-button">
          Choose file…
          <input
            type="file"
            accept=".json,application/json,text/plain"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onLoadFile(file)
            }}
          />
        </label>
      </div>
    </section>
  )
}
