import { describe, expect, it } from 'vitest'
import { parse } from './parser'
import { findMatches, splitHighlight } from './search'

function doc(text: string) {
  const r = parse(text)
  if (!r.ok) throw new Error(r.error.message)
  return r.node
}

describe('findMatches', () => {
  const root = doc('{"Name":"Alice","age":30,"n":1.50,"ok":true,"none":null,"list":[{"name":"bob"}]}')

  it('returns nothing for an empty query', () => {
    expect(findMatches(root, '')).toEqual([])
  })

  it('matches Keys case-insensitively', () => {
    expect(findMatches(root, 'NAME')).toEqual([
      { positions: [0], part: 'key' },
      { positions: [5, 0, 0], part: 'key' },
    ])
  })

  it('matches string values', () => {
    expect(findMatches(root, 'alic')).toEqual([{ positions: [0], part: 'value' }])
  })

  it('matches numbers by source text', () => {
    expect(findMatches(root, '1.50')).toEqual([{ positions: [2], part: 'value' }])
    expect(findMatches(root, '1.5').length).toBe(1)
  })

  it('matches booleans and null by their text', () => {
    expect(findMatches(root, 'true')).toEqual([{ positions: [3], part: 'value' }])
    expect(findMatches(root, 'null')).toEqual([{ positions: [4], part: 'value' }])
  })

  it('reports Key and value matches of one Node separately, Key first', () => {
    const r = doc('{"a":"a"}')
    expect(findMatches(r, 'a').map((m) => m.part)).toEqual(['key', 'value'])
  })

  it('treats regex metacharacters literally', () => {
    expect(findMatches(doc('{"a.b":"(x)"}'), '(x)')).toEqual([{ positions: [0], part: 'value' }])
    expect(findMatches(doc('{"axb":1}'), 'a.b')).toEqual([])
  })

  it('does not match array Indexes or container Nodes', () => {
    expect(findMatches(doc('[["x"]]'), '0')).toEqual([])
  })
})

describe('splitHighlight', () => {
  it('splits text around case-insensitive hits', () => {
    expect(splitHighlight('Foo bar FOO', 'foo')).toEqual([
      { text: 'Foo', hit: true },
      { text: ' bar ', hit: false },
      { text: 'FOO', hit: true },
    ])
  })

  it('keeps offsets aligned for characters whose lowercase changes length', () => {
    expect(splitHighlight('İx', 'x')).toEqual([
      { text: 'İ', hit: false },
      { text: 'x', hit: true },
    ])
  })

  it('returns the whole text when the query is empty or absent', () => {
    expect(splitHighlight('abc', '')).toEqual([{ text: 'abc', hit: false }])
    expect(splitHighlight('abc', 'z')).toEqual([{ text: 'abc', hit: false }])
  })
})
