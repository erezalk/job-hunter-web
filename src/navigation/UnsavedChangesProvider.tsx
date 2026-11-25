import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material'
import { UnsavedChangesContext } from './unsavedChangesContext'

/**
 * In-app "leave with unsaved changes?" guard. The app uses a declarative
 * BrowserRouter (no data router, so no useBlocker): every in-app way to leave
 * an editor goes through {@link useConfirmLeave} instead — the main navigation,
 * logging out and switching Settings tabs. Reloading or closing the tab is
 * covered by the browser's own beforeunload prompt (see useUnsavedChanges in
 * unsavedChangesContext.ts).
 */
export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const dirty = useRef(new Set<symbol>())
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null)

  const setDirty = useCallback((id: symbol, isDirty: boolean) => {
    if (isDirty) dirty.current.add(id)
    else dirty.current.delete(id)
  }, [])

  const confirmLeave = useCallback((leave: () => void) => {
    if (dirty.current.size === 0) leave()
    else setPendingLeave(() => leave)
  }, [])

  function discard() {
    const leave = pendingLeave
    setPendingLeave(null)
    dirty.current.clear()
    leave?.()
  }

  const value = useMemo(() => ({ setDirty, confirmLeave }), [setDirty, confirmLeave])

  return (
    <UnsavedChangesContext.Provider value={value}>
      {children}
      <Dialog open={pendingLeave !== null} onClose={() => setPendingLeave(null)}>
        <DialogTitle>Discard unsaved changes?</DialogTitle>
        <DialogContent>
          <DialogContentText>You have changes that have not been saved. If you leave now, they will be lost.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingLeave(null)} autoFocus>
            Keep editing
          </Button>
          <Button color="error" onClick={discard}>
            Discard changes
          </Button>
        </DialogActions>
      </Dialog>
    </UnsavedChangesContext.Provider>
  )
}
