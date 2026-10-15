import { useState } from 'react'
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined'
import { Badge, Box, IconButton, List, ListItemButton, Popover, Tooltip, Typography } from '@mui/material'
import { useTicketDrawer } from '../board/TicketDrawerContext'
import { formatUpcomingTime } from './upcomingStages'
import { useUpcomingStages } from './useUpcomingStages'

// Header bell: a red dot while at least one future stage is scheduled; the
// popover lists them nearest first. Picking one opens its ticket in the
// shared Ticket Drawer — it never touches Board filters or columns.
export function UpcomingStagesBell() {
  const { upcoming, isLoading, isError, refresh } = useUpcomingStages()
  const { openTicket } = useTicketDrawer()
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  // "Now" as of opening the list, for Today/Tomorrow labels.
  const [openedAt, setOpenedAt] = useState(0)
  const open = anchorEl !== null

  function handleOpen(event: React.MouseEvent<HTMLElement>) {
    refresh()
    setOpenedAt(Date.now())
    setAnchorEl(event.currentTarget)
  }

  // Escape / click-away hand focus back to the bell. After picking a stage
  // focus must go to the drawer instead, so the popover never restores it.
  function handleDismiss() {
    anchorEl?.focus()
    setAnchorEl(null)
  }

  function handleSelect(applicationId: number) {
    setAnchorEl(null)
    openTicket(applicationId)
  }

  const now = new Date(openedAt)

  return (
    <>
      <Tooltip title="Upcoming stages">
        <IconButton
          size="small"
          aria-label="Upcoming stages"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={handleOpen}
          sx={{ color: 'text.secondary' }}
        >
          <Badge variant="dot" color="error" invisible={upcoming.length === 0} data-testid="upcoming-stages-dot">
            <NotificationsNoneOutlinedIcon />
          </Badge>
        </IconButton>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleDismiss}
        disableRestoreFocus
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 340, maxWidth: 'calc(100vw - 32px)', maxHeight: 'min(420px, calc(100vh - 96px))' } } }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700, px: 2, pt: 1.5, pb: 1 }}>
          Upcoming stages
        </Typography>
        {upcoming.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ px: 2, pb: 2 }}>
            {isLoading ? 'Loading…' : isError ? 'Could not load upcoming stages' : 'No upcoming stages'}
          </Typography>
        ) : (
          <List dense disablePadding sx={{ pb: 0.5 }}>
            {upcoming.map((stage) => (
              <ListItemButton
                key={stage.stageId}
                onClick={() => handleSelect(stage.applicationId)}
                sx={{ display: 'block', px: 2, py: 1 }}
              >
                <Typography variant="body2" noWrap sx={{ fontWeight: 600 }} title={stage.stageName}>
                  {stage.stageName}
                </Typography>
                <Box>
                  <Typography variant="caption" color="text.secondary" component="div" noWrap>
                    {stage.companyName ? `${stage.jobTitle} · ${stage.companyName}` : stage.jobTitle}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" component="div">
                    {formatUpcomingTime(stage.scheduledAt, now)}
                  </Typography>
                </Box>
              </ListItemButton>
            ))}
          </List>
        )}
      </Popover>
    </>
  )
}
