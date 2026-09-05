import { useQuery } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { api } from '@/lib/api'

export type Role = 'rep' | 'manager' | 'finance' | 'admin'
export interface User {
  id: string
  name: string
  email: string
  role: Role
}

export function useAuth() {
  const q = useQuery<User | null>({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return (await api.get('/auth/me')).data as User
      } catch (e) {
        // ONLY a 401 means "not signed in". Anything else (429, 5xx, network
        // blip, server restart) is transient — rethrow so react-query keeps the
        // last known user instead of silently logging the person out.
        if (e instanceof AxiosError && e.response?.status === 401) return null
        throw e
      }
    },
    retry: 1,
    staleTime: 5 * 60 * 1000, // don't re-check the session on every navigation
    refetchOnWindowFocus: false,
  })

  return {
    user: q.data ?? null,
    // only "loading" before we've ever resolved a session — a background
    // refetch must not flash the protected route into a redirect
    isLoading: q.isPending,
  }
}
