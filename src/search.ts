import type { JsonNode } from './parser'

export interface Match {
  /** Child positions from the root, as accepted by `locate`. */
  positions: number[]
  /** Which part of the row matched: its Key or its value. */
  part: 'key' | 'value'
}

/** Case-insensitive literal matcher; regex case folding keeps offsets aligned with the original text. */
function matcher(query: string, flags: string): RegExp {
  const literal = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(literal, `i${flags}u`)
}

/** Text a primitive is searched by: strings by value, numbers by source text. */
function valueText(node: JsonNode): string | null {
  switch (node.type) {
    case 'string':
      return node.value
    case 'number':
      return node.source
    case 'boolean':
      return String(node.value)
    case 'null':
      return 'null'
    default:
      return null
  }
}

/** Case-insensitive plain-text matches over Keys and primitive values, in document order. */
export function findMatches(root: JsonNode, query: string): Match[] {
  if (query === '') return []
  const re = matcher(query, '')
  const matches: Match[] = []

  const visit = (node: JsonNode, positions: number[], key: string | null) => {
    if (key !== null && re.test(key)) matches.push({ positions, part: 'key' })
    const text = valueText(node)
    if (text !== null && re.test(text)) matches.push({ positions, part: 'value' })
    if (node.type === 'object') {
      node.entries.forEach((e, i) => visit(e.value, [...positions, i], e.key))
    } else if (node.type === 'array') {
      node.items.forEach((item, i) => visit(item, [...positions, i], null))
    }
  }

  visit(root, [], null)
  return matches
}

interface HighlightPart {
  text: string
  hit: boolean
}

/** Split text into alternating plain and matching parts for highlighting. */
export function splitHighlight(text: string, query: string): HighlightPart[] {
  if (query === '') return [{ text, hit: false }]
  const parts: HighlightPart[] = []
  let from = 0
  for (const m of text.matchAll(matcher(query, 'g'))) {
    if (m.index > from) parts.push({ text: text.slice(from, m.index), hit: false })
    parts.push({ text: m[0], hit: true })
    from = m.index + m[0].length
  }
  if (from < text.length || parts.length === 0) parts.push({ text: text.slice(from), hit: false })
  return parts
}
