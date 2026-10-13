export type JsonNode =
  | { type: 'object'; entries: { key: string; value: JsonNode }[] }
  | { type: 'array'; items: JsonNode[] }
  | { type: 'string'; value: string }
  | { type: 'number'; source: string }
  | { type: 'boolean'; value: boolean }
  | { type: 'null' }

export interface ParseError {
  message: string
  line: number
  column: number
  offset: number
}

export type ParseResult = { ok: true; node: JsonNode } | { ok: false; error: ParseError }

class ParseFailure extends Error {
  constructor(
    message: string,
    readonly offset: number,
  ) {
    super(message)
  }
}

const SIMPLE_ESCAPES: Record<string, string> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
}

const MAX_DEPTH = 512

const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y

class Parser {
  private pos = 0
  private depth = 0

  constructor(private readonly text: string) {}

  parseDocument(): JsonNode {
    this.skipWhitespace()
    const node = this.parseValue()
    this.skipWhitespace()
    if (this.pos < this.text.length) this.fail('Unexpected content after the JSON value')
    return node
  }

  private fail(message: string, offset = this.pos): never {
    throw new ParseFailure(message, offset)
  }

  private skipWhitespace() {
    while (/[ \t\n\r]/.test(this.text[this.pos] ?? '')) this.pos++
  }

  private parseValue(): JsonNode {
    const ch = this.text[this.pos]
    if (ch === undefined) this.fail('Unexpected end of input')
    if (ch === '"') return { type: 'string', value: this.parseString() }
    if (ch === '{' || ch === '[') {
      if (++this.depth > MAX_DEPTH) this.fail('Document is nested too deeply')
      const node = ch === '{' ? this.parseObject() : this.parseArray()
      this.depth--
      return node
    }
    if (ch === '-' || (ch >= '0' && ch <= '9')) return this.parseNumber()
    return this.parseLiteral()
  }

  private parseObject(): JsonNode {
    this.pos++ // {
    const entries: { key: string; value: JsonNode }[] = []
    const seen = new Set<string>()
    this.skipWhitespace()
    if (this.text[this.pos] === '}') {
      this.pos++
      return { type: 'object', entries }
    }
    for (;;) {
      this.skipWhitespace()
      if (this.text[this.pos] !== '"') this.fail('Expected a string Key')
      const keyOffset = this.pos
      const key = this.parseString()
      if (seen.has(key)) this.fail(`Duplicate Key ${JSON.stringify(key)}`, keyOffset)
      seen.add(key)
      this.skipWhitespace()
      if (this.text[this.pos] !== ':') this.fail("Expected ':' after Key")
      this.pos++
      this.skipWhitespace()
      entries.push({ key, value: this.parseValue() })
      this.skipWhitespace()
      const ch = this.text[this.pos]
      this.pos++
      if (ch === '}') return { type: 'object', entries }
      if (ch !== ',') this.fail("Expected ',' or '}'", this.pos - 1)
    }
  }

  private parseArray(): JsonNode {
    this.pos++ // [
    const items: JsonNode[] = []
    this.skipWhitespace()
    if (this.text[this.pos] === ']') {
      this.pos++
      return { type: 'array', items }
    }
    for (;;) {
      this.skipWhitespace()
      items.push(this.parseValue())
      this.skipWhitespace()
      const ch = this.text[this.pos]
      this.pos++
      if (ch === ']') return { type: 'array', items }
      if (ch !== ',') this.fail("Expected ',' or ']'", this.pos - 1)
    }
  }

  private parseLiteral(): JsonNode {
    for (const [word, node] of [
      ['true', { type: 'boolean', value: true }],
      ['false', { type: 'boolean', value: false }],
      ['null', { type: 'null' }],
    ] as const) {
      if (this.text.startsWith(word, this.pos)) {
        this.pos += word.length
        return node
      }
    }
    this.fail(`Unexpected character ${JSON.stringify(this.text[this.pos])}`)
  }

  private parseNumber(): JsonNode {
    NUMBER.lastIndex = this.pos
    const match = NUMBER.exec(this.text)
    if (!match) this.fail('Invalid number')
    this.pos += match[0].length
    return { type: 'number', source: match[0] }
  }

  private parseString(): string {
    const start = this.pos
    this.pos++ // opening quote
    let out = ''
    for (;;) {
      const ch = this.text[this.pos]
      if (ch === undefined) this.fail('Unterminated string', start)
      if (ch === '"') {
        this.pos++
        return out
      }
      if (ch < ' ') this.fail('Control character in string must be escaped')
      if (ch !== '\\') {
        out += ch
        this.pos++
        continue
      }
      const escape = this.text[this.pos + 1]
      if (escape === 'u') {
        const hex = this.text.slice(this.pos + 2, this.pos + 6)
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.fail('Invalid \\u escape', this.pos)
        out += String.fromCharCode(parseInt(hex, 16))
        this.pos += 6
      } else if (escape !== undefined && escape in SIMPLE_ESCAPES) {
        out += SIMPLE_ESCAPES[escape]
        this.pos += 2
      } else {
        this.fail('Invalid escape sequence', this.pos)
      }
    }
  }
}

export function parse(text: string): ParseResult {
  try {
    return { ok: true, node: new Parser(text).parseDocument() }
  } catch (e) {
    if (!(e instanceof ParseFailure)) throw e
    return { ok: false, error: locate(text, e.message, e.offset) }
  }
}

function locate(text: string, message: string, offset: number): ParseError {
  let line = 1
  let lineStart = 0
  for (let i = 0; i < offset; i++) {
    if (text[i] === '\n') {
      line++
      lineStart = i + 1
    }
  }
  return { message, line, column: offset - lineStart + 1, offset }
}
