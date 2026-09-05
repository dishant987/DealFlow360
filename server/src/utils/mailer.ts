import nodemailer from 'nodemailer'

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env

// Real transport only when SMTP is configured; otherwise we log the link.
const transport =
  SMTP_HOST && SMTP_USER && SMTP_PASS
    ? nodemailer.createTransport({
        host: SMTP_HOST,
        port: Number(SMTP_PORT) || 587,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      })
    : null

export async function sendMail(to: string, subject: string, text: string) {
  if (!transport) {
    // demo fallback — no SMTP needed
    console.log(`\n[mail:console] to=${to} | ${subject}\n${text}\n`)
    return
  }
  await transport.sendMail({ from: MAIL_FROM || 'no-reply@dealflow360.app', to, subject, text })
}

// A1: customers reach their quotation through this magic link
export function sendPortalLink(to: string, link: string, customer: string) {
  return sendMail(
    to,
    'Your DealFlow360 quotation',
    `Hi ${customer},\n\nYour quotation is ready to review. Open it here to comment, counter the discount, or confirm:\n${link}\n\nNo password needed — this link is unique to you.`,
  )
}

export function sendPasswordReset(to: string, link: string) {
  return sendMail(
    to,
    'Reset your DealFlow360 password',
    `Reset your password using this link (valid 1 hour):\n${link}\n\nIf you didn't request this, ignore this email.`,
  )
}
