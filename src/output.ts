import { copyToClipboard } from './clipboard'
import type { JsonNode } from './parser'
import { serialize } from './serialize'

/** Minimal slice of the File System Access API used for save in place. */
export interface SaveHandle {
  name: string
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>
}

type SavePicker = (options: {
  suggestedName: string
  types: { description: string; accept: Record<string, string[]> }[]
}) => Promise<SaveHandle>

const FILE_NAME = 'document.json'

function savePicker(): SavePicker | null {
  const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker
  return typeof picker === 'function' ? picker.bind(window) : null
}

export function canSaveInPlace(): boolean {
  return savePicker() !== null
}

export function copyDocument(root: JsonNode): Promise<boolean> {
  return copyToClipboard(serialize(root))
}

export function downloadDocument(root: JsonNode): void {
  const url = URL.createObjectURL(new Blob([serialize(root)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = FILE_NAME
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * Write the Document to `handle`, asking the user to pick a file first when there is none.
 * Resolves null when the user cancels the picker.
 */
export async function saveInPlace(root: JsonNode, handle: SaveHandle | null): Promise<SaveHandle | null> {
  const picker = savePicker()
  if (!handle && !picker) throw new Error('Save in place is not supported in this browser')
  let target = handle
  if (!target) {
    try {
      target = await picker!({
        suggestedName: FILE_NAME,
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return null
      throw e
    }
  }
  const writable = await target.createWritable()
  await writable.write(serialize(root))
  await writable.close()
  return target
}
