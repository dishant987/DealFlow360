import { useQuery } from '@tanstack/react-query'
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
      } catch {
        return null
      }
    },
    retry: false,
  })
  return { user: q.data ?? null, isLoading: q.isLoading }
}
