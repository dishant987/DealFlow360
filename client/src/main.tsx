import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { AxiosError } from 'axios'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from '@/components/ErrorBoundary'

// Retrying a 4xx never helps (not found, forbidden, invalid): show the error at once
// instead of a skeleton for ~7s of backoff. Network errors and 5xx still retry twice.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failures, err) => {
        const status = (err as AxiosError)?.response?.status ?? 0
        return !(status >= 400 && status < 500) && failures < 2
      },
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster richColors position="top-right" />
      </BrowserRouter>
    </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
