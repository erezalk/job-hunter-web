import { useMutation, useQueryClient } from '@tanstack/react-query'
import { setApplicationStarred, type Application } from '../api/applications'
import type { BoardCard } from '../api/board'

// Star toggles and Board moves share one scope so they reach the server in
// the order the user performed them.
export const BOARD_WRITE_SCOPE = 'board-write'

// One star mutation for the Board card and the Ticket Drawer. Optimistic:
// the card and the application cache flip immediately; a failure restores
// that ticket's previous value. Requests per ticket run one after another
// (scope), so rapid clicks end in the last value the user chose.
export function useStarToggle(onError: (message: string) => void) {
  const queryClient = useQueryClient()

  function apply(applicationId: number, starred: boolean) {
    queryClient.setQueryData<BoardCard[]>(['board'], (old) =>
      old?.map((card) => (card.applicationId === applicationId ? { ...card, starred } : card)),
    )
    queryClient.setQueryData<Application>(['application', applicationId], (old) => (old ? { ...old, starred } : old))
  }

  const mutation = useMutation({
    mutationFn: ({ applicationId, starred }: { applicationId: number; starred: boolean }) =>
      setApplicationStarred(applicationId, starred),
    scope: { id: BOARD_WRITE_SCOPE },
    onMutate: async ({ applicationId, starred }) => {
      await queryClient.cancelQueries({ queryKey: ['board'] })
      apply(applicationId, starred)
    },
    onError: (_err, { applicationId, starred }) => {
      apply(applicationId, !starred)
      onError('Could not update the star. It has been restored.')
    },
    onSettled: () => {
      if (queryClient.isMutating({ predicate: (m) => m.options.scope?.id === BOARD_WRITE_SCOPE }) <= 1) {
        queryClient.invalidateQueries({ queryKey: ['board'] })
      }
    },
  })

  return (applicationId: number, currentlyStarred: boolean) =>
    mutation.mutate({ applicationId, starred: !currentlyStarred })
}
