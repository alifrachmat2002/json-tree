import { describe, expect, it } from 'vitest'
import { parse } from './parser'
import { buildRows, locate, segmentsForRow } from './tree'

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
