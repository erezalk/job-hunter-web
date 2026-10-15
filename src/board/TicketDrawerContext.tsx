import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { TicketDrawer } from './TicketDrawer'

type CompanyFilterHandler = (companyName: string) => void

interface TicketDrawerContextValue {
  openTicket: (applicationId: number) => void
  closeTicket: () => void
  // The Board registers how the drawer's company link filters it; elsewhere
  // there is none and the company renders as plain text.
  setCompanyFilterHandler: (handler: CompanyFilterHandler | null) => void
}

const TicketDrawerContext = createContext<TicketDrawerContextValue | undefined>(undefined)

// The one Ticket Drawer for the whole app: Board cards and the header's
// upcoming-stages list both open tickets through openTicket(applicationId).
export function TicketDrawerProvider({ children }: { children: ReactNode }) {
  const [applicationId, setApplicationId] = useState<number | null>(null)
  const [companyFilterHandler, setHandlerState] = useState<CompanyFilterHandler | null>(null)

  const openTicket = useCallback((id: number) => setApplicationId(id), [])
  const closeTicket = useCallback(() => setApplicationId(null), [])
  const setCompanyFilterHandler = useCallback(
    (handler: CompanyFilterHandler | null) => setHandlerState(() => handler),
    [],
  )
  const value = useMemo(
    () => ({ openTicket, closeTicket, setCompanyFilterHandler }),
    [openTicket, closeTicket, setCompanyFilterHandler],
  )

  return (
    <TicketDrawerContext.Provider value={value}>
      {children}
      <TicketDrawer
        applicationId={applicationId}
        onClose={closeTicket}
        onFilterByCompany={companyFilterHandler ?? undefined}
      />
    </TicketDrawerContext.Provider>
  )
}

export function useTicketDrawer(): TicketDrawerContextValue {
  const context = useContext(TicketDrawerContext)
  if (!context) {
    throw new Error('useTicketDrawer must be used within a TicketDrawerProvider')
  }
  return context
}

// Registers the Board's company-link behaviour for as long as it is mounted.
export function useCompanyFilterHandler(handler: CompanyFilterHandler) {
  const { setCompanyFilterHandler } = useTicketDrawer()
  const latest = useRef(handler)
  useEffect(() => {
    latest.current = handler
  })
  useEffect(() => {
    setCompanyFilterHandler((companyName) => latest.current(companyName))
    return () => setCompanyFilterHandler(null)
  }, [setCompanyFilterHandler])
}
