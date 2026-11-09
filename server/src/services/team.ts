// Team rules (step 15). Pure: callers load the users, these decide.

type Member = { id: string; organizationId: string; blocked: boolean; invitedAt: Date | null }

export type MemberStatus = 'active' | 'invited' | 'blocked'
export const memberStatus = (u: Pick<Member, 'blocked' | 'invitedAt'>): MemberStatus =>
  u.blocked ? 'blocked' : u.invitedAt ? 'invited' : 'active'

/** Can `from`'s deals and customers be handed to `to`? Returns the reason it can't, or null. */
export function transferProblem(from: Member | undefined, to: Member | undefined, orgId: string): string | null {
  if (!from || from.organizationId !== orgId) return 'User not found.'
  if (!to || to.organizationId !== orgId) return 'Pick someone in your company to hand the work to.'
  if (from.id === to.id) return 'Pick a different person to hand the work to.'
  if (to.blocked) return "You can't hand work to a blocked user."
  if (to.invitedAt) return "That person hasn't joined yet — pick someone who has."
  return null
}

/** What an invite does with an email that may already have an account. */
export function inviteAction(existing: Member | undefined, orgId: string): 'create' | 'resend' | 'taken' {
  if (!existing) return 'create'
  // re-inviting someone who hasn't joined yet just sends a fresh link
  return existing.organizationId === orgId && existing.invitedAt && !existing.blocked ? 'resend' : 'taken'
}
