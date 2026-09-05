import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'

export default function Dashboard() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const nav = useNavigate()

  const logout = async () => {
    await api.post('/auth/logout')
    await qc.invalidateQueries({ queryKey: ['me'] })
    nav('/login')
  }

  return (
    <div className="min-h-svh">
      {/* Odoo-purple top bar */}
      <header className="bg-primary text-primary-foreground px-6 py-3 flex items-center justify-between">
        <span className="font-semibold">DealFlow360</span>
        <div className="flex items-center gap-3 text-sm">
          {user?.role === 'admin' && (
            <Button size="sm" variant="secondary" asChild>
              <Link to="/admin">Backend Config</Link>
            </Button>
          )}
          <span>
            {user?.name} · <span className="uppercase opacity-80">{user?.role}</span>
          </span>
          <Button size="sm" variant="secondary" onClick={logout}>
            Logout
          </Button>
        </div>
      </header>

      <main className="p-8">
        <h1 className="text-xl font-semibold">Welcome, {user?.name}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          You're signed in as <b>{user?.role}</b>. Workspace modules land in the next phases.
        </p>
      </main>
    </div>
  )
}
