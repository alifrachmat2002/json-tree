import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LoadView } from './LoadView'
import { ParseErrorView } from './ParseErrorView'
import { TreeView } from './TreeView'
import { commit, createHistory, diffAgainstBaseline, redo, undo, type History } from './edit'
import { canSaveInPlace, copyDocument, downloadDocument, saveInPlace, type SaveHandle } from './output'
import { parse, type JsonNode, type ParseError } from './parser'
import { browserStorage, clearSession, loadSession, saveSession } from './persistence'

type State =
  | { status: 'empty' }
  | { status: 'loaded'; baseline: JsonNode; history: History; loadId: number }
  | { status: 'error'; text: string; error: ParseError }

let loadCount = 0

function initialState(): State {
  const session = loadSession(browserStorage())
  return session
    ? {
        status: 'loaded',
        baseline: session.baseline,
        history: createHistory(session.document),
        loadId: ++loadCount,
      }
    : { status: 'empty' }
}

export function App() {
  const [state, setState] = useState<State>(initialState)
  const [dragging, setDragging] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const fileHandle = useRef<SaveHandle | null>(null)
  const present = state.status === 'loaded' ? state.history.present : null
  const baseline = state.status === 'loaded' ? state.baseline : null

  useEffect(() => {
    if (present && baseline) saveSession(browserStorage(), { document: present, baseline })
  }, [present, baseline])

  const load = useCallback((text: string) => {
    const result = parse(text)
    fileHandle.current = null
    if (!result.ok) clearSession(browserStorage())
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

  const markSaved = useCallback(() => {
    setState((prev) => (prev.status === 'loaded' ? { ...prev, baseline: prev.history.present } : prev))
  }, [])

  const copyAll = async () => {
    if (!present) return
    setNotice((await copyDocument(present)) ? 'Document copied' : 'Copy failed')
  }

  const download = () => {
    if (!present) return
    downloadDocument(present)
    markSaved()
  }

  const save = async () => {
    if (!present) return
    try {
      const handle = await saveInPlace(present, fileHandle.current)
      if (!handle) return
      fileHandle.current = handle
      markSaved()
      setNotice(`Saved to ${handle.name}`)
    } catch (e) {
      fileHandle.current = null
      setNotice(`Save failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const close = () => {
    clearSession(browserStorage())
    fileHandle.current = null
    setNotice(null)
    setState({ status: 'empty' })
  }

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
        {notice && <span className="notice">{notice}</span>}
        {state.status === 'loaded' && (
          <>
            <button onClick={() => void copyAll()}>Copy Document</button>
            <button onClick={download}>Download .json</button>
            {canSaveInPlace() && <button onClick={() => void save()}>Save</button>}
          </>
        )}
        {state.status !== 'empty' && <button onClick={close}>Close Document</button>}
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
