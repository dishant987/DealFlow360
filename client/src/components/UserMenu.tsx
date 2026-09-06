import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { LogOut, PanelsTopLeft, RefreshCw, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import { roleLabel } from '@/lib/roles'
import Avatar from '@/components/Avatar'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export default function UserMenu({
  onReloadData,
  onCloseWorkspace,
}: {
  onReloadData: () => void
  onCloseWorkspace: () => void
}) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const nav = useNavigate()
  const [confirmLogout, setConfirmLogout] = useState(false)

  const logout = async () => {
    await api.post('/auth/logout')
    qc.setQueryData(['me'], null)
    nav('/login', { replace: true })
    toast.success('Signed out')
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Account menu"
          className="flex items-center gap-2 rounded-full py-0.5 pr-2 pl-0.5 transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none"
        >
          <Avatar name={user?.name} className="size-8 bg-white/20 text-primary-foreground" />
          <span className="hidden max-w-36 truncate text-sm whitespace-nowrap xl:inline">
            {user?.name}
          </span>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="min-w-56">
          <div className="flex items-center gap-3 px-2 py-2">
            <Avatar name={user?.name} className="size-9" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user?.name}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
            </div>
          </div>
          <div className="px-2 pb-1">
            <span className="inline-block rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium tracking-wide text-primary uppercase">
              {roleLabel(user?.role)}
            </span>
          </div>

          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/profile">
              <UserRound /> Your profile
            </Link>
          </DropdownMenuItem>

          {/* B1 workspace actions live here too, so the top bar stays uncluttered */}
          <DropdownMenuItem onSelect={onReloadData} className="xl:hidden">
            <RefreshCw /> Reload data
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onCloseWorkspace} className="xl:hidden">
            <PanelsTopLeft /> Close workspace
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmLogout(true)}>
            <LogOut /> Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmLogout} onOpenChange={setConfirmLogout}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Log out of DealFlow360?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll need to sign in again to return to your workspace. Any unsaved edits on this
              screen will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={logout}>Log out</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
