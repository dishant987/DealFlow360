import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft, BadgeCheck } from 'lucide-react'
import ThemeToggle from '@/components/ThemeToggle'

// Set VITE_CONTACT_EMAIL before launch; the .example domain is reserved and never delivers.
const CONTACT = import.meta.env.VITE_CONTACT_EMAIL || 'privacy@dealwise.example'
const UPDATED = '10 November 2026'

const mail = <a href={`mailto:${CONTACT}`}>{CONTACT}</a>

// Describes what the app actually does today — keep it in step when data, cookies or providers change.
const PRIVACY: ReactNode = (
  <>
    <p>
      This policy explains what Dealwise stores, why, and what you can ask us to do with it. Dealwise is a
      business tool: each company that signs up controls the data its team puts in, and we process it on
      that company's behalf.
    </p>
    <h2>What we store</h2>
    <ul>
      <li><strong>Your account:</strong> name, work email, role, a one-way hash of your password (never the password itself), and your two-factor setup if you turn it on.</li>
      <li><strong>Your company's work:</strong> customers and their contacts, products, prices, quotations, approvals, invoices and the activity history your team creates.</li>
      <li><strong>Signed-in devices:</strong> for each sign-in, the browser name and IP address, so you can see your devices and sign them out.</li>
      <li><strong>Customer portal:</strong> when you send a quotation, your customer can open it from a private link without an account; their questions and answers are stored with the quote.</li>
    </ul>
    <h2>Why we use it</h2>
    <p>Only to run the service: to sign you in, show your company its own data, send the emails the app needs (sign-in links, invites, quotations) and keep accounts secure. We don't sell data and we don't use it for advertising.</p>
    <h2>Who else sees it</h2>
    <ul>
      <li>Only people in your company, according to their role. Each company's data is kept apart from every other company's by the database itself.</li>
      <li>Our email provider, to deliver the emails above.</li>
      <li>Google, only if you choose “Continue with Google”, to confirm who you are.</li>
      <li>Our hosting provider, which stores the database on our behalf.</li>
    </ul>
    <h2>Cookies</h2>
    <p>
      We use a sign-in cookie that keeps you signed in for up to 7 days, and short-lived cookies during
      two-factor and Google sign-in. Your browser also remembers your light/dark theme and sidebar
      preference. There are no advertising or tracking cookies.
    </p>
    <h2>How long we keep it</h2>
    <p>For as long as your company uses Dealwise. When a company asks us to close its account, we delete its data, except where the law requires us to keep records such as invoices.</p>
    <h2>Your choices</h2>
    <p>You can see and correct your name and password on your Profile page and sign out any device there. For a copy of your data, or to have it deleted, ask your company's admin or write to {mail}.</p>
    <h2>Changes</h2>
    <p>If this policy changes in a way that matters, we'll say so in the app before it takes effect.</p>
  </>
)

const TERMS: ReactNode = (
  <>
    <p>These terms apply when you or your company use Dealwise. By creating an account you accept them on behalf of your company.</p>
    <h2>Your account</h2>
    <ul>
      <li>The person who signs up creates a company and becomes its admin. The admin decides who joins and what role each person has.</li>
      <li>Keep your password private and turn on two-factor sign-in where you can. You're responsible for what happens under your account.</li>
    </ul>
    <h2>Your data</h2>
    <p>Your company owns the data it puts into Dealwise. You give us permission to store and process it only to provide the service, as described in the <Link to="/privacy">Privacy Policy</Link>.</p>
    <h2>Fair use</h2>
    <ul>
      <li>Don't use Dealwise for anything unlawful, or to send messages your customers didn't expect.</li>
      <li>Don't try to reach another company's data, overload the service or get around its limits.</li>
    </ul>
    <h2>The service</h2>
    <p>We work to keep Dealwise available and your data safe, and we'll tell you about planned changes that affect you. The service is provided “as is”; prices, discounts and invoices it produces should still be checked by your team.</p>
    <h2>Ending</h2>
    <p>You can stop using Dealwise at any time and ask us to delete your company's data. We may suspend an account that breaks these terms, and will tell the admin why.</p>
    <h2>Contact</h2>
    <p>Questions about these terms: {mail}.</p>
  </>
)

export default function Legal() {
  const doc = useLocation().pathname === '/terms' ? 'terms' : 'privacy'
  const title = doc === 'privacy' ? 'Privacy Policy' : 'Terms of Service'
  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 font-heading text-lg font-semibold tracking-tight">
            <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
              <BadgeCheck className="size-4" aria-hidden />
            </span>
            Dealwise
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-12">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Back to Dealwise
        </Link>
        <h1 className="mt-6 font-heading text-4xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated {UPDATED}</p>
        <article className="mt-8 space-y-4 text-[15px] leading-relaxed text-foreground/90 [&_a]:font-medium [&_a]:text-primary [&_a]:underline-offset-2 hover:[&_a]:underline [&_h2]:pt-4 [&_h2]:font-heading [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:pl-1 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
          {doc === 'privacy' ? PRIVACY : TERMS}
        </article>
        <p className="mt-12 border-t pt-6 text-sm text-muted-foreground">
          See also{' '}
          {doc === 'privacy' ? (
            <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link>
          ) : (
            <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
          )}
          .
        </p>
      </main>
    </div>
  )
}
