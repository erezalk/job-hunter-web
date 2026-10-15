import { useDraggable, useDroppable } from '@dnd-kit/core'
import { Badge, Box, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import type { BoardCard } from '../api/board'
import type { BoardColumnDef } from './boardColumns'
import { BoardCardView } from './BoardCardView'

// Where the dragged card would land: the destination column plus an
// insertion line before/after one visible card (none = empty column).
export interface DropIndicator {
  statusCode: string
  beforeApplicationId?: number
  afterApplicationId?: number
}

const insertionLine = (
  <Box sx={{ height: 3, borderRadius: 1.5, bgcolor: 'primary.main', flexShrink: 0, mx: 0.5 }} />
)

function DraggableCard({
  card,
  onOpen,
  onToggleStar,
  indicator,
}: {
  card: BoardCard
  onOpen: (applicationId: number) => void
  onToggleStar: (applicationId: number, starred: boolean) => void
  indicator: DropIndicator | null
}) {
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: card.applicationId,
    data: { statusCode: card.statusCode },
  })
  // Each card is also a drop target so the drop position within the column
  // can be derived from the card under the pointer.
  const { setNodeRef: setDropRef } = useDroppable({
    id: `card:${card.applicationId}`,
    data: { type: 'card', applicationId: card.applicationId, statusCode: card.statusCode },
  })
  const showBefore = indicator?.beforeApplicationId === card.applicationId
  const showAfter = indicator?.afterApplicationId === card.applicationId

  return (
    <>
    {showBefore && insertionLine}
    <Box
      ref={(node: HTMLElement | null) => {
        setDragRef(node)
        setDropRef(node)
      }}
      {...listeners}
      {...attributes}
      onClick={() => {
        if (!isDragging) onOpen(card.applicationId)
      }}
      sx={{
        touchAction: 'none',
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        zIndex: isDragging ? 10 : undefined,
        position: 'relative',
      }}
    >
      <BoardCardView card={card} dragging={isDragging} onToggleStar={onToggleStar} />
    </Box>
    {showAfter && insertionLine}
    </>
  )
}

export function BoardColumn({
  column,
  cards,
  onOpenCard,
  onToggleStar,
  dropIndicator,
}: {
  column: BoardColumnDef
  cards: BoardCard[]
  onOpenCard: (applicationId: number) => void
  onToggleStar: (applicationId: number, starred: boolean) => void
  dropIndicator: DropIndicator | null
}) {
  const { setNodeRef } = useDroppable({ id: column.code, data: { type: 'column' } })
  const isOver = dropIndicator !== null

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        flex: '1 1 260px',
        minWidth: 260,
        maxWidth: 360,
        height: '100%',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 0.5, mb: 1.5 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          {column.label}
        </Typography>
        <Badge
          badgeContent={cards.length}
          color="default"
          sx={{
            '& .MuiBadge-badge': {
              position: 'static',
              transform: 'none',
              bgcolor: (theme) => alpha(theme.palette.text.primary, 0.08),
              color: 'text.secondary',
            },
          }}
        />
      </Box>
      <Box
        ref={setNodeRef}
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          p: 1,
          borderRadius: 2,
          bgcolor: (theme) => (isOver ? theme.palette.action.hover : alpha(theme.palette.text.primary, 0.03)),
          border: isOver ? '2px dashed' : '2px dashed transparent',
          borderColor: isOver ? 'primary.main' : 'transparent',
          minHeight: 200,
          overflowY: 'auto',
          transition: 'background-color 120ms ease, border-color 120ms ease',
        }}
      >
        {cards.map((card) => (
          <DraggableCard
            key={card.applicationId}
            card={card}
            onOpen={onOpenCard}
            onToggleStar={onToggleStar}
            indicator={dropIndicator}
          />
        ))}
        {cards.length === 0 && (
          <Typography variant="caption" color="text.disabled" sx={{ textAlign: 'center', mt: 2 }}>
            No tickets
          </Typography>
        )}
      </Box>
    </Box>
  )
}
