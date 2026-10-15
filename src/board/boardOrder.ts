import type { MoveRequest } from '../api/applications'
import type { BoardCard } from '../api/board'

// Mirrors the backend move semantics on the flat Board list (whose relative
// order within a status is the column order): the card leaves its place,
// takes the destination status and lands before/after the anchor, or at the
// end of the destination column. Cards not involved (e.g. hidden by filters)
// keep their relative order.
export function applyMove(cards: BoardCard[], applicationId: number, request: MoveRequest): BoardCard[] {
  const moved = cards.find((card) => card.applicationId === applicationId)
  if (!moved) return cards
  const rest = cards.filter((card) => card.applicationId !== applicationId)
  const updated = { ...moved, statusCode: request.statusCode }

  const anchorId = request.beforeApplicationId ?? request.afterApplicationId
  let index = -1
  if (anchorId !== undefined) {
    const anchorIndex = rest.findIndex((card) => card.applicationId === anchorId)
    if (anchorIndex >= 0) index = request.beforeApplicationId !== undefined ? anchorIndex : anchorIndex + 1
  }
  if (index < 0) {
    const lastInColumn = rest.map((card) => card.statusCode).lastIndexOf(request.statusCode)
    index = lastInColumn >= 0 ? lastInColumn + 1 : rest.length
  }
  return [...rest.slice(0, index), updated, ...rest.slice(index)]
}

// True when the move would leave the Board exactly as it is.
export function isNoOpMove(cards: BoardCard[], applicationId: number, request: MoveRequest): boolean {
  const next = applyMove(cards, applicationId, request)
  return next.every((card, i) => card.applicationId === cards[i].applicationId && card.statusCode === cards[i].statusCode)
}
