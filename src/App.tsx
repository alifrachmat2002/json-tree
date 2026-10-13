import { useCallback, useState } from 'react'
import { LoadView } from './LoadView'
import { ParseErrorView } from './ParseErrorView'
import { TreeView } from './TreeView'
import { parse, type JsonNode, type ParseError } from './parser'

type State =
  | { status: 'empty' }
  | { status: 'loaded'; node: JsonNode; loadId: number }
  | { status: 'error'; text: string; error: ParseError }

let loadCount = 0

export function App() {
  const [state, setState] = useState<State>({ status: 'empty' })
  const [dragging, setDragging] = useState(false)

  const load = useCallback((text: string) => {
    const result = parse(text)
    setState(
      result.ok
        ? { status: 'loaded', node: result.node, loadId: ++loadCount }
        : { status: 'error', text, error: result.error },
    )
  }, [])

  const loadFile = useCallback(async (file: File) => load(await file.text()), [load])

  return (
    <div
      className={`app${dragging ? ' dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const file = e.dataTransfer.files[0]
        if (file) void loadFile(file)
      }}
    >
      <header className="app-header">
        <h1>JSON Tree</h1>
        {state.status !== 'empty' && (
          <button onClick={() => setState({ status: 'empty' })}>Load another</button>
        )}
      </header>
      <main>
        {state.status === 'empty' && <LoadView onLoadText={load} onLoadFile={loadFile} />}
        {state.status === 'error' && (
          <ParseErrorView text={state.text} error={state.error} onRetry={load} />
        )}
        {state.status === 'loaded' && <TreeView key={state.loadId} root={state.node} />}
      </main>
    </div>
  )
}
