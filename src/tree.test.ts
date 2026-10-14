import { describe, expect, it } from 'vitest'
import { parse } from './parser'
import { buildRows, locate, remapExpanded, segmentsForRow } from './tree'

function doc(text: string) {
  const r = parse(text)
  if (!r.ok) throw new Error(r.error.message)
  return r.node
}

describe('segmentsForRow', () => {
  const root = doc('{"users":[{"a b":1}],"x":null}')

  it('maps row ids to Keys and Indexes', () => {
    expect(segmentsForRow(root, 'root')).toEqual([])
    expect(segmentsForRow(root, 'root/0/0/0')).toEqual([
      { kind: 'key', key: 'users' },
      { kind: 'index', index: 0 },
      { kind: 'key', key: 'a b' },
    ])
  })

  it('treats a range row as its array', () => {
    expect(segmentsForRow(root, 'root/0#0')).toEqual([{ kind: 'key', key: 'users' }])
  })
})

describe('locate', () => {
  const big = doc(`{"list":[${Array.from({ length: 250 }, (_, i) => i).join(',')}]}`)

  it('returns the row id and ancestors to expand, including array ranges', () => {
    const { id, expand } = locate(big, [0, 205])
    expect(id).toBe('root/0/205')
    expect(expand).toEqual(['root', 'root/0', 'root/0#200'])
  })

  it('produces ids that exist once the ancestors are expanded', () => {
    const { id, expand } = locate(big, [0, 205])
    const rows = buildRows(big, new Set(expand))
    expect(rows.some((r) => r.id === id)).toBe(true)
  })
})

describe('remapExpanded', () => {
  const root = doc('{"list":[{"a":[1]},{"b":[2]},{"c":[3]}]}')

  it('follows untouched containers when earlier siblings are deleted', () => {
    const list = root.type === 'object' ? root.entries[0].value : root
    if (list.type !== 'array') throw new Error('shape')
    const next: typeof root = {
      type: 'object',
      entries: [{ key: 'list', value: { type: 'array', items: list.items.slice(1) } }],
    }
    // Only item 2 ("c") was expanded; after deleting item 0 it sits at position 1.
    const out = remapExpanded(root, next, new Set(['root', 'root/0', 'root/0/2']))
    expect([...out].sort()).toEqual(['root', 'root/0', 'root/0/1'])
  })

  it('drops ids of containers that were removed', () => {
    const list = root.type === 'object' ? root.entries[0].value : root
    if (list.type !== 'array') throw new Error('shape')
    const next: typeof root = {
      type: 'object',
      entries: [{ key: 'list', value: { type: 'array', items: list.items.slice(1) } }],
    }
    const out = remapExpanded(root, next, new Set(['root/0/0']))
    expect([...out]).toEqual([])
  })
})
