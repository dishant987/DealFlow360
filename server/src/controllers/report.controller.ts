import type { Request, Response } from 'express'
import { createRequire } from 'module'
import ExcelJS from 'exceljs'
import { and, eq, gte, lte, inArray, type SQL } from 'drizzle-orm'
import { db } from '../config/db.js'
import { quotations, customers, users, quoteLines, products, categories } from '../models/schema.js'
import { computeQuoteTotals } from '../services/pricing.js'

const require = createRequire(import.meta.url)

interface ReportRow {
  id: string
  customer: string
  rep: string
  status: string
  riskScore: number
  amount: number
  createdAt: Date
}

async function buildReport(query: Request['query']): Promise<{ rows: ReportRow[]; summary: any }> {
  const conds: SQL[] = []
  if (query.from) conds.push(gte(quotations.createdAt, new Date(String(query.from))))
  if (query.to) conds.push(lte(quotations.createdAt, new Date(String(query.to))))
  if (query.status) conds.push(eq(quotations.status, String(query.status) as any))
  if (query.repId) conds.push(eq(quotations.repId, String(query.repId)))

  if (query.categoryId) {
    const inCat = await db
      .selectDistinct({ id: quoteLines.quotationId })
      .from(quoteLines)
      .innerJoin(products, eq(quoteLines.productId, products.id))
      .where(eq(products.categoryId, String(query.categoryId)))
    const ids = inCat.map((r) => r.id)
    if (ids.length === 0) return { rows: [], summary: emptySummary() }
    conds.push(inArray(quotations.id, ids))
  }

  const quotes = await db
    .select({
      id: quotations.id,
      customer: customers.name,
      rep: users.name,
      status: quotations.status,
      riskScore: quotations.riskScore,
      orderDiscountPct: quotations.orderDiscountPct,
      createdAt: quotations.createdAt,
    })
    .from(quotations)
    .innerJoin(customers, eq(quotations.customerId, customers.id))
    .innerJoin(users, eq(quotations.repId, users.id))
    .where(conds.length ? and(...conds) : undefined)

  const ids = quotes.map((q) => q.id)
  const lines = ids.length
    ? await db.select().from(quoteLines).where(inArray(quoteLines.quotationId, ids))
    : []
  const byQuote = new Map<string, typeof lines>()
  for (const l of lines) {
    const arr = byQuote.get(l.quotationId) ?? []
    arr.push(l)
    byQuote.set(l.quotationId, arr)
  }

  const rows: ReportRow[] = quotes.map((q) => ({
    id: q.id,
    customer: q.customer,
    rep: q.rep,
    status: q.status,
    riskScore: Number(q.riskScore),
    amount: computeQuoteTotals(byQuote.get(q.id) ?? [], q.orderDiscountPct).total,
    createdAt: q.createdAt,
  }))

  const byStatus: Record<string, number> = {}
  for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1
  const summary = {
    count: rows.length,
    totalValue: Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100,
    avgRisk: rows.length
      ? Math.round((rows.reduce((s, r) => s + r.riskScore, 0) / rows.length) * 100) / 100
      : 0,
    byStatus,
  }
  return { rows, summary }
}

const emptySummary = () => ({ count: 0, totalValue: 0, avgRisk: 0, byStatus: {} })

export async function getReport(req: Request, res: Response) {
  res.json(await buildReport(req.query))
}

export async function getReportFilters(_req: Request, res: Response) {
  const reps = await db.select({ id: users.id, name: users.name }).from(users)
  const cats = await db.select({ id: categories.id, name: categories.name }).from(categories)
  res.json({
    reps,
    categories: cats,
    statuses: [
      'draft',
      'pending_approval',
      'approved',
      'rejected',
      'sent',
      'under_negotiation',
      'confirmed',
      'fulfilled',
      'invoiced',
      'cancelled',
    ],
  })
}

const PURPLE = '#714B67'
const LIGHT = '#F3EEF2'
const BORDER = '#D9CED6'

// inline SVG bar chart of quotations-by-status (pdfmake renders SVG natively)
function statusChartSvg(byStatus: Record<string, number>): string {
  const entries = Object.entries(byStatus)
  if (!entries.length) return ''
  const max = Math.max(1, ...entries.map(([, c]) => c))
  const bw = 46
  const gap = 26
  const chartH = 120
  const baseY = 150
  const width = Math.max(320, entries.length * (bw + gap) + 40)
  const bars = entries
    .map(([status, count], i) => {
      const x = 30 + i * (bw + gap)
      const h = (count / max) * chartH
      const y = baseY - h
      const label = status.replace(/_/g, ' ')
      return `
        <rect x="${x}" y="${y}" width="${bw}" height="${h}" fill="${PURPLE}" rx="3"/>
        <text x="${x + bw / 2}" y="${y - 5}" font-size="10" text-anchor="middle" fill="#333">${count}</text>
        <text x="${x + bw / 2}" y="${baseY + 14}" font-size="8" text-anchor="middle" fill="#666"
          transform="rotate(-25 ${x + bw / 2} ${baseY + 14})">${label}</text>`
    })
    .join('')
  return `<svg width="${width}" height="185" xmlns="http://www.w3.org/2000/svg">
    <line x1="28" y1="${baseY}" x2="${width - 10}" y2="${baseY}" stroke="${BORDER}"/>
    ${bars}
  </svg>`
}

function activeFilters(q: Request['query']): string {
  const parts: string[] = []
  if (q.from) parts.push(`from ${q.from}`)
  if (q.to) parts.push(`to ${q.to}`)
  if (q.status) parts.push(`status ${q.status}`)
  if (q.repId) parts.push('rep filter')
  if (q.categoryId) parts.push('category filter')
  return parts.length ? parts.join(' · ') : 'no filters (all quotations)'
}

export async function exportReport(req: Request, res: Response) {
  const { rows, summary } = await buildReport(req.query)
  const format = String(req.query.format ?? 'xls')

  if (format === 'pdf') {
    const PdfPrinter = require('pdfmake')
    const printer = new PdfPrinter({
      Helvetica: {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
        italics: 'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique',
      },
    })

    const kpi = (label: string, value: string) => ({
      table: { widths: ['*'], body: [[{ text: label, fontSize: 8, color: '#777' }], [{ text: value, fontSize: 15, bold: true, color: PURPLE }]] },
      layout: 'noBorders',
      fillColor: LIGHT,
      margin: [0, 0, 0, 0],
    })

    const detailBody = [
      [
        { text: 'Customer', style: 'th' },
        { text: 'Rep', style: 'th' },
        { text: 'Status', style: 'th' },
        { text: 'Risk', style: 'th', alignment: 'right' },
        { text: 'Amount', style: 'th', alignment: 'right' },
      ],
      ...rows.map((r) => [
        r.customer,
        r.rep,
        r.status.replace(/_/g, ' '),
        { text: r.riskScore.toFixed(1), alignment: 'right' },
        { text: `$${r.amount.toFixed(2)}`, alignment: 'right' },
      ]),
      [
        { text: 'Total', bold: true, colSpan: 4 },
        {},
        {},
        {},
        { text: `$${summary.totalValue.toFixed(2)}`, bold: true, alignment: 'right' },
      ],
    ]

    const statusBreakdown = Object.entries(summary.byStatus).map(([s, c]) => [
      s.replace(/_/g, ' '),
      { text: String(c), alignment: 'right' },
    ])

    const chart = statusChartSvg(summary.byStatus)

    const doc = printer.createPdfKitDocument({
      pageMargins: [40, 55, 40, 45],
      defaultStyle: { font: 'Helvetica', fontSize: 9 },
      styles: {
        th: { bold: true, color: 'white', fillColor: PURPLE },
        h2: { fontSize: 12, bold: true, color: PURPLE, margin: [0, 14, 0, 6] },
      },
      header: {
        margin: [40, 18, 40, 0],
        columns: [
          { text: 'DealFlow360', color: PURPLE, bold: true },
          { text: 'Sales Report', alignment: 'right', color: '#999' },
        ],
      },
      footer: (current: number, total: number) => ({
        margin: [40, 0, 40, 20],
        columns: [
          { text: `Generated ${new Date().toLocaleString()}`, fontSize: 7, color: '#999' },
          { text: `Page ${current} of ${total}`, alignment: 'right', fontSize: 7, color: '#999' },
        ],
      }),
      content: [
        { text: 'Sales Report', fontSize: 18, bold: true },
        { text: activeFilters(req.query), fontSize: 8, color: '#888', margin: [0, 2, 0, 12] },
        {
          columns: [
            kpi('Quotations', String(summary.count)),
            kpi('Total value', `$${summary.totalValue.toFixed(2)}`),
            kpi('Avg risk score', summary.avgRisk.toFixed(1)),
          ],
          columnGap: 10,
        },
        ...(chart
          ? [{ text: 'Quotations by status', style: 'h2' }, { svg: chart, width: 500 }]
          : []),
        ...(statusBreakdown.length
          ? [
              { text: 'Status breakdown', style: 'h2' },
              {
                table: { widths: ['*', 'auto'], body: [[{ text: 'Status', style: 'th' }, { text: 'Count', style: 'th', alignment: 'right' }], ...statusBreakdown] },
                layout: { fillColor: (i: number) => (i > 0 && i % 2 === 0 ? LIGHT : null) },
              },
            ]
          : []),
        { text: 'Detail', style: 'h2' },
        {
          table: { headerRows: 1, widths: ['*', '*', 'auto', 'auto', 'auto'], body: detailBody },
          layout: { fillColor: (i: number) => (i > 0 && i % 2 === 0 ? LIGHT : null) },
        },
      ],
    })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="report.pdf"')
    doc.pipe(res)
    doc.end()
    return
  }

  // XLS
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Quotations')
  ws.columns = [
    { header: 'Customer', key: 'customer', width: 24 },
    { header: 'Rep', key: 'rep', width: 20 },
    { header: 'Status', key: 'status', width: 18 },
    { header: 'Risk', key: 'riskScore', width: 10 },
    { header: 'Amount', key: 'amount', width: 14 },
    { header: 'Created', key: 'createdAt', width: 22 },
  ]
  ws.getRow(1).font = { bold: true }
  rows.forEach((r) => ws.addRow(r))
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', 'attachment; filename="report.xlsx"')
  await wb.xlsx.write(res)
  res.end()
}
