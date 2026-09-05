import nodemailer from 'nodemailer'

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM, MAIL_ENABLED } = process.env

// Kill switch for development/testing: set MAIL_ENABLED=false to log links to the
// console instead of sending real email, even when SMTP is configured.
const mailEnabled = MAIL_ENABLED !== 'false'

// Real transport only when SMTP is configured; otherwise we log the link.
const transport =
  mailEnabled && SMTP_HOST && SMTP_USER && SMTP_PASS
    ? nodemailer.createTransport({
        host: SMTP_HOST,
        port: Number(SMTP_PORT) || 587,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      })
    : null

const FROM = MAIL_FROM || 'DealFlow360 <no-reply@dealflow360.app>'

/* ------------------------------------------------------------------ */
/* Template                                                            */
/* ------------------------------------------------------------------ */

const BRAND = '#714B67'
const INK = '#1c1917'
const MUTED = '#6b7280'
const BORDER = '#e5e7eb'
const CANVAS = '#f5f4f6'

/** Anything interpolated into the HTML is data we did not author — a customer
 *  name out of the database, a token in a URL. Escape it. */
const esc = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )

interface Template {
  /** subject line, also used as the visible heading */
  heading: string
  /** the short line shown in the inbox preview, before the body is opened */
  preheader: string
  /** paragraphs of body copy, already plain text */
  paragraphs: string[]
  cta?: { label: string; url: string }
  /** small print under the divider */
  footnote?: string
}

/**
 * Table-based layout with inline styles: the two things every mail client still
 * agrees on. No images, so nothing breaks when remote content is blocked.
 */
function renderHtml({ heading, preheader, paragraphs, cta, footnote }: Template): string {
  const body = paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:${INK};">${esc(p)}</p>`,
    )
    .join('')

  const button = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
        <tr>
          <td align="center" bgcolor="${BRAND}" style="border-radius:8px;">
            <a href="${esc(cta.url)}"
               style="display:inline-block;padding:13px 28px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
              ${esc(cta.label)}
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 8px;font-size:13px;line-height:20px;color:${MUTED};">
        If the button does not work, paste this into your browser:
      </p>
      <p style="margin:0 0 8px;font-size:13px;line-height:20px;word-break:break-all;">
        <a href="${esc(cta.url)}" style="color:${BRAND};">${esc(cta.url)}</a>
      </p>`
    : ''

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${CANVAS};">
  <!-- inbox preview line, hidden in the body itself -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CANVAS};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
               style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${BORDER};border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background:${BRAND};padding:20px 28px;">
              <span style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:18px;font-weight:600;color:#ffffff;letter-spacing:-0.2px;">
                DealFlow360
              </span>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <h1 style="margin:0 0 16px;font-size:20px;line-height:28px;font-weight:600;color:${INK};">
                ${esc(heading)}
              </h1>
              ${body}
              ${button}
            </td>
          </tr>
          ${
            footnote
              ? `<tr>
            <td style="padding:0 28px 24px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <div style="border-top:1px solid ${BORDER};padding-top:16px;font-size:13px;line-height:20px;color:${MUTED};">
                ${esc(footnote)}
              </div>
            </td>
          </tr>`
              : ''
          }
        </table>
        <p style="margin:16px 0 0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:${MUTED};">
          Sent by DealFlow360
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/** The same content as plain text, for clients that will not render HTML. */
function renderText({ heading, paragraphs, cta, footnote }: Template): string {
  return [
    heading,
    '',
    ...paragraphs,
    ...(cta ? ['', `${cta.label}:`, cta.url] : []),
    ...(footnote ? ['', '—', footnote] : []),
  ].join('\n')
}

/* ------------------------------------------------------------------ */
/* Sending                                                             */
/* ------------------------------------------------------------------ */

async function send(to: string, template: Template) {
  const text = renderText(template)
  if (!transport) {
    // demo fallback — no SMTP needed. The plain-text body keeps the link
    // copy-pasteable straight out of the terminal.
    console.log(`\n[mail:console] to=${to} | ${template.heading}\n${text}\n`)
    return
  }
  await transport.sendMail({
    from: FROM,
    to,
    subject: template.heading,
    text,
    html: renderHtml(template),
  })
}

/** Render a template without sending it. Used by the escaping test, and handy
 *  for eyeballing a change to the layout. */
export const previewMail = (template: Template) => ({
  text: renderText(template),
  html: renderHtml(template),
})

// A1: customers reach their quotation through this magic link
export function sendPortalLink(to: string, link: string, customer: string) {
  return send(to, {
    heading: 'Your DealFlow360 quotation is ready',
    preheader: 'Review the pricing, ask a question, or confirm — no account needed.',
    paragraphs: [
      `Hi ${customer},`,
      'Your quotation is ready to review. You can comment on any line, counter the discount, or confirm the terms — all from the link below.',
    ],
    cta: { label: 'Review your quotation', url: link },
    footnote:
      'This link is unique to you and needs no password. Please do not forward it — anyone holding it can view and respond to the quotation.',
  })
}

export function sendPasswordReset(to: string, link: string) {
  return send(to, {
    heading: 'Reset your DealFlow360 password',
    preheader: 'This link is valid for one hour.',
    paragraphs: [
      'We received a request to reset the password on your DealFlow360 account.',
      'Choose a new password using the button below. The link is valid for one hour and can only be used once.',
    ],
    cta: { label: 'Set a new password', url: link },
    footnote:
      "If you didn't request this, you can ignore this email — your password stays as it is.",
  })
}
