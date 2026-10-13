import { describe, expect, it } from 'vitest'
import { parse } from './parser'

function ok(text: string) {
  const r = parse(text)
  if (!r.ok) throw new Error(`expected success, got ${r.error.message}`)
  return r.node
}

describe('parse', () => {
  it('parses every primitive type', () => {
    expect(ok('null')).toEqual({ type: 'null' })
    expect(ok(' true ')).toEqual({ type: 'boolean', value: true })
    expect(ok('false')).toEqual({ type: 'boolean', value: false })
    expect(ok('"hi"')).toEqual({ type: 'string', value: 'hi' })
    expect(ok('-12.5e3')).toEqual({ type: 'number', source: '-12.5e3' })
  })

  it('parses nested objects and arrays, preserving key order', () => {
    expect(ok('{"b": [1, {"c": null}], "a": {}, "d": []}')).toEqual({
      type: 'object',
      entries: [
        {
          key: 'b',
          value: {
            type: 'array',
            items: [
              { type: 'number', source: '1' },
              { type: 'object', entries: [{ key: 'c', value: { type: 'null' } }] },
            ],
          },
        },
        { key: 'a', value: { type: 'object', entries: [] } },
        { key: 'd', value: { type: 'array', items: [] } },
      ],
    })
  })

  it('keeps number source text exactly, including big integers and 1.0', () => {
    expect(ok('[12345678901234567890, 1.0, 1E+2, -0]')).toEqual({
      type: 'array',
      items: [
        { type: 'number', source: '12345678901234567890' },
        { type: 'number', source: '1.0' },
        { type: 'number', source: '1E+2' },
        { type: 'number', source: '-0' },
      ],
    })
  })

  it('rejects numbers that are not strict JSON', () => {
    for (const bad of ['01', '+1', '.5', '1.', '-', '1e', 'NaN', '0x10']) {
      expect(parse(bad).ok, bad).toBe(false)
    }
  })

  it('decodes string escapes and unicode', () => {
    const json = String.raw`"a\"b\\c\/d\b\f\n\r\té😀"`
    expect(ok(json)).toEqual({
      type: 'string',
      value: 'a"b\\c/d\b\f\n\r\té\u{1F600}',
    })
    expect(ok('"héllo 😀"')).toEqual({ type: 'string', value: 'héllo 😀' })
  })

  it('rejects invalid escapes and raw control characters in strings', () => {
    expect(parse(String.raw`"\x"`).ok).toBe(false)
    expect(parse(String.raw`"\u12G4"`).ok).toBe(false)
    expect(parse('"a\nb"').ok).toBe(false)
  })

  it('rejects a duplicate Key and points at the second occurrence', () => {
    const r = parse('{\n  "a": 1,\n  "b": 2,\n  "a": 3\n}')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.message).toMatch(/duplicate key "a"/i)
    expect([r.error.line, r.error.column]).toEqual([4, 3])
  })

  it('allows the same Key in different objects', () => {
    expect(parse('{"a": {"a": 1}, "b": [{"a": 2}]}').ok).toBe(true)
  })

  it('reports line and column of a trailing comma', () => {
    const r = parse('{\n  "a": [1, 2,]\n}')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect([r.error.line, r.error.column]).toEqual([2, 14])
  })

  it('reports line and column of a comment', () => {
    const r = parse('{\n  // note\n  "a": 1\n}')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect([r.error.line, r.error.column]).toEqual([2, 3])
  })

  it('reports a trailing comma in an object at the closing brace', () => {
    const r = parse('{"a": 1,\n}')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect([r.error.line, r.error.column]).toEqual([2, 1])
  })

  it('reports excessive nesting as a parse error instead of throwing', () => {
    const r = parse('['.repeat(100_000))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.message).toMatch(/nested too deeply/i)
  })

  it('reports unexpected content after the value and unterminated input', () => {
    const extra = parse('{} x')
    expect(extra.ok).toBe(false)
    if (!extra.ok) expect([extra.error.line, extra.error.column]).toEqual([1, 4])
    expect(parse('[1, 2').ok).toBe(false)
    expect(parse('').ok).toBe(false)
  })
})
