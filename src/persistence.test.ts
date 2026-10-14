import { describe, expect, it } from 'vitest'
import { diffAgainstBaseline } from './edit'
import { parse } from './parser'
import { clearSession, loadSession, saveSession, type StorageLike } from './persistence'

function node(text: string) {
  const r = parse(text)
  if (!r.ok) throw new Error(r.error.message)
  return r.node
}

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  }
}

const brokenStorage: StorageLike = {
  getItem: () => {
    throw new Error('denied')
  },
  setItem: () => {
    throw new Error('quota')
  },
  removeItem: () => {
    throw new Error('denied')
  },
}

describe('persistence', () => {
  it('restores Document and Baseline, preserving number text', () => {
    const storage = memoryStorage()
    const baseline = node('{"a": 1.0}')
    const document = node('{"a": 2.50, "b": [1]}')
    expect(saveSession(storage, { baseline, document })).toBe(true)
    const restored = loadSession(storage)
    expect(restored).toEqual({ baseline, document })
  })

  it('restores the same Edited Node markers after an array insert', () => {
    const storage = memoryStorage()
    const baseline = node('{"a": [{"x": 1}, {"x": 2}]}')
    const inserted = node('{"a": [{"x": 0}]}')
    if (baseline.type !== 'object' || inserted.type !== 'object') throw new Error('unexpected shape')
    const [items, fresh] = [baseline.entries[0].value, inserted.entries[0].value]
    if (items.type !== 'array' || fresh.type !== 'array') throw new Error('unexpected shape')
    // An edit shares untouched Nodes with the Baseline, as the editor does.
    const document = {
      ...baseline,
      entries: [{ key: 'a', value: { ...items, items: [fresh.items[0], ...items.items] } }],
    }
    const before = diffAgainstBaseline(baseline, document)
    saveSession(storage, { baseline, document })
    const restored = loadSession(storage)!
    const after = diffAgainstBaseline(restored.baseline, restored.document)
    expect([...after.edited].sort()).toEqual([...before.edited].sort())
  })

  it('returns null when nothing is stored', () => {
    expect(loadSession(memoryStorage())).toBeNull()
  })

  it('returns null for corrupt stored data', () => {
    const storage = memoryStorage()
    storage.setItem('json-tree.session', '{not json')
    expect(loadSession(storage)).toBeNull()
    storage.setItem('json-tree.session', JSON.stringify({ document: '{bad', baseline: '1' }))
    expect(loadSession(storage)).toBeNull()
  })

  it('clearSession removes the stored session', () => {
    const storage = memoryStorage()
    saveSession(storage, { baseline: node('1'), document: node('1') })
    clearSession(storage)
    expect(loadSession(storage)).toBeNull()
  })

  it('copes with unavailable storage', () => {
    expect(saveSession(brokenStorage, { baseline: node('1'), document: node('1') })).toBe(false)
    expect(loadSession(brokenStorage)).toBeNull()
    expect(() => clearSession(brokenStorage)).not.toThrow()
    expect(loadSession(null)).toBeNull()
    expect(saveSession(null, { baseline: node('1'), document: node('1') })).toBe(false)
  })
})
