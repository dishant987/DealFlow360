import { test, expect, request } from '@playwright/test'
import { API, PASSWORD } from './helpers'

// Steps 15–16, in a brand-new company so nothing shared is touched.
test.describe('Team and sessions', () => {
  test('invite, hand over work, and sign a device out', async () => {
    const t = Date.now()
    const admin = await request.newContext({ baseURL: API })
    const signup = await admin.post('/api/auth/signup', { data: { name: 'Team Owner', email: `team-${t}@example.com`, password: PASSWORD, company: `Team Co ${t}` } })
    expect(signup.status()).toBe(201)
    expect((await signup.json()).emailVerified).toBe(false)
    expect((await admin.post('/api/auth/verify-email', { data: { token: 'nope' } })).status()).toBe(400)

    // invite: new → 201, again → resent, someone else's account → 409
    const invite = { name: 'New Hire', email: `hire-${t}@example.com`, role: 'rep' }
    expect((await admin.post('/api/config/users/invite', { data: invite })).status()).toBe(201)
    expect((await (await admin.post('/api/config/users/invite', { data: invite })).json()).resent).toBe(true)
    expect((await admin.post('/api/config/users/invite', { data: { ...invite, email: 'rep@dealflow.com' } })).status()).toBe(409)
    const list = await (await admin.get('/api/config/users')).json()
    const hire = list.find((u: { email: string }) => u.email === invite.email)
    expect(hire.status).toBe('invited')

    // a teammate who has joined, and a customer to hand over
    const mate = await (await admin.post('/api/config/users', { data: { name: 'Mate', email: `mate-${t}@example.com`, password: PASSWORD, role: 'rep' } })).json()
    const me = list.find((u: { email: string }) => u.email === `team-${t}@example.com`)
    await admin.post('/api/config/customers', { data: { name: 'Handover Ltd', email: `ho-${t}@example.com`, tier: 'gold', ownerId: me.id } })
    expect((await admin.post(`/api/config/users/${me.id}/transfer`, { data: { toUserId: hire.id } })).status()).toBe(400) // hasn't joined
    expect(await (await admin.post(`/api/config/users/${me.id}/transfer`, { data: { toUserId: mate.id } })).json()).toEqual({ quotations: 0, customers: 1 })
    expect((await (await admin.get(`/api/config/users/${mate.id}`)).json()).owns.customers).toBe(1)

    // the teammate signs in on two devices; signing out the others ends the second one only
    const phone = await request.newContext({ baseURL: API })
    const laptop = await request.newContext({ baseURL: API })
    for (const c of [phone, laptop]) await c.post('/api/auth/login', { data: { email: mate.email, password: PASSWORD } })
    const devices = await (await laptop.get('/api/auth/sessions')).json()
    expect(devices).toHaveLength(2)
    expect(devices.filter((d: { current: boolean }) => d.current)).toHaveLength(1)
    await laptop.post('/api/auth/sessions/revoke-others')
    expect((await phone.get('/api/auth/me')).status()).toBe(401)
    expect((await laptop.get('/api/auth/me')).status()).toBe(200)

    // admin "sign out everywhere"
    await admin.post(`/api/config/users/${mate.id}/sign-out`)
    expect((await laptop.get('/api/auth/me')).status()).toBe(401)
  })
})
