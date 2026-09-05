import cron from 'node-cron'
import { and, inArray, lt } from 'drizzle-orm'
import { db } from '../config/db.js'
import { quotations, appSettings } from '../models/schema.js'

const ACTIVE = ['draft', 'pending_approval', 'sent', 'under_negotiation'] as const

// ponytail: hourly heartbeat that surfaces stalled deals; the actionable nudge is
// triggered manually from the dashboard. A full job queue is overkill here.
export function startCron() {
  cron.schedule('0 * * * *', async () => {
    try {
      const [s] = await db.select().from(appSettings).limit(1)
      const days = s ? s.stalledDays : 7
      const cutoff = new Date(Date.now() - days * 86_400_000)
      const stalled = await db
        .select({ id: quotations.id })
        .from(quotations)
        .where(and(inArray(quotations.status, [...ACTIVE]), lt(quotations.lastActivityAt, cutoff)))
      if (stalled.length) console.log(`[cron] ${stalled.length} stalled deal(s) need attention`)
    } catch (e) {
      console.error('[cron] stalled check failed:', (e as Error).message)
    }
  })
}
