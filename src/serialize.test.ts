import { describe, expect, it } from 'vitest'
import { parse } from './parser'
import { copyText, serialize } from './serialize'

function node(text: string) {
  const r = parse(text)
  if (!r.ok) throw new Error(r.error.message)
  return r.node
}

describe('serialize', () => {
  it('pretty-prints with 2-space indent and keeps order', () => {
    expect(serialize(node('{"b":[1,{"c":null}],"a":{},"d":[]}'))).toBe(
      '{\n  "b": [\n    1,\n    {\n      "c": null\n    }\n  ],\n  "a": {},\n  "d": []\n}',
    )
  })

  it('keeps number source text', () => {
    expect(serialize(node('[1.0, 12345678901234567890, 1E+2]'))).toBe(
      '[\n  1.0,\n  12345678901234567890,\n  1E+2\n]',
    )
  })

  it('escapes strings as JSON', () => {
    expect(serialize(node('"a\\n\\"b"'))).toBe('"a\\n\\"b"')
  })
})

describe('copyText', () => {
  it('copies strings as raw text', () => {
    expect(copyText(node('"line1\\nline2 \\"q\\""'))).toBe('line1\nline2 "q"')
  })

  it('copies other primitives in JSON form', () => {
    expect(copyText(node('1.50'))).toBe('1.50')
    expect(copyText(node('true'))).toBe('true')
    expect(copyText(node('null'))).toBe('null')
  })

  it('pretty-prints containers', () => {
    expect(copyText(node('{"a":[1]}'))).toBe('{\n  "a": [\n    1\n  ]\n}')
  })
})

describe('round trip', () => {
  it('keeps the source escapes of untouched strings and Keys', () => {
    const bs = String.fromCharCode(92)
    const text = `{\n  "k${bs}u00e9": "a${bs}/b ${bs}u00e9 é"\n}`
    expect(serialize(node(text))).toBe(text)
  })

  it('re-escapes an edited string canonically', () => {
    const edited = { type: 'string' as const, value: 'a/b' }
    expect(serialize(edited)).toBe('"a/b"')
  })

  it('is byte-identical for a 2-space-indented Document', () => {
    const text = '{\n  "a": [\n    1.0,\n    -0.50,\n    1E+2,\n    "x\\ny"\n  ],\n  "b": {},\n  "c": [],\n  "d": {\n    "e": null,\n    "f": true\n  }\n}'
    expect(serialize(node(text))).toBe(text)
  })
})
