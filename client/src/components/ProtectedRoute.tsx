import { Navigate, Outlet } from 'react-router-dom'
import { useAuth, type Role } from '@/hooks/useAuth'

export default function ProtectedRoute({ roles }: { roles?: Role[] }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <div className="p-8 text-muted-foreground">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role))
    return <div className="p-8 text-destructive">403 — you don't have access to this page.</div>
  return <Outlet />
}
