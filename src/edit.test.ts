import { describe, expect, it } from 'vitest'
import {
  addNode,
  addTarget,
  childTarget,
  commit,
  convertType,
  createHistory,
  deleteAt,
  diffAgainstBaseline,
  editPrimitive,
  getAt,
  redo,
  renameKey,
  replaceAt,
  undo,
} from './edit'
import { parse, type JsonNode } from './parser'
import { serialize } from './serialize'

function doc(text: string): JsonNode {
  const r = parse(text)
  if (!r.ok) throw new Error(r.error.message)
  return r.node
}

function ok<T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> {
  if (!r.ok) throw new Error(JSON.stringify(r))
  return r as Extract<T, { ok: true }>
}

const compact = (n: JsonNode) => JSON.stringify(JSON.parse(serialize(n)))

describe('editPrimitive', () => {
  it('keeps the type and rejects invalid input', () => {
    expect(ok(editPrimitive({ type: 'string', value: 'a' }, 'b')).node).toEqual({ type: 'string', value: 'b' })
    expect(editPrimitive({ type: 'number', source: '1' }, 'abc').ok).toBe(false)
    expect(editPrimitive({ type: 'number', source: '1' }, '01').ok).toBe(false)
    expect(editPrimitive({ type: 'boolean', value: true }, 'yes').ok).toBe(false)
    expect(ok(editPrimitive({ type: 'boolean', value: true }, ' false ')).node).toEqual({ type: 'boolean', value: false })
  })

  it('stores the typed number text as the new source', () => {
    expect(ok(editPrimitive({ type: 'number', source: '1' }, '1.50e3')).node).toEqual({
      type: 'number',
      source: '1.50e3',
    })
  })
})

describe('convertType', () => {
  it('carries values between primitives where sensible', () => {
    expect(convertType({ type: 'number', source: '1.0' }, 'string')).toEqual({ type: 'string', value: '1.0' })
    expect(convertType({ type: 'string', value: '42' }, 'number')).toEqual({ type: 'number', source: '42' })
    expect(convertType({ type: 'string', value: 'hi' }, 'number')).toEqual({ type: 'number', source: '0' })
    expect(convertType({ type: 'string', value: 'true' }, 'boolean')).toEqual({ type: 'boolean', value: true })
    expect(convertType({ type: 'boolean', value: true }, 'number')).toEqual({ type: 'number', source: '1' })
  })

  it('discards the old value when converting to object or array', () => {
    expect(convertType({ type: 'string', value: 'x' }, 'object')).toEqual({ type: 'object', entries: [] })
    expect(convertType(doc('{"a":1}'), 'array')).toEqual({ type: 'array', items: [] })
  })

  it('leaves the Node alone when the type is unchanged', () => {
    const n: JsonNode = { type: 'number', source: '1.0' }
    expect(convertType(n, 'number')).toBe(n)
  })
})

describe('structure edits', () => {
  it('renames a Key in place, keeping order', () => {
    const root = doc('{"a":1,"b":2}')
    expect(compact(ok(renameKey(root, [0], 'z')).root)).toBe('{"z":1,"b":2}')
  })

  it('rejects a rename that collides with a sibling', () => {
    const r = renameKey(doc('{"a":1,"b":2}'), [0], 'b')
    expect(r.ok).toBe(false)
  })

  it('adds after the selection in arrays and at the end of objects', () => {
    const root = doc('{"list":[1,2],"o":{"k":1}}')
    const inArray = addTarget(root, [0, 0])!
    expect(inArray).toEqual({ container: [0], after: 0, needsKey: false })
    const added = ok(addNode(root, inArray, null))
    expect(added.positions).toEqual([0, 1])
    expect(compact(added.root)).toBe('{"list":[1,null,2],"o":{"k":1}}')

    const inObject = addTarget(root, [1, 0])!
    expect(inObject.needsKey).toBe(true)
    expect(compact(ok(addNode(root, inObject, 'n')).root)).toBe('{"list":[1,2],"o":{"k":1,"n":null}}')
    expect(addNode(root, inObject, 'k').ok).toBe(false)
  })

  it('adds a child to a selected container', () => {
    const root = doc('{"list":[1]}')
    expect(compact(ok(addNode(root, childTarget(root, [0])!, null)).root)).toBe('{"list":[1,null]}')
    expect(childTarget(root, [0, 0])).toBeNull()
    expect(addTarget(root, [])).toBeNull()
  })

  it('deletes a Node', () => {
    const root = doc('{"a":[1,2,3],"b":1}')
    expect(compact(deleteAt(root, [0, 1]))).toBe('{"a":[1,3],"b":1}')
    expect(compact(deleteAt(root, [1]))).toBe('{"a":[1,2,3]}')
  })
})

describe('number source text', () => {
  it('keeps untouched numbers byte-identical and replaces an edited one', () => {
    const root = doc('{"a":1.0,"b":2e5,"c":3}')
    const edited = replaceAt(root, [2], ok(editPrimitive(getAt(root, [2])!, '4.00')).node)
    expect(serialize(edited)).toBe('{\n  "a": 1.0,\n  "b": 2e5,\n  "c": 4.00\n}')
  })
})

describe('diffAgainstBaseline', () => {
  const base = doc('{"name":"x","tags":["a","b","c"],"o":{"k":1,"m":2}}')

  it('reports nothing for the Baseline itself', () => {
    const d = diffAgainstBaseline(base, base)
    expect(d.edited.size).toBe(0)
    expect(d.removed.size).toBe(0)
  })

  it('marks a changed value and its ancestors', () => {
    const next = replaceAt(base, [0], { type: 'string', value: 'y' })
    expect([...diffAgainstBaseline(base, next).edited].sort()).toEqual(['root', 'root/0'])
  })

  it('clears the mark when a value is edited back to the Baseline value', () => {
    const changed = replaceAt(base, [0], { type: 'string', value: 'y' })
    const back = replaceAt(changed, [0], { type: 'string', value: 'x' })
    expect(diffAgainstBaseline(base, back).edited.size).toBe(0)
  })

  it('counts removed children on a container and marks it edited', () => {
    const next = deleteAt(base, [2, 0])
    const d = diffAgainstBaseline(base, next)
    expect(d.removed.get('root/2')).toBe(1)
    expect(d.edited.has('root/2')).toBe(true)
    expect(d.edited.has('root/2/0')).toBe(false)
  })

  it('does not mark shifted array items as edited after a delete', () => {
    const next = deleteAt(base, [1, 0])
    const d = diffAgainstBaseline(base, next)
    expect(d.removed.get('root/1')).toBe(1)
    expect(d.edited.has('root/1/0')).toBe(false)
    expect(d.edited.has('root/1/1')).toBe(false)
  })

  it('counts one removal when an item is deleted and a later one edited', () => {
    const next = replaceAt(deleteAt(base, [1, 0]), [1, 1], { type: 'string', value: 'c2' })
    const d = diffAgainstBaseline(base, next)
    expect(d.removed.get('root/1')).toBe(1)
    expect(d.edited.has('root/1/1')).toBe(true)
  })

  it('treats retyping the same value as no change', () => {
    const same = ok(editPrimitive(getAt(base, [0])!, 'x')).node
    expect(replaceAt(base, [0], same)).toBe(base)
  })

  it('marks added Nodes and renamed Keys', () => {
    const added = ok(addNode(base, addTarget(base, [1, 2])!, null)).root
    expect(diffAgainstBaseline(base, added).edited.has('root/1/3')).toBe(true)
    const renamed = ok(renameKey(base, [0], 'title')).root
    const d = diffAgainstBaseline(base, renamed)
    expect(d.edited.has('root/0')).toBe(true)
    expect(d.removed.get('root')).toBe(1)
  })

  it('marks a Node whose type changed', () => {
    const next = replaceAt(base, [0], convertType(getAt(base, [0])!, 'number'))
    expect(diffAgainstBaseline(base, next).edited.has('root/0')).toBe(true)
  })
})

describe('history', () => {
  it('undoes and redoes across operations, back to the Baseline clearing markers', () => {
    const base = doc('{"a":1,"b":[1,2]}')
    let h = createHistory(base)
    h = commit(h, replaceAt(h.present, [0], { type: 'number', source: '9' }))
    h = commit(h, deleteAt(h.present, [1, 0]))
    expect(diffAgainstBaseline(base, h.present).edited.size).toBeGreaterThan(0)

    h = undo(undo(h))
    expect(h.present).toBe(base)
    expect(diffAgainstBaseline(base, h.present).edited.size).toBe(0)

    h = redo(h)
    expect(serialize(h.present)).toContain('"a": 9')
  })

  it('drops the redo stack on a new edit and ignores empty undo/redo', () => {
    const base = doc('[1]')
    let h = createHistory(base)
    expect(undo(h)).toBe(h)
    expect(redo(h)).toBe(h)
    h = commit(h, replaceAt(base, [0], { type: 'number', source: '2' }))
    h = undo(h)
    h = commit(h, replaceAt(base, [0], { type: 'number', source: '3' }))
    expect(h.future).toEqual([])
  })
})
