import ViewKanbanOutlinedIcon from '@mui/icons-material/ViewKanbanOutlined'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'
import LogoutIcon from '@mui/icons-material/Logout'
import {
  AppBar,
  Avatar,
  Box,
  Divider,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
} from '@mui/material'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { TicketDrawerProvider } from '../board/TicketDrawerContext'
import { UpcomingStagesBell } from '../upcoming/UpcomingStagesBell'

const DRAWER_WIDTH = 240

const NAV_ITEMS = [
  { label: 'Board', path: '/board', icon: <ViewKanbanOutlinedIcon /> },
  { label: 'CV', path: '/cv', icon: <DescriptionOutlinedIcon /> },
  { label: 'Settings', path: '/settings', icon: <SettingsOutlinedIcon /> },
]

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  // Accounts created through sign-up have no name; show their email instead.
  const displayName = user?.fullName || user?.email || ''
  const navigate = useNavigate()
  const location = useLocation()

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <TicketDrawerProvider>
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" color="inherit" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="h6" component="div" sx={{ fontWeight: 700, color: 'primary.main' }}>
            Job Hunter
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <UpcomingStagesBell />
            <Typography variant="body2" color="text.secondary">
              {displayName}
            </Typography>
            <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: 14 }}>
              {displayName.charAt(0).toUpperCase()}
            </Avatar>
            <ListItemButton
              onClick={handleLogout}
              sx={{ borderRadius: 1, px: 1, minWidth: 0 }}
              aria-label="Log out"
            >
              <LogoutIcon fontSize="small" />
            </ListItemButton>
          </Box>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { width: DRAWER_WIDTH, boxSizing: 'border-box' },
        }}
      >
        <Toolbar />
        <List sx={{ px: 1, py: 2 }}>
          {NAV_ITEMS.map((item) => (
            <ListItemButton
              key={item.path}
              selected={location.pathname.startsWith(item.path)}
              onClick={() => navigate(item.path)}
              sx={{ borderRadius: 1.5, mb: 0.5 }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          ))}
        </List>
        <Divider />
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, bgcolor: 'background.default', minHeight: '100vh' }}>
        <Toolbar />
        <Box sx={{ p: 4 }}>{children}</Box>
      </Box>
    </Box>
    </TicketDrawerProvider>
  )
}
