import { describe, expect, it } from 'vitest'
import { inviteAction, memberStatus, transferProblem } from './team.js'

const org = 'org-1'
const m = (id: string, over: Partial<{ organizationId: string; blocked: boolean; invitedAt: Date | null }> = {}) => ({
  id,
  organizationId: org,
  blocked: false,
  invitedAt: null,
  ...over,
})

describe('team rules', () => {
  it('status: blocked wins, then invited, else active', () => {
    expect(memberStatus(m('a', { blocked: true, invitedAt: new Date() }))).toBe('blocked')
    expect(memberStatus(m('a', { invitedAt: new Date() }))).toBe('invited')
    expect(memberStatus(m('a'))).toBe('active')
  })

  it('transfer only to another active member of the same company', () => {
    expect(transferProblem(m('a'), m('b'), org)).toBeNull()
    expect(transferProblem(m('a'), m('a'), org)).toMatch(/different/)
    expect(transferProblem(m('a'), m('b', { organizationId: 'other' }), org)).toMatch(/your company/)
    expect(transferProblem(m('a', { organizationId: 'other' }), m('b'), org)).toMatch(/not found/)
    expect(transferProblem(m('a'), m('b', { blocked: true }), org)).toMatch(/blocked/)
    expect(transferProblem(m('a'), m('b', { invitedAt: new Date() }), org)).toMatch(/joined/)
    expect(transferProblem(m('a'), undefined, org)).toMatch(/your company/)
  })

  it('invite: new email creates, a pending invite in this company resends, anything else is taken', () => {
    expect(inviteAction(undefined, org)).toBe('create')
    expect(inviteAction(m('a', { invitedAt: new Date() }), org)).toBe('resend')
    expect(inviteAction(m('a'), org)).toBe('taken')
    expect(inviteAction(m('a', { invitedAt: new Date(), organizationId: 'other' }), org)).toBe('taken')
  })
})
