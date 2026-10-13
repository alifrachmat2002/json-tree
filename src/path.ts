import type { JsonNode } from './parser'

export type PathFormat = 'js' | 'jsonpath' | 'pointer'

export const PATH_FORMATS: { id: PathFormat; label: string }[] = [
  { id: 'js', label: 'JavaScript' },
  { id: 'jsonpath', label: 'JSONPath' },
  { id: 'pointer', label: 'JSON Pointer' },
]

export const DEFAULT_ROOT_NAME = 'data'

export type Segment = { kind: 'key'; key: string } | { kind: 'index'; index: number }

/** A JSON Pointer token is a Key or an Index depending on the container it lands in. */
export type ParsedSegment = Segment | { kind: 'token'; text: string }

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/
const INDEX_TEXT = /^(?:0|[1-9]\d*)$/

const CONTROL_ESCAPES: Record<string, string> = {
  '\b': '\\b',
  '\f': '\\f',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
}

function quote(text: string, quoteChar: '"' | "'"): string {
  let out = quoteChar
  for (const ch of text) {
    if (ch === '\\' || ch === quoteChar) out += `\\${ch}`
    else if (CONTROL_ESCAPES[ch]) out += CONTROL_ESCAPES[ch]
    else if (ch < ' ') out += `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`
    else out += ch
  }
  return out + quoteChar
}

export function formatRoot(format: PathFormat, rootName = DEFAULT_ROOT_NAME): string {
  return format === 'js' ? rootName : format === 'jsonpath' ? '$' : ''
}

export function formatSegment(segment: Segment, format: PathFormat): string {
  if (format === 'pointer') {
    const text = segment.kind === 'index' ? String(segment.index) : segment.key
    return `/${text.replace(/~/g, '~0').replace(/\//g, '~1')}`
  }
  if (segment.kind === 'index') return `[${segment.index}]`
  if (IDENTIFIER.test(segment.key)) return `.${segment.key}`
  return `[${quote(segment.key, format === 'js' ? '"' : "'")}]`
}

export function formatPath(
  segments: Segment[],
  format: PathFormat,
  rootName = DEFAULT_ROOT_NAME,
): string {
  return formatRoot(format, rootName) + segments.map((s) => formatSegment(s, format)).join('')
}

export function detectFormat(text: string): PathFormat {
  const first = text.trimStart()[0]
  return first === '$' ? 'jsonpath' : first === '/' ? 'pointer' : 'js'
}

export type ParsePathResult =
  | { ok: true; format: PathFormat; segments: ParsedSegment[] }
  | { ok: false; format: PathFormat; message: string }

export function parsePath(input: string, rootName = DEFAULT_ROOT_NAME): ParsePathResult {
  const text = input.trim()
  const format = detectFormat(text)
  if (text === '') return { ok: false, format, message: 'Enter a Path' }
  try {
    const segments =
      format === 'pointer' ? parsePointer(text) : parseAccessor(text, format, rootName)
    return { ok: true, format, segments }
  } catch (e) {
    if (e instanceof PathSyntaxError) return { ok: false, format, message: e.message }
    throw e
  }
}

class PathSyntaxError extends Error {}

function parsePointer(text: string): ParsedSegment[] {
  return text
    .slice(1)
    .split('/')
    .map((token) => {
      if (/~(?![01])/.test(token)) throw new PathSyntaxError(`Invalid escape in "${token}": ~ must be ~0 or ~1`)
      return { kind: 'token', text: token.replace(/~1/g, '/').replace(/~0/g, '~') }
    })
}

const ESCAPES: Record<string, string> = {
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
  '/': '/',
  '\\': '\\',
  '"': '"',
  "'": "'",
}

function parseAccessor(text: string, format: 'js' | 'jsonpath', rootName: string): ParsedSegment[] {
  let pos = 0
  if (format === 'jsonpath') {
    pos = 1
  } else if (
    rootName !== '' &&
    text.startsWith(rootName) &&
    (text.length === rootName.length || '.['.includes(text[rootName.length]))
  ) {
    pos = rootName.length
  }

  const segments: ParsedSegment[] = []
  const fail = (message: string): never => {
    throw new PathSyntaxError(`${message} at position ${pos + 1}`)
  }

  const readName = (): string => {
    const re = format === 'js' ? /[A-Za-z_$][A-Za-z0-9_$]*/y : /[^.[\]\s]+/y
    re.lastIndex = pos
    const m = re.exec(text)
    if (!m) return fail(format === 'js' ? 'Expected a name' : 'Expected a name or ["Key"]')
    if (m[0] === '*') fail('Wildcards are not supported')
    pos += m[0].length
    return m[0]
  }

  const readQuoted = (quoteChar: string): string => {
    pos++
    let out = ''
    while (pos < text.length) {
      const ch = text[pos]
      if (ch === quoteChar) {
        pos++
        return out
      }
      if (ch === '\\') {
        const next = text[pos + 1]
        if (next === 'u') {
          const hex = text.slice(pos + 2, pos + 6)
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) return fail('Invalid \\u escape')
          out += String.fromCharCode(parseInt(hex, 16))
          pos += 6
        } else if (next !== undefined && next in ESCAPES) {
          out += ESCAPES[next]
          pos += 2
        } else {
          return fail('Invalid escape')
        }
      } else {
        out += ch
        pos++
      }
    }
    return fail('Unterminated string')
  }

  // First segment of a JS accessor without a root name may be a bare name.
  if (format === 'js' && pos === 0 && text[0] !== '[' && text[0] !== '.') {
    segments.push({ kind: 'key', key: readName() })
  }

  while (pos < text.length) {
    const ch = text[pos]
    if (ch === '.') {
      if (text[pos + 1] === '.') fail('Recursive descent (..) is not supported')
      pos++
      segments.push({ kind: 'key', key: readName() })
    } else if (ch === '[') {
      pos++
      const open = text[pos]
      if (open === '"' || open === "'") {
        segments.push({ kind: 'key', key: readQuoted(open) })
      } else {
        const m = /\d+/y
        m.lastIndex = pos
        const digits = m.exec(text)
        if (!digits) {
          if (open === '*') fail('Wildcards are not supported')
          fail('Expected a number or quoted Key')
        } else {
          if (!INDEX_TEXT.test(digits[0])) fail('Index has leading zeros')
          pos += digits[0].length
          segments.push({ kind: 'index', index: Number(digits[0]) })
        }
      }
      if (text[pos] !== ']') fail('Expected ]')
      pos++
    } else {
      fail(`Unexpected "${ch}"`)
    }
  }
  return segments
}

export type ResolvePathResult =
  | {
      ok: true
      node: JsonNode
      /** The Path with pointer tokens resolved to Keys and Indexes. */
      segments: Segment[]
      /** Child position (entry index or item index) taken at each step. */
      positions: number[]
    }
  | {
      ok: false
      /** The deepest prefix of the Path that exists in the Document. */
      matched: Segment[]
      failing: ParsedSegment
      problem: 'missing' | 'out-of-range' | 'wrong-container'
      /** Type of the Node where resolution stopped. */
      actual: JsonNode['type']
      itemCount: number
    }

export function resolvePath(root: JsonNode, path: ParsedSegment[]): ResolvePathResult {
  let node = root
  const segments: Segment[] = []
  const positions: number[] = []

  for (const segment of path) {
    const stop = (problem: 'missing' | 'out-of-range' | 'wrong-container'): ResolvePathResult => ({
      ok: false,
      matched: segments,
      failing: segment,
      problem,
      actual: node.type,
      itemCount: node.type === 'array' ? node.items.length : 0,
    })

    if (node.type === 'object') {
      if (segment.kind === 'index') return stop('wrong-container')
      const key = segment.kind === 'key' ? segment.key : segment.text
      const at = node.entries.findIndex((e) => e.key === key)
      if (at === -1) return stop('missing')
      segments.push({ kind: 'key', key })
      positions.push(at)
      node = node.entries[at].value
    } else if (node.type === 'array') {
      if (segment.kind === 'key') return stop('wrong-container')
      if (segment.kind === 'token' && !INDEX_TEXT.test(segment.text)) return stop('missing')
      const index = segment.kind === 'index' ? segment.index : Number(segment.text)
      if (index >= node.items.length) return stop('out-of-range')
      segments.push({ kind: 'index', index })
      positions.push(index)
      node = node.items[index]
    } else {
      return stop('wrong-container')
    }
  }
  return { ok: true, node, segments, positions }
}

type ResolveFailure = Extract<ResolvePathResult, { ok: false }>

function describeSegment(segment: ParsedSegment, actual: JsonNode['type']): string {
  if (segment.kind === 'key') return `Key \`${segment.key}\``
  if (segment.kind === 'index') return `Index ${segment.index}`
  return actual === 'array' ? `Index \`${segment.text}\`` : `Key \`${segment.text}\``
}

const ARTICLES: Record<string, string> = { object: 'an object', array: 'an array' }

export function describeFailure(
  failure: ResolveFailure,
  format: PathFormat,
  rootName = DEFAULT_ROOT_NAME,
): string {
  const prefix = formatPath(failure.matched, format, rootName) || '(root)'
  const what = describeSegment(failure.failing, failure.actual)
  const head = `matched up to \`${prefix}\`; `
  switch (failure.problem) {
    case 'missing':
      return `${head}no ${what}`
    case 'out-of-range':
      return `${head}no ${what} (array has ${failure.itemCount} items)`
    case 'wrong-container': {
      const article = ARTICLES[failure.actual] ?? `a ${failure.actual}`
      return `${head}\`${prefix}\` is ${article}, so ${what} cannot be read`
    }
  }
}
