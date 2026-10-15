import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthContext'
import { ThemeModeProvider } from './theme/ThemeModeProvider'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* Above the theme: the saved theme is only fetched while logged in. */}
      <AuthProvider>
        <ThemeModeProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ThemeModeProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
