export interface BoardColumnDef {
  code: string
  label: string
}

// Fixed Board columns, in display order. The backend's application_statuses
// table is the source of truth for valid codes; this just controls layout
// and the (occasionally different) display label — e.g. INTERVIEW_PROCESS
// shows as "Interview".
export const BOARD_COLUMNS: BoardColumnDef[] = [
  { code: 'NEW', label: 'New' },
  { code: 'CV_SENT', label: 'CV Sent' },
  { code: 'INTERVIEW_PROCESS', label: 'Interview' },
  { code: 'OFFER', label: 'Offer' },
  { code: 'REJECTED', label: 'Rejected' },
  { code: 'ARCHIVED', label: 'Archived' },
  { code: 'LOW_MATCH', label: 'Low Match' },
]

// Low Match is an optional column: hidden unless the user turns it on in
// Settings → Board. Applications in it keep their status either way.
export const DEFAULT_VISIBLE_COLUMN_CODES: string[] = BOARD_COLUMNS.filter((c) => c.code !== 'LOW_MATCH').map(
  (c) => c.code,
)
