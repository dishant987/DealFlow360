import type { Role } from '@/hooks/useAuth'

// How each role is named to a human, kept in one place so the login screen, the
// user menu, the profile page and the admin user list can never drift apart.
// The stored values stay the short codes — this is presentation only.
export const ROLE_LABEL: Record<Role, string> = {
  rep: 'Sales Rep',
  manager: 'Manager',
  finance: 'Finance',
  admin: 'Admin',
}

export const roleLabel = (role?: string | null) =>
  (role && ROLE_LABEL[role as Role]) || role || ''
