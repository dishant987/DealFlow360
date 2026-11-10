import type { Request, Response } from 'express'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../config/db.js'
import { organizations } from '../models/schema.js'
import { currencySchema } from '../utils/format.js'

// keep in step with client/src/components/CompanySettings.tsx
export const INDUSTRIES = [
  'Manufacturing',
  'Wholesale & distribution',
  'Retail & e-commerce',
  'Software & IT',
  'Professional services',
  'Construction',
  'Healthcare',
  'Education',
  'Hospitality',
  'Logistics',
  'Other',
] as const

const COMPANY = {
  name: organizations.name,
  currency: organizations.currency,
  industry: organizations.industry,
  website: organizations.website,
  phone: organizations.phone,
  contactEmail: organizations.contactEmail,
  address: organizations.address,
  taxId: organizations.taxId,
  defaultPaymentTermsDays: organizations.defaultPaymentTermsDays,
  quoteValidityDays: organizations.quoteValidityDays,
  defaultQuoteTerms: organizations.defaultQuoteTerms,
  paymentInstructions: organizations.paymentInstructions,
}

// organizations isn't under row-level security: always pin to the signed-in company
const read = async (orgId: string) => (await db.select(COMPANY).from(organizations).where(eq(organizations.id, orgId)))[0]

export async function getCompany(req: Request, res: Response) {
  res.json(await read(req.orgId!))
}

const text = (max: number) => z.string().trim().max(max).nullable().optional().transform((v) => (v ? v : null))
const companySchema = z
  .object({
    name: z.string().trim().min(1, 'Company name is required').max(120),
    currency: currencySchema,
    industry: z.enum(INDUSTRIES).nullable(),
    website: text(200),
    phone: text(40),
    contactEmail: z.string().trim().email('Enter a valid email').or(z.literal('')).nullable().transform((v) => (v ? v : null)),
    address: text(500),
    taxId: text(40),
    defaultPaymentTermsDays: z.coerce.number().int().min(0).max(365),
    quoteValidityDays: z.coerce.number().int().min(1).max(365),
    defaultQuoteTerms: text(5000),
    paymentInstructions: text(2000),
  })
  .partial()

export async function updateCompany(req: Request, res: Response) {
  const p = companySchema.safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message ?? 'Check the highlighted fields.' })
  if (Object.keys(p.data).length) await db.update(organizations).set(p.data).where(eq(organizations.id, req.orgId!))
  res.json(await read(req.orgId!))
}

/** Defaults for new quotes and customers. */
export async function companyDefaults(orgId: string) {
  const [o] = await db
    .select({
      quoteValidityDays: organizations.quoteValidityDays,
      defaultQuoteTerms: organizations.defaultQuoteTerms,
      defaultPaymentTermsDays: organizations.defaultPaymentTermsDays,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
  return o ?? { quoteValidityDays: 30, defaultQuoteTerms: null, defaultPaymentTermsDays: 30 }
}
