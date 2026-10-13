import { describe, expect, it } from 'vitest'
import { parse } from './parser'
import {
  describeFailure,
  detectFormat,
  formatPath,
  parsePath,
  resolvePath,
  type PathFormat,
  type Segment,
} from './path'

const key = (k: string): Segment => ({ kind: 'key', key: k })
const idx = (i: number): Segment => ({ kind: 'index', index: i })

describe('formatPath', () => {
  it('formats the root as the root name, $ or the empty pointer', () => {
    expect(formatPath([], 'js')).toBe('data')
    expect(formatPath([], 'js', 'doc')).toBe('doc')
    expect(formatPath([], 'jsonpath')).toBe('$')
    expect(formatPath([], 'pointer')).toBe('')
  })

  it('uses dot notation for identifiers and brackets otherwise', () => {
    const segs = [key('users'), idx(0), key('first-name')]
    expect(formatPath(segs, 'js')).toBe('data.users[0]["first-name"]')
    expect(formatPath(segs, 'jsonpath')).toBe("$.users[0]['first-name']")
    expect(formatPath(segs, 'pointer')).toBe('/users/0/first-name')
  })

  it('handles keys with dots, spaces, quotes, empty strings and numeric strings', () => {
    expect(formatPath([key('a.b'), key('c d')], 'js')).toBe('data["a.b"]["c d"]')
    expect(formatPath([key('say "hi"')], 'js')).toBe('data["say \\"hi\\""]')
    expect(formatPath([key("it's")], 'jsonpath')).toBe("$['it\\'s']")
    expect(formatPath([key('')], 'js')).toBe('data[""]')
    expect(formatPath([key('')], 'jsonpath')).toBe("$['']")
    expect(formatPath([key('')], 'pointer')).toBe('/')
    expect(formatPath([key('0')], 'js')).toBe('data["0"]')
    expect(formatPath([key('0')], 'jsonpath')).toBe("$['0']")
    expect(formatPath([key('0')], 'pointer')).toBe('/0')
  })

  it('escapes ~ and / in JSON Pointer', () => {
    expect(formatPath([key('a/b'), key('~x'), key('~1')], 'pointer')).toBe('/a~1b/~0x/~01')
  })

  it('escapes control characters and backslashes', () => {
    expect(formatPath([key('a\nb\\c')], 'js')).toBe('data["a\\nb\\\\c"]')
    expect(formatPath([key('\u0001')], 'jsonpath')).toBe("$['\\u0001']")
  })
})

describe('detectFormat', () => {
  it('detects by leading character', () => {
    expect(detectFormat('$.a')).toBe('jsonpath')
    expect(detectFormat('  /a/b')).toBe('pointer')
    expect(detectFormat('data.a')).toBe('js')
    expect(detectFormat('a[0]')).toBe('js')
  })
})

const tricky: Segment[][] = [
  [],
  [key('users'), idx(0), key('name')],
  [key('first-name')],
  [key('a.b'), key('c d')],
  [key('say "hi"'), key("it's")],
  [key('')],
  [key('0'), idx(0)],
  [key('a/b'), key('~'), key('~1~0')],
  [key('a\nb\t\\'), key('\u0001'), key('é😀')],
  [key('constructor'), key('class'), key('$x'), key('_y')],
]

describe('parsePath round-trips', () => {
  const formats: PathFormat[] = ['js', 'jsonpath', 'pointer']
  for (const format of formats) {
    it(`formatPath → parsePath in ${format}`, () => {
      for (const segs of tricky) {
        const text = formatPath(segs, format, 'data')
        if (text === '') continue // the empty pointer is the root; the bar treats empty input as no Path
        const parsed = parsePath(text, 'data')
        expect(parsed.ok, text).toBe(true)
        if (!parsed.ok) continue
        expect(parsed.format).toBe(format)
        // Pointer tokens stay ambiguous until resolved, so compare their text.
        const texts = parsed.segments.map((s) =>
          s.kind === 'token' ? s.text : s.kind === 'key' ? s.key : String(s.index),
        )
        const expected = segs.map((s) => (s.kind === 'key' ? s.key : String(s.index)))
        expect(texts, text).toEqual(expected)
        if (format !== 'pointer') expect(parsed.segments, text).toEqual(segs)
      }
    })
  }
})

describe('parsePath', () => {
  it('treats the root name as optional in JS accessor', () => {
    const withRoot = parsePath('data.users[0]', 'data')
    const without = parsePath('users[0]', 'data')
    expect(withRoot).toEqual(without)
    expect(withRoot.ok && withRoot.segments).toEqual([key('users'), idx(0)])
  })

  it('only strips the root name at a segment boundary', () => {
    const r = parsePath('database.x', 'data')
    expect(r.ok && r.segments).toEqual([key('database'), key('x')])
  })

  it('honours a custom root name', () => {
    const r = parsePath('doc["a b"]', 'doc')
    expect(r.ok && r.segments).toEqual([key('a b')])
  })

  it('distinguishes ["0"] from [0]', () => {
    const r = parsePath('data["0"][0]', 'data')
    expect(r.ok && r.segments).toEqual([key('0'), idx(0)])
  })

  it('accepts both quote styles in either bracket format', () => {
    const a = parsePath("data['a']", 'data')
    const b = parsePath('$["a"]', 'data')
    expect(a.ok && a.segments).toEqual([key('a')])
    expect(b.ok && b.segments).toEqual([key('a')])
  })

  it('is lenient with unquoted hyphenated names in JSONPath', () => {
    const r = parsePath('$.first-name.x', 'data')
    expect(r.ok && r.segments).toEqual([key('first-name'), key('x')])
  })

  it('treats a lone / as the empty-string key', () => {
    const r = parsePath('/', 'data')
    expect(r.ok && r.segments).toEqual([{ kind: 'token', text: '' }])
  })

  it('rejects malformed input with a message', () => {
    const bads = ['data[', 'data[0', 'data["a', 'data.', 'data[x]', '$.a..b', '$.*', '/a~2', 'data["a"]x', '']
    for (const bad of bads) {
      const r = parsePath(bad, 'data')
      expect(r.ok, bad).toBe(false)
      if (!r.ok) expect(r.message.length).toBeGreaterThan(0)
    }
  })
})

describe('resolvePath', () => {
  const doc = parse(
    '{"users":[{"name":"a","emial":null},{"first-name":"b"}],"0":"zero","list":[1,2,3],"s":"str","":"empty"}',
  )
  if (!doc.ok) throw new Error('fixture')
  const root = doc.node
  const run = (text: string) => {
    const p = parsePath(text, 'data')
    if (!p.ok) throw new Error(p.message)
    return resolvePath(root, p.segments)
  }

  it('resolves to the node and its child positions', () => {
    const result = run('data.users[1]["first-name"]')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.node).toEqual({ type: 'string', value: 'b' })
    expect(result.positions).toEqual([0, 1, 0])
    expect(result.segments).toEqual([key('users'), idx(1), key('first-name')])
  })

  it('resolves pointer tokens by container type', () => {
    const a = run('/0')
    expect(a.ok && a.segments).toEqual([key('0')])
    const b = run('/list/2')
    expect(b.ok && b.segments).toEqual([key('list'), idx(2)])
    const c = run('/')
    expect(c.ok && c.segments).toEqual([key('')])
  })

  it('resolves the root with zero segments', () => {
    const result = run('data')
    expect(result.ok && result.positions).toEqual([])
  })

  it('reports the deepest matched prefix and the failing Key', () => {
    const result = run('data.users[0].email')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.matched).toEqual([key('users'), idx(0)])
    expect(describeFailure(result, 'js', 'data')).toBe('matched up to `data.users[0]`; no Key `email`')
  })

  it('reports out-of-range Indexes', () => {
    const result = run('data.list[7]')
    if (result.ok) throw new Error('expected failure')
    expect(describeFailure(result, 'js', 'data')).toBe('matched up to `data.list`; no Index 7 (array has 3 items)')
  })

  it('reports key-vs-index mismatches', () => {
    const a = run('data.list.x')
    const b = run('data[0]')
    const c = run('data.s.x')
    if (a.ok || b.ok || c.ok) throw new Error('expected failures')
    expect(describeFailure(a, 'js', 'data')).toBe(
      'matched up to `data.list`; `data.list` is an array, so Key `x` cannot be read',
    )
    expect(describeFailure(b, 'js', 'data')).toBe(
      'matched up to `data`; `data` is an object, so Index 0 cannot be read',
    )
    expect(describeFailure(c, 'js', 'data')).toBe(
      'matched up to `data.s`; `data.s` is a string, so Key `x` cannot be read',
    )
  })

  it('names the root when nothing matched in JSON Pointer', () => {
    const result = run('/nope')
    if (result.ok) throw new Error('expected failure')
    expect(describeFailure(result, 'pointer', 'data')).toBe('matched up to `(root)`; no Key `nope`')
  })

  it('formats the matched prefix in the given format', () => {
    const result = run('$.users[0].email')
    if (result.ok) throw new Error('expected failure')
    expect(describeFailure(result, 'jsonpath', 'data')).toBe('matched up to `$.users[0]`; no Key `email`')
    expect(describeFailure(result, 'pointer', 'data')).toBe('matched up to `/users/0`; no Key `email`')
  })
})
