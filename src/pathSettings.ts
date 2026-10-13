import { useState } from 'react'
import { DEFAULT_ROOT_NAME, type PathFormat } from './path'

const FORMAT_KEY = 'json-tree.pathFormat'
const ROOT_NAME_KEY = 'json-tree.rootName'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage unavailable: the setting just won't be remembered.
  }
}

/** Path Format and JS root name, remembered across sessions. */
export function usePathSettings() {
  const [format, setFormatState] = useState<PathFormat>(() => {
    const saved = read(FORMAT_KEY)
    return saved === 'jsonpath' || saved === 'pointer' ? saved : 'js'
  })
  const [rootName, setRootNameState] = useState(() => read(ROOT_NAME_KEY) || DEFAULT_ROOT_NAME)

  return {
    format,
    rootName,
    setFormat: (next: PathFormat) => {
      setFormatState(next)
      write(FORMAT_KEY, next)
    },
    setRootName: (next: string) => {
      setRootNameState(next)
      write(ROOT_NAME_KEY, next)
    },
  }
}
