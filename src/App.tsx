import { useCallback, useMemo, useState } from 'react'
import { LoadView } from './LoadView'
import { ParseErrorView } from './ParseErrorView'
import { TreeView } from './TreeView'
import { commit, createHistory, diffAgainstBaseline, redo, undo, type History } from './edit'
import { parse, type JsonNode, type ParseError } from './parser'

type State =
  | { status: 'empty' }
  | { status: 'loaded'; baseline: JsonNode; history: History; loadId: number }
  | { status: 'error'; text: string; error: ParseError }

let loadCount = 0

export function App() {
  const [state, setState] = useState<State>({ status: 'empty' })
  const [dragging, setDragging] = useState(false)

  const load = useCallback((text: string) => {
    const result = parse(text)
    setState(
      result.ok
        ? {
            status: 'loaded',
            baseline: result.node,
            history: createHistory(result.node),
            loadId: ++loadCount,
          }
        : { status: 'error', text, error: result.error },
    )
  }, [])

  const update = useCallback((change: (history: History) => History) => {
    setState((prev) => (prev.status === 'loaded' ? { ...prev, history: change(prev.history) } : prev))
  }, [])

  const diff = useMemo(
    () => (state.status === 'loaded' ? diffAgainstBaseline(state.baseline, state.history.present) : null),
    [state],
  )

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
        {diff?.edited.has('root') && <span className="unsaved">● Unsaved changes</span>}
        {state.status !== 'empty' && (
          <button onClick={() => setState({ status: 'empty' })}>Load another</button>
        )}
      </header>
      <main>
        {state.status === 'empty' && <LoadView onLoadText={load} onLoadFile={loadFile} />}
        {state.status === 'error' && (
          <ParseErrorView text={state.text} error={state.error} onRetry={load} />
        )}
        {state.status === 'loaded' && diff && (
          <TreeView
            key={state.loadId}
            root={state.history.present}
            diff={diff}
            canUndo={state.history.past.length > 0}
            canRedo={state.history.future.length > 0}
            onChange={(next) => update((h) => commit(h, next))}
            onUndo={() => update(undo)}
            onRedo={() => update(redo)}
          />
        )}
      </main>
    </div>
  )
}
