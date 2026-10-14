import { parse, type JsonNode } from './parser'
import { serialize } from './serialize'

const SESSION_KEY = 'json-tree.session'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface Session {
  document: JsonNode
  baseline: JsonNode
}

/** The browser's localStorage, or null when the browser refuses access to it. */
export function browserStorage(): StorageLike | null {
  try {
    return localStorage
  } catch {
    return null
  }
}

/** Store Document and Baseline as JSON text; returns false when storage is unavailable or full. */
export function saveSession(storage: StorageLike | null, session: Session): boolean {
  if (!storage) return false
  try {
    storage.setItem(
      SESSION_KEY,
      JSON.stringify({ document: serialize(session.document), baseline: serialize(session.baseline) }),
    )
    return true
  } catch {
    return false
  }
}

/** The stored session, or null when absent, corrupt or storage is unavailable. */
export function loadSession(storage: StorageLike | null): Session | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(SESSION_KEY)
    if (raw === null) return null
    const stored = JSON.parse(raw) as { document?: unknown; baseline?: unknown }
    if (typeof stored.document !== 'string' || typeof stored.baseline !== 'string') return null
    const document = parse(stored.document)
    const baseline = parse(stored.baseline)
    if (!document.ok || !baseline.ok) return null
    return { document: shareUntouched(baseline.node, document.node), baseline: baseline.node }
  } catch {
    return null
  }
}

export function clearSession(storage: StorageLike | null): void {
  try {
    storage?.removeItem(SESSION_KEY)
  } catch {
    // Storage unavailable: nothing to clear.
  }
}

function equal(a: JsonNode, b: JsonNode): boolean {
  if (a === b) return true
  switch (a.type) {
    case 'object': {
      if (b.type !== 'object' || a.entries.length !== b.entries.length) return false
      return a.entries.every((e, i) => e.key === b.entries[i].key && equal(e.value, b.entries[i].value))
    }
    case 'array':
      return b.type === 'array' && a.items.length === b.items.length && a.items.every((x, i) => equal(x, b.items[i]))
    case 'number':
      return b.type === 'number' && a.source === b.source
    default:
      return a.type === b.type && 'value' in a && 'value' in b ? a.value === b.value : a.type === b.type
  }
}

/**
 * Parsing the Document and Baseline separately loses the sharing that the diff relies on
 * (untouched Nodes are the same object in both). Re-share every Node equal to its Baseline counterpart.
 */
function shareUntouched(base: JsonNode, doc: JsonNode): JsonNode {
  if (equal(base, doc)) return base
  if (base.type === 'object' && doc.type === 'object') {
    const byKey = new Map(base.entries.map((e) => [e.key, e.value]))
    return {
      ...doc,
      entries: doc.entries.map((e) => {
        const counterpart = byKey.get(e.key)
        return counterpart ? { ...e, value: shareUntouched(counterpart, e.value) } : e
      }),
    }
  }
  if (base.type === 'array' && doc.type === 'array') {
    const claimed = new Set<number>()
    return {
      ...doc,
      items: doc.items.map((item) => {
        const at = base.items.findIndex((b, i) => !claimed.has(i) && equal(b, item))
        if (at === -1) return item
        claimed.add(at)
        return base.items[at]
      }),
    }
  }
  return doc
}
