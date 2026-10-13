import type { JsonNode } from './parser'

/** Pretty-print a Node with 2-space indent, keeping Key order and number source text. */
export function serialize(node: JsonNode, indent = ''): string {
  switch (node.type) {
    case 'string':
      return JSON.stringify(node.value)
    case 'number':
      return node.source
    case 'boolean':
      return String(node.value)
    case 'null':
      return 'null'
    case 'array': {
      if (node.items.length === 0) return '[]'
      const inner = `${indent}  `
      const items = node.items.map((item) => `${inner}${serialize(item, inner)}`)
      return `[\n${items.join(',\n')}\n${indent}]`
    }
    case 'object': {
      if (node.entries.length === 0) return '{}'
      const inner = `${indent}  `
      const entries = node.entries.map(
        (e) => `${inner}${JSON.stringify(e.key)}: ${serialize(e.value, inner)}`,
      )
      return `{\n${entries.join(',\n')}\n${indent}}`
    }
  }
}

/** Text placed on the clipboard by "Copy value": strings raw, everything else as JSON. */
export function copyText(node: JsonNode): string {
  return node.type === 'string' ? node.value : serialize(node)
}
