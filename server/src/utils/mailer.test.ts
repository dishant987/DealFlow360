import { describe, it, expect } from 'vitest'
import { previewMail } from './mailer.js'

// A customer name comes out of the database and a portal URL carries a token —
// neither is content we wrote, so both have to be escaped before they reach HTML.
const hostile = {
  heading: 'Your quotation is ready',
  preheader: 'preview line',
  paragraphs: ['Hi <script>alert(1)</script> & "Acme" Corp,'],
  cta: { label: 'Review', url: 'https://app.test/portal/abc?a=1&b=2' },
  footnote: "Don't forward this.",
}

describe('email templates', () => {
  it('escapes untrusted content instead of emitting it as markup', () => {
    const { html } = previewMail(hostile)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&quot;Acme&quot;')
    // an unescaped & in a query string breaks the href for strict parsers
    expect(html).toContain('a=1&amp;b=2')
  })

  it('always ships a plain-text alternative carrying the link', () => {
    const { text } = previewMail(hostile)
    expect(text).toContain('Your quotation is ready')
    expect(text).toContain('https://app.test/portal/abc?a=1&b=2')
    expect(text).toContain("Don't forward this.")
    expect(text).not.toContain('<td') // no markup leaking into the text part
  })

  it('renders a self-contained document with no remote assets', () => {
    const { html } = previewMail(hostile)
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('max-width:600px')
    expect(html).not.toMatch(/<img|background-image/) // nothing to be blocked
  })
})
