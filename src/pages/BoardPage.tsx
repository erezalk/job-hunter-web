import { useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import { Alert, Box, Button, Paper, Snackbar, Typography } from '@mui/material'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type Active,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type Over,
} from '@dnd-kit/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { moveApplication, type MoveRequest } from '../api/applications'
import { fetchBoard, type BoardCard } from '../api/board'
import { fetchSettings } from '../api/settings'
import { AddJobDialog } from '../board/AddJobDialog'
import { BoardFilterBar } from '../board/BoardFilterBar'
import { companyOptions, EMPTY_FILTERS, filterCards, hasActiveFilters, resolveCompanyOption, type BoardFilters } from '../board/boardFilters'
import { BOARD_COLUMNS, DEFAULT_VISIBLE_COLUMN_CODES } from '../board/boardColumns'
import { applyMove, isNoOpMove } from '../board/boardOrder'
import { BoardColumn, type DropIndicator } from '../board/BoardColumn'
import { BOARD_WRITE_SCOPE, useStarToggle } from '../board/useStarToggle'
import { BoardCardView } from '../board/BoardCardView'
import { useCompanyFilterHandler, useTicketDrawer } from '../board/TicketDrawerContext'

const BOARD_QUERY_KEY = ['board']

// The pointer picks the destination column; inside it the card whose centre is
// vertically closest wins, so the gaps between cards and the space below the
// last card still resolve to a position. The dragged card itself is never a
// target. Outside every column there is no drop.
const boardCollision: CollisionDetection = (args) => {
  const column = pointerWithin(args).find((c) => args.droppableContainers.find((d) => d.id === c.id)?.data.current?.type === 'column')
  const pointer = args.pointerCoordinates
  if (!column || !pointer) return []
  let closest: { id: string | number; distance: number } | null = null
  for (const container of args.droppableContainers) {
    const data = container.data.current
    if (data?.type !== 'card' || data.statusCode !== column.id || data.applicationId === args.active.id) continue
    const rect = args.droppableRects.get(container.id)
    if (!rect) continue
    const distance = Math.abs(pointer.y - (rect.top + rect.height / 2))
    if (!closest || distance < closest.distance) closest = { id: container.id, distance }
  }
  return [{ id: closest ? closest.id : column.id }]
}

// Destination column + before/after anchor for the current drag position.
function resolveDrop(active: Active, over: Over): MoveRequest {
  const data = over.data.current
  if (data?.type !== 'card') return { statusCode: String(over.id) }
  const translated = active.rect.current.translated
  const centerY = translated ? translated.top + translated.height / 2 : over.rect.top
  const before = centerY < over.rect.top + over.rect.height / 2
  return before
    ? { statusCode: data.statusCode, beforeApplicationId: data.applicationId }
    : { statusCode: data.statusCode, afterApplicationId: data.applicationId }
}

export function BoardPage() {
  const queryClient = useQueryClient()
  const boardQuery = useQuery({ queryKey: BOARD_QUERY_KEY, queryFn: fetchBoard })
  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: fetchSettings })

  const [activeCard, setActiveCard] = useState<BoardCard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [addJobOpen, setAddJobOpen] = useState(false)
  const [filters, setFilters] = useState<BoardFilters>(EMPTY_FILTERS)

  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const toggleStar = useStarToggle(setError)
  const { openTicket, closeTicket } = useTicketDrawer()

  // One request moves a ticket: same column = order only, other column =
  // status change (with history) plus the drop position. Optimistic; a
  // failure restores the snapshot (or reloads when later moves are queued).
  const moveMutation = useMutation({
    mutationFn: ({ applicationId, request }: { applicationId: number; request: MoveRequest }) =>
      moveApplication(applicationId, request),
    scope: { id: BOARD_WRITE_SCOPE },
    onMutate: async ({ applicationId, request }) => {
      await queryClient.cancelQueries({ queryKey: BOARD_QUERY_KEY })
      const previous = queryClient.getQueryData<BoardCard[]>(BOARD_QUERY_KEY)
      queryClient.setQueryData<BoardCard[]>(BOARD_QUERY_KEY, (old) => old && applyMove(old, applicationId, request))
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous && queryClient.isMutating({ predicate: (m) => m.options.scope?.id === BOARD_WRITE_SCOPE }) <= 1) {
        queryClient.setQueryData(BOARD_QUERY_KEY, context.previous)
      }
      setError('Could not move the ticket. The board has been restored.')
    },
    onSettled: () => {
      if (queryClient.isMutating({ predicate: (m) => m.options.scope?.id === BOARD_WRITE_SCOPE }) <= 1) {
        queryClient.invalidateQueries({ queryKey: BOARD_QUERY_KEY })
      }
    },
  })

  function handleDragStart(event: DragStartEvent) {
    const card = boardQuery.data?.find((c) => c.applicationId === Number(event.active.id))
    setActiveCard(card ?? null)
  }

  function handleDragMove(event: DragMoveEvent) {
    const { active, over } = event
    const cards = boardQuery.data
    if (!over || !cards) return setDropIndicator(null)
    const request = resolveDrop(active, over)
    const next: DropIndicator | null = isNoOpMove(cards, Number(active.id), request) ? null : request
    setDropIndicator((prev) =>
      prev?.statusCode === next?.statusCode &&
      prev?.beforeApplicationId === next?.beforeApplicationId &&
      prev?.afterApplicationId === next?.afterApplicationId
        ? prev
        : next,
    )
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveCard(null)
    setDropIndicator(null)
    const cards = boardQuery.data
    if (!over || !cards) return

    const applicationId = Number(active.id)
    const request = resolveDrop(active, over)
    if (isNoOpMove(cards, applicationId, request)) return
    moveMutation.mutate({ applicationId, request })
  }

  function handleDragCancel() {
    setActiveCard(null)
    setDropIndicator(null)
  }

  // Column visibility is a pure presentation preference — it never touches
  // Application data. Default to the standard columns (Low Match excluded)
  // while settings are still loading, or if a user has no preference stored.
  const visibleCodes = settingsQuery.data?.visibleBoardStatuses ?? DEFAULT_VISIBLE_COLUMN_CODES
  const visibleColumns = BOARD_COLUMNS.filter((c) => visibleCodes.includes(c.code))

  // Filters only choose which cards are drawn. Company suggestions come from
  // ALL cards (including ones in hidden columns) so toggling column
  // visibility never changes the filter vocabulary.
  const allCards = boardQuery.data ?? []
  const companies = companyOptions(allCards)
  const activeFilters: BoardFilters = {
    ...filters,
    company: filters.company !== null && companies.includes(filters.company) ? filters.company : null,
  }
  const filtered = filterCards(allCards, activeFilters)
  const filtersActive = hasActiveFilters(activeFilters)
  const isVisible = (card: BoardCard) => visibleCodes.includes(card.statusCode)
  const shownCount = filtered.filter(isVisible).length
  const totalCount = allCards.filter(isVisible).length

  // The Ticket Drawer's company link filters this Board; only the existing
  // Company filter changes (to the Board's own spelling of the company).
  useCompanyFilterHandler((companyName) => {
    const company = resolveCompanyOption(companies, companyName)
    if (company !== null) setFilters((current) => ({ ...current, company }))
    closeTicket()
  })

  const cardsByColumn = new Map<string, BoardCard[]>(BOARD_COLUMNS.map((c) => [c.code, []]))
  for (const card of filtered) {
    cardsByColumn.get(card.statusCode)?.push(card)
  }

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          Board
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddJobOpen(true)}>
          Add Job
        </Button>
      </Box>

      {boardQuery.data && (
        <BoardFilterBar
          filters={activeFilters}
          companies={companies}
          shownCount={shownCount}
          totalCount={totalCount}
          onChange={setFilters}
          onClear={() => setFilters(EMPTY_FILTERS)}
        />
      )}

      {boardQuery.isLoading && <Typography color="text.secondary">Loading board…</Typography>}
      {boardQuery.isError && <Alert severity="error">Failed to load the board.</Alert>}

      {boardQuery.data && filtersActive && shownCount === 0 && (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
          <Typography sx={{ mb: 1.5 }}>No jobs match these filters.</Typography>
          <Button variant="outlined" onClick={() => setFilters(EMPTY_FILTERS)}>
            Clear filters
          </Button>
        </Paper>
      )}

      {boardQuery.data && !(filtersActive && shownCount === 0) && (
        <DndContext
          sensors={sensors}
          collisionDetection={boardCollision}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 2, alignItems: 'stretch', minHeight: 480 }}>
            {visibleColumns.map((column) => (
              <BoardColumn
                key={column.code}
                column={column}
                cards={cardsByColumn.get(column.code) ?? []}
                onOpenCard={openTicket}
                onToggleStar={toggleStar}
                dropIndicator={dropIndicator?.statusCode === column.code ? dropIndicator : null}
              />
            ))}
          </Box>
          <DragOverlay>{activeCard && <Box sx={{ width: 280 }}><BoardCardView card={activeCard} overlay /></Box>}</DragOverlay>
        </DndContext>
      )}

      <AddJobDialog open={addJobOpen} onClose={() => setAddJobOpen(false)} />

      <Snackbar open={error !== null} autoHideDuration={4000} onClose={() => setError(null)}>
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      </Snackbar>
    </>
  )
}
