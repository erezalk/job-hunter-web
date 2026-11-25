import { createContext, useContext, useEffect, useRef } from 'react'

export interface UnsavedChangesContextValue {
  /** Registers (dirty) or unregisters one editor's unsaved state. */
  setDirty: (id: symbol, dirty: boolean) => void
  /** Runs `leave` at once when nothing is unsaved; otherwise only after the user confirms discarding. */
  confirmLeave: (leave: () => void) => void
}

// Without a provider (e.g. a component rendered on its own) leaving is never blocked.
export const UnsavedChangesContext = createContext<UnsavedChangesContextValue>({
  setDirty: () => {},
  confirmLeave: (leave) => leave(),
})

/** Marks the calling editor as having unsaved changes while `dirty` is true (also arms the browser's leave-page prompt). */
export function useUnsavedChanges(dirty: boolean) {
  const { setDirty } = useContext(UnsavedChangesContext)
  const id = useRef(Symbol('unsaved-changes'))

  useEffect(() => {
    const key = id.current
    setDirty(key, dirty)
    return () => setDirty(key, false)
  }, [dirty, setDirty])

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      // Older browsers only show the prompt when returnValue is set.
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
}

export function useConfirmLeave() {
  return useContext(UnsavedChangesContext).confirmLeave
}
