# Dealwise

An intelligent, self-governing B2B sales operations platform — from quotation to cash.

Most sales tools handle the happy path: create a quote, confirm it, invoice it. Real B2B
teams work in messier conditions — multi-level discount approvals, partial stock spread
across warehouses, subscriptions bundled with one-time hardware, customers who want to
negotiate rather than email, and managers who find out a deal stalled only after it died.

Dealwise enforces pricing discipline on its own, reacts to live inventory, keeps
recurring and one-time billing reconciled on a single order, and gives the customer a
living document instead of a static PDF.

**What's new:** a public landing page at `/` for visitors (signed-in users go straight to their
dashboard), light and dark themes (light by default; switch with the moon/sun icon in any header,
remembered per device), and a new app layout: a grouped, collapsible sidebar (Sell · Operate ·
Finance · Insights · Settings) and a **Ctrl/⌘ K** command palette to jump anywhere.
The workspace page shows what needs you (role-shaped tasks), four KPIs (open pipeline, won this
month, 90-day win rate, average discount), pipeline-by-stage and invoiced-revenue charts, and a
"Get set up" checklist for a new company.

---

## Table of contents

- [Quick start](#quick-start)
- [Deploying](#deploying)
- [Demo accounts](#demo-accounts)
- [The five-minute demo](#the-five-minute-demo)
- [End-to-end flow](#end-to-end-flow)
- [Roles and what each can do](#roles-and-what-each-can-do)
- [Core business logic](#core-business-logic)
- [Architecture](#architecture)
- [Data model](#data-model)
- [API surface](#api-surface)
- [Testing](#testing)
- [What we'd build next](#what-wed-build-next)

---

## Quick start

**Prerequisites:** Node 20+, PostgreSQL 13+ (the schema uses `gen_random_uuid()`).

```bash
createdb dealwise
```

**Server**

```bash
cd server
cp .env.example .env        # set MIGRATE_DATABASE_URL, APP_DB_PASSWORD, JWT_SECRET
npm install
npm run db:migrate          # create the schema from committed migrations (owner login)
npm run db:app-role         # create the app's own login, then set DATABASE_URL to it
npm run db:seed             # sample data — see below
npm run dev                 # http://localhost:4000
```

**Client**

```bash
cd client
npm install
npm run dev                 # http://localhost:5173
```

`.env` essentials:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | The **app login** (created by `npm run db:app-role`). Must not be a superuser or have BYPASSRLS — in production the server refuses to start if it does. Append `?sslmode=require` for a hosted DB. |
| `MIGRATE_DATABASE_URL` | The **owner login**, used only by migrations, `db:baseline` and `db:app-role`. |
| `APP_DB_PASSWORD`, `APP_DB_USER` | Password (16+ chars) and name (default `dealwise_app`) for the app login. |
| `JWT_SECRET` | Signs the session cookie. Use a long random string. |
| `CLIENT_URL` | Used to build customer portal links. |
| `SMTP_*` | Optional. Without it, portal and password-reset links print to the server console. |
| `MAIL_ENABLED` | Set to `false` to print links to the console even when SMTP is configured — use it while testing. |
| `NODE_ENV` | `production` turns on HTTPS-only cookies and `trust proxy`, and the server refuses to boot with a weak `JWT_SECRET` (< 32 chars), a localhost `CLIENT_URL` or no `DATABASE_URL`. |
| `CORS_ORIGINS` | Optional comma-separated allow-list for the API and socket. Defaults to `CLIENT_URL`. |
| `DB_SSL_ALLOW_SELF_SIGNED` | Set to `true` only if your hosted Postgres uses a self-signed certificate; otherwise the certificate is verified. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional Google sign-in. Create a "Web application" OAuth client in Google Cloud Console and add `<CLIENT_URL>/api/auth/google/callback` as an authorised redirect URI. Without both, the Google button is hidden. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Optional: lets companies pay for a plan. Use test keys (`sk_test_…`) until launch. In Stripe, add a webhook to `<server>/api/plan/webhook` for `checkout.session.completed`, `customer.subscription.updated` and `customer.subscription.deleted`, and turn on the Customer Portal. Locally: `stripe listen --forward-to localhost:4000/api/plan/webhook` prints the webhook secret. Without the keys, plans show but can't be bought. |
| `ALLOW_DESTRUCTIVE_SEED` | `db:seed` refuses to run with `NODE_ENV=production` unless this is `true`. |

Client build settings:

| Variable | Purpose |
| --- | --- |
| `VITE_SHOW_DEMO_LOGINS` | The demo-account buttons show in `npm run dev` only. Set to `true` for an internal staging build that should show them. |
| `VITE_CONTACT_EMAIL` | Address shown on `/privacy` and `/terms` for data and legal requests. **Set before launch** — it defaults to a placeholder `privacy@dealwise.example`. The two pages describe what the app actually stores and the cookies it sets; have them reviewed before going live and update them when that changes. |
| `VITE_API_TARGET` | Dev-server proxy target for `/api` and `/socket.io` (default `http://localhost:4000`). |

In production, serve the client and API from one origin (a reverse proxy routing `/api` and `/socket.io` to the server); the client calls both with relative URLs.

**Schema changes.** Edit `server/src/models/schema.ts`, run `npm run db:generate`, commit the new
file in `server/drizzle/`, and apply it with `npm run db:migrate` (every environment, including
production). Already have a database that was created with `db:push`? Run `npm run db:baseline`
once: it records the existing migrations as applied without running them, and refuses on an empty
database or when nothing is missing.

`npm run db:seed` is destructive — it clears every table and rebuilds a full demo
pipeline: 6 users, 12 customers across all three tiers, 11 products (hardware, services,
subscriptions), tier price overrides, variants, upsell pairings, 3 warehouses (Main Warehouse, East Depot, West Hub) with stock
and reorder rules, and roughly 80 quotations spread across every stage, complete with
approvals, negotiations, fulfilments, invoices and payments.

---

## Quote versions and e-signature

Every time a quotation is **sent** to the customer, Dealwise freezes exactly what the customer sees
(lines, prices, discounts, terms, totals — never cost) as a numbered **version** with a sha-256
fingerprint. Re-sending an unchanged quote keeps the same version. To confirm in the portal the
customer **signs**: types their full name and ticks "I agree". The signature (name, time, IP, browser)
is stored on the exact version they accepted; if they had an open counter-offer, it's applied first and
becomes a new version, so the signed terms are always the ones that were agreed. On the quote page,
**Versions** lists every version, shows the signature, and compares any two (header fields, lines
added/removed/changed). Rules: `server/src/services/quoteVersion.ts` (unit-tested).

## Big lists (server-side paging)

The **Quotations** and **Invoices** lists page, search, filter and sort **on the server**: the browser
gets one page (about 3 KB instead of ~1 MB for the quotations list), and the summary cards are SQL
totals over everything. Send `?page=` (1-based) with optional `pageSize` (≤ 100), `q` (customer name or
quote/invoice number), filters and `sort`/`dir`; without `?page` the endpoints return the full list as
before, so other screens keep working. The Kanban view uses `/quotations/board` (newest cards per
status with true counts). In the client, `DataTable` has a `server` mode (`total` + `onChange`) and only
columns with a `sortKey` sort. Quote **amount** is computed from the lines, so it can't be sorted on
the server. Rules: `server/src/services/paging.ts` (unit-tested). Still client-side for now: approvals,
fulfilment queue, subscriptions, customers.

## Company settings

**Settings → Company profile** (admins; everyone can read it): company name, industry, contact email,
phone, website, address and tax ID — printed as the seller on every invoice — plus the **currency**
(moved here from Thresholds) and **defaults for new work**: payment terms for new customers (Net N),
how long new quotes stay valid, default terms & conditions pre-filled on new quotes, and payment
instructions (e.g. bank details) printed on invoices. Each customer or quote can still override them.

## Invoices

Each invoice has a page with a progress stepper (order confirmed → shipped → invoiced → paid; steps a
deal passed over show as *skipped*), line items, payments and a summary, plus **Preview** (the real
PDF, inline), **Email** (PDF attached; the customer's address is filled in and can be changed, with an
optional message) and **Download PDF**. The PDF follows the usual commercial layout: seller and
"INVOICE" header with a PAID / OVERDUE stamp, bill-to block (name, attention, billing address, tax ID),
invoice details (number, dates, payment terms, PO, quote reference), numbered line items, totals with
any order discount, amount paid and balance due, then notes, payment instructions and terms.

## Plans and billing

Every new company gets a **14-day free trial of every feature** (no card). After that it needs a
plan, or the workspace turns **read-only**: everyone can still sign in and look, but nothing can be
created or changed until an admin chooses one (signing in, the profile page and billing keep working).
Plans are per user per month, in USD, billed by Stripe. Each includes the one before it:

| Plan | Price | Includes |
| --- | --- | --- |
| Starter | $15 | Quotations + approval routing, customer portal, customers/contacts/catalogue, one-time invoices + PDF, team roles, 2FA, Google sign-in, audit log |
| Growth | $39 | + multi-warehouse fulfilment and backorders, subscriptions and recurring billing, bulk import, upsell suggestions |
| Scale | $69 | + reports and exports, deal health board, discount anomaly alerts |
| Enterprise | talk to us | + SSO and custom approval chains (planned), onboarding, priority support |

Gated features return **402** from the server (`requireFeature`) and are hidden in the menu. Admins
manage the plan under **Settings → Plan & billing**: choose a plan (Stripe Checkout; activated on
return, no need to wait for the webhook), switch plans (prorated), and open Stripe's portal for the
card, invoices and cancelling. The seat count follows the team. Stripe's webhook keeps the status in
step afterwards (renewals, failed cards, cancelling). Rules: `server/src/services/plan.ts`
(unit-tested). The demo company in the seed is a paying Scale customer.

## Companies (multi-tenancy)

Dealwise hosts many companies in one database. Signing up (two short steps: about you, then your
company) creates a **new company** with you as its admin (default settings and discount tiers
included). You're asked to confirm your email from a link; until then a reminder bar shows, nothing
is locked. Teammates join the same company by **invite**: Settings → Users → Invite sends a link
(valid 7 days) where they choose a password. Each user has a detail page (Settings → Users → name)
showing last sign-in, signed-in devices, and the quotations and customers they own, with
**Transfer** to hand all of it to a teammate and **Sign out everywhere**. Everyone can see and sign
out their own devices on the Profile page; blocking a user or resetting a password signs them out
of every device at once, live tabs included. Existing data from before multi-tenancy lives in "Default company".

**Currency.** Each company picks its currency when signing up (USD by default; managers and admins
can change it under Config → Thresholds). Every amount in the app, the customer portal and the
invoice/report PDFs is shown in it, with proper grouping (`$1,000.00`, `₹1,00,000.00`). One company
uses one currency; quoting different customers in different currencies is not supported yet.

Isolation is enforced by Postgres, not by remembering a filter in every query:

- every company table has `organization_id`, defaulted from the request's company;
- **row-level security** shows a session only its company's rows (no company set = no rows);
- **same-company foreign keys** stop a row pointing at another company's record by id;
- each request runs in one transaction tagged with the signed-in user's company
  (`server/src/config/db.ts`); live-update signals go to the company's room only.

The app's database login therefore must not bypass row-level security — see `npm run db:app-role`.

## Deploying

One Docker image runs the whole app: it builds the client, compiles the API, applies committed
migrations on start (a failed migration stops the deploy), and serves client + API from one
origin, so cookies, live updates and the Content-Security-Policy stay same-origin.

```bash
docker build -t dealwise .

# first deploy only: create the app's own login, using the owner login
docker run --rm -e DATABASE_URL=<owner url> -e APP_DB_PASSWORD=<16+ chars> \
  dealwise npm run app-role:prod

docker run -p 4000:4000 \
  -e MIGRATE_DATABASE_URL=<owner url> \
  -e DATABASE_URL=postgresql://dealwise_app:<password>@host:5432/dealwise?sslmode=require \
  -e JWT_SECRET=<at least 32 random characters> \
  -e CLIENT_URL=https://app.yourdomain.com \
  dealwise
```

Put it behind HTTPS (the session cookie is HTTPS-only in production). Without Docker:
`npm run build` in both folders, then `CLIENT_DIST=../client/dist npm run start:prod` in `server/`.

**Backups** are the database host's job: turn on daily backups with point-in-time recovery
(every managed Postgres offers it) and test a restore before going live.

**Customer portal links** expire 30 days after they're sent; re-sending a quote issues a fresh
link and the old one stops working.

---

## Demo accounts

All share the password `password123`. For internal testing only: the login screen shows one-click buttons for each in `npm run dev`. Production builds hide them unless built with `VITE_SHOW_DEMO_LOGINS=true`.

| Role | Email | Sees |
| --- | --- | --- |
| Sales Rep | `rep@dealflow.com` | Only their own deals |
| Manager | `manager@dealflow.com` | Approvals, deal health, reports, discount config |
| Finance | `finance@dealflow.com` | Second-level approvals, fulfilment, billing, invoices |
| Admin | `admin@dealflow.com` | Full backend configuration and platform-wide analytics |

Two extra reps (`dev@dealflow.com`, `sana@dealflow.com`) exist so per-rep report filters
and the discount-anomaly detector have more than one baseline to compare against.

---

## The five-minute demo

Two complete flows, quotation to cash.

**Flow A — discount governance and fulfilment (≈3 min)**

1. Sign in as **Sales Rep**. Quotations → **New Quotation** → pick *Acme Corp (gold)*.
2. Add **Business Laptop**. Note the unit price is **$950**, not the $1,000 list price —
   the gold tier price list applied automatically.
3. Set the line discount to **21%**. The row flips to `OVER (+6pt)`, and the summary panel
   says *"routes for Manager approval on submit"* — before anything is submitted.
4. Accept an upsell from the **Suggested add-ons** panel and watch the order margin move.
5. **Submit** — no "request approval" button anywhere. The system routed it.
6. Sign in as **Manager** → Approvals. You land on *your* queue. Approve.
7. Sign in as **Finance** → Fulfilment. Accept the suggested warehouse split; stock
   decrements, and any shortfall becomes a backorder row.

**Flow B — customer negotiation and hybrid billing (≈2 min)**

1. As the rep, build a quote mixing **Business Laptop** (one-time) with **Support Plan**
   (subscription). Submit and approve it.
2. **Send to Customer** → copy the portal link.
3. Open the link in a private window — no sign-in. Costs and margins are absent from the
   payload entirely, not merely hidden.
4. Counter with a **45%** discount and confirm. The quote automatically re-enters the
   approval chain because the customer moved the terms past the threshold.
5. Approve as Manager then Finance — the deal lands on **confirmed** without the customer
   having to click twice.
6. Finance → Billing → **Generate Billing**: one invoice for the laptop, a separate
   recurring schedule for the plan. Record a partial payment, then clear the balance.

---

## End-to-end flow

```
                         ┌──────────────────────────────────────────┐
   Admin configures      │  products · price lists · variants       │
   the backend  ────────▶│  discount tiers · category ceilings      │
                         │  warehouses · stock · reorder rules      │
                         │  subscription plans · upsell pairings    │
                         └──────────────────────────────────────────┘
                                            │
                                            ▼
   ┌──────────┐   adds lines,    ┌─────────────────────┐
   │ Sales Rep│──── discounts ──▶│  Quotation Builder  │◀── live upsell panel
   └──────────┘                  │  live margin + risk │    (margin delta shown
                                 └─────────────────────┘     before you add)
                                            │ submit
                                            ▼
                              ╔═════════════════════════╗
                              ║  BLENDED RISK ROUTER    ║
                              ║  sum of per-line        ║
                              ║  overages vs their own  ║
                              ║  ceilings               ║
                              ╚═════════════════════════╝
                        score ≤ mgr │ ≤ finance │ > finance
                                    │           │
              ┌─────────────────────┼───────────┼────────────────────┐
              ▼                     ▼           ▼                    │
        auto-approved      Sales Manager   Manager → Finance         │
              │                     │           │                    │
              └─────────────────────┴───────────┘                    │
                                    │ approved                       │
                                    ▼                                │
                        ┌───────────────────────┐                    │
                        │  Send to Customer     │                    │
                        │  (magic-link portal)  │                    │
                        └───────────────────────┘                    │
                                    │                                │
                     ┌──────────────┴───────────────┐                │
                     ▼                              ▼                │
             comment / line question        counter discount         │
                     │                              │                │
                     └──────────► Confirm ◀─────────┘                │
                                    │                                │
                     terms changed beyond threshold? ────────────────┘
                                    │ no
                                    ▼
              ┌─────────────────────────────────────────┐
              │  Fulfilment — warehouse split           │
              │  cheapest single site, else split;      │
              │  shortfall → backorder → consolidate    │
              └─────────────────────────────────────────┘
                                    │
                                    ▼
              ┌─────────────────────────────────────────┐
              │  Billing — one-time invoice AND         │
              │  recurring schedule on one order        │
              │  proration · pause · cancel → credit    │
              └─────────────────────────────────────────┘
                                    │
                                    ▼
                      payment recorded → invoice settled

   Throughout:  audit log · deal-health alerts · notifications · reporting
```

---

## Roles and what each can do

**Customers page** (Sell → Customers, every role) — each customer has contact details, billing
and shipping addresses, a tax/GST ID, payment terms, notes, an **owner** (a rep) and a list of
**contacts**. Quote links are emailed to the **primary contact** when there is one, otherwise to
the customer's own email. Reps own the customers they create and can edit only those; managers
and admins edit any customer and set its tier and owner; finance can view.

**Quote details** — every quotation carries who it's addressed to (a customer contact, defaulting
to the primary), a **valid-until** date (30 days by default; the customer can't confirm an expired
quote), the customer's PO number, **payment terms** (copied from the customer; invoices fall due on
them), notes to the customer, terms & conditions, and **internal notes** that never reach the
portal. Customer-facing details lock once the quote leaves draft; internal notes stay editable.

**Sales Rep** — builds quotations, applies line and order discounts, adds upsell items,
tracks approval and fulfilment progress on their own deals, and answers customer
negotiation requests. A rep is scoped to their own pipeline everywhere: another rep's
quotation returns 403, and the cross-quotation invoice, fulfilment and subscription
screens are not theirs to open. They can watch their own deal's fulfilment and billing
pages, but the decisions there belong to Finance. Reps add the customers they sell to
(from the New quotation dialog); a rep's customer always starts on the Bronze tier, since
tier sets prices and discount ceilings.

**Sales Manager** — reviews the first approval step, approves / rejects / returns for
revision (a reason is mandatory, enforced server-side), configures discount tiers,
category ceilings and the approval-chain thresholds, works the deal-health board, and
manages the catalogue (products, categories, variants, price lists, pairings, plans),
warehouses, stock and customer tiers.

**Finance / Operations** — handles the second-level approval on high-risk discounts,
owns warehouse splits and backorder decisions, and reconciles recurring billing, credit
notes and payments.

**Customer (portal user)** — opens a token-gated page with no account, comments on
specific lines, counters the discount, requests a delivery date, and confirms in one
click. Cost and margin never reach this view.

**Bulk import** — managers and admins can load customers and products from a CSV or Excel
file (Config → Customers / Products → Import). Download the template, upload, check the
per-row preview (new / update / skip / error), then import. Existing records are matched by
email or SKU; an import with any bad row writes nothing.

**Admin** — everything above, plus user management: create users, change roles, and
**block / unblock** accounts. A blocked user can't sign in and any open session stops on
its next request (the server re-reads the account on every request). Admins can't block,
demote or delete themselves. Deleting customers is admin-only.

### Approvals are a role queue, not a per-person assignment

Any manager can take any pending manager step; any finance user can take a finance step
once the manager step has cleared. Nobody is pre-assigned. The **Assigned To** column
therefore shows who last acted, not who owes the decision.

The Approvals screen offers three scopes:

- **Needs my decision** — what you can act on right now. Default for manager and finance.
- **My approvals** — every deal your step is part of, including ones the other approver
  still holds. A two-signature deal appears here for both people, marked *waiting on…*.
- **All approvals** — the whole pipeline. Default for admin.

---

## Core business logic

All of it lives in application code, unit-tested in isolation, with no faked demo paths.

### Blended discount risk

Each line is measured against **its own** ceiling — `min(tier ceiling, category ceiling)`
— not one limit for the whole order. The score is the **sum of every line's overage**.

The brief's worked example, which the test suite pins exactly:

| Line | Given | Allowed | Over by |
| --- | --- | --- | --- |
| Laptop (Hardware) | 12% | 15% | — |
| Setup Service (Services) | 18% | 10% | **8** |

One line broke a stricter limit, so the whole quote is flagged. And because the score is a
sum, many small overages (2 + 3 + 2) add up and cross the bar even when no single line
looks alarming — which is the point of blending.

Two configurable thresholds turn the score into a chain:

| Score | Chain |
| --- | --- |
| ≤ manager threshold (default 5) | auto-approved |
| ≤ finance threshold (default 12) | Sales Manager |
| above that | Sales Manager → Finance |

The order-level discount stacks onto every line for scoring. A missing tier ceiling
**fails closed** — with no configured discretion, any discount is over the limit.

→ [`services/risk.ts`](server/src/services/risk.ts)

### Warehouse split

Prefer the cheapest single warehouse that can fill the line outright (one shipment);
otherwise fill greedily cheapest-first by shipping-cost weight. Any shortfall becomes a
backorder row, and **Consolidate** sweeps it up once stock arrives. Services and
subscriptions have no stock rows and are never treated as a shortfall.

A manual override may move units *between* warehouses but never invent them — allocating
more than the line needs is rejected, including when the excess is spread across sites.

→ [`services/fulfillment.ts`](server/src/services/fulfillment.ts), [`services/replenishment.ts`](server/src/services/replenishment.ts)

### Hybrid billing

One order produces a one-time invoice **and** a separate recurring schedule. Month
arithmetic is clamped, so a 31st-of-the-month billing date doesn't skip February;
proration uses the real calendar length of the period, not a nominal 30 days. Pausing
suspends billing and resuming rolls the next date forward rather than back-billing the
gap. Cancelling raises a prorated refund credit note. A partial payment leaves the invoice
open; only one that clears the balance settles it.

→ [`services/billing.ts`](server/src/services/billing.ts), [`services/pricing.ts`](server/src/services/pricing.ts)

### Deal health

Stalled deals (inactive beyond a configured threshold), discount anomalies (a quote well
above *that rep's own* historical average, so a consistently aggressive rep isn't flagged
for their baseline), and delivery slippage from open backorders. Nudge and escalate both
land in the audit trail.

→ [`services/anomaly.ts`](server/src/services/anomaly.ts)

### Audit trail

Every submission, approval, rejection, edit, customer action, fulfilment and payment is
recorded with user, timestamp and reason. Customer portal actions carry no internal user,
so they are attributed to the customer. Notifications are **derived** from this trail
rather than fanned out into a second table.

---

## Architecture

```
client/                          React 19 · Vite 8 · Tailwind 4 · TanStack Query
  src/pages/                     one file per screen (Landing.tsx is the public home)
  src/components/ThemeToggle.tsx light/dark switch; index.html applies it before first paint
  src/index.css                  design tokens for both themes (warm neutrals, indigo accent)
  src/components/                AppShell (sidebar + top bar), CommandPalette, DataTable, KanbanBoard…
  src/hooks/useLiveUpdates.ts    socket subscription, debounced
  src/lib/                       api client, pricing mirror, role labels

server/                          Express 5 · TypeScript · Drizzle ORM · PostgreSQL
  src/routes/                    thin — auth guards and validation only
  src/controllers/               request handling and orchestration
  src/services/                  PURE business logic, no DB, unit-tested
  src/models/schema.ts           single source of truth for the data model
  src/config/socket.ts           coalesced live-update broadcast
```

**Why services are pure.** Risk scoring, pricing, splitting, billing maths and anomaly
detection take plain inputs and return plain outputs. They never touch the database, so
they are tested directly and the rules can be read in one sitting.

**Live updates.** Every successful mutation broadcasts one coarse `data:changed` event and
clients refetch their active queries. Only signed-in users can open the socket — the
handshake checks the session cookie. Both ends coalesce bursts — 250 ms on the server,
400 ms on the client — so twenty rapid edits cost one refetch rather than twenty. A
backgrounded tab marks its data stale instead of polling.

**Money** is `NUMERIC(12,2)` everywhere, never a float. Line prices and costs are
snapshotted onto the quote so later catalogue changes can't rewrite history. Quotation and
invoice numbers come from Postgres sequences, so two reps creating a quote in the same
instant can never collide.

**Security.** httpOnly JWT cookie; bcrypt passwords; optional **two-factor authentication** (authenticator-app codes, RFC 6238, secret encrypted at rest, 10 single-use recovery codes; Profile → Two-factor authentication); **Google sign-in** (OpenID Connect code flow with state check, verified email required); helmet; rate limiting on the
credential endpoints keyed per account per IP (so one attacker can't lock out an office);
Zod validation on every write; friendly DB errors that never leak SQL. The customer portal
is a genuinely separate unauthenticated router whose projection omits cost and margin.

---

## Data model

25 tables. The spine:

```
users ──< quotations >── customers
              │
              ├──< quote_lines >── products ──< product_variants
              │         │                  └──< price_list_items (per tier)
              │         │                  └──< product_pairings  (upsell)
              │         │
              │         ├──< fulfillment_allocations >── warehouses ──< stock
              │         └──< billing_schedules >── subscription_plans
              │
              ├──< approvals            (manager / finance steps)
              ├──< audit_log            (immutable history)
              ├──< negotiation_requests (customer portal)
              ├──< quote_versions       (frozen copy per send; the signed one)
              ├──< invoices >── payments
              └──< credit_notes

discount_tiers · category_discount_ceilings · app_settings   (governance config)
users ──< sessions   (one row per signed-in device; not under row-level security, always read by user)
```

- `app_settings` is a singleton holding the approval thresholds, minimum upsell margin and
  stalled-deal window.
- `approvals.approver_id` is written when someone **acts**, not when the step is created —
  there is no pre-assignment.
- `fulfillment_allocations` with a null `warehouse_id` are backorder rows.

---

## API surface

All routes are under `/api`. Every route except `/auth/*` and `/portal/*` requires the
session cookie.

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/signup·login·logout·forgot-password·reset-password`, `GET·PATCH /auth/me`, `POST /auth/mfa/setup·enable·disable·verify`, `GET /auth/providers·google·google/callback`, `POST /auth/verify-email[/resend]`, `GET /auth/sessions`, `POST /auth/sessions/revoke-others`, `DELETE /auth/sessions/:id` |
| Plan | `GET /plan` (any signed-in user), `POST /plan/checkout·confirm·portal` (admin), `POST /plan/webhook` *(Stripe, signature-checked)* |
| Company | `GET /config/company` (signed-in), `PATCH /config/company` (admin) |
| Team *(admin)* | `POST /config/users/invite`, `GET /config/users/:id` (devices, owned work), `POST /config/users/:id/sign-out·transfer` |
| Catalogue | `GET /customers`, `GET /products` |
| Quotations | `GET·POST /quotations` (with `?page` it returns `{ rows, total }` — paged, searchable `q`, `status`, `customerId`, `flagged`, `sort`, `dir`), `GET /quotations/board` (Kanban: newest 25 per status + true counts), `GET·PATCH·DELETE /quotations/:id`, `POST /:id/submit·cancel·send`, `POST·PATCH·DELETE /:id/lines`, `GET /:id/upsell`, `GET·PATCH /:id/negotiations` |
| Versions | `GET /quotations/:id/versions`, `GET /quotations/:id/versions/:version`, `GET /quotations/:id/versions/compare?from=&to=` |
| Approvals | `GET /approvals`, `GET /approvals/:id`, `POST /approvals/:id/action` |
| Fulfilment | `GET /quotations/:id/fulfillment/suggestion·allocations`, `POST /:id/fulfillment/accept·consolidate`, `POST /stock/:id/receive` |
| Billing | `GET·POST /quotations/:id/billing[/generate]`, `POST /:id/billing/subscriptions/:lineId/change·cancel·pause·resume`, `POST /invoices/:id/pay` |
| Portal *(public)* | `GET /portal/:token`, `POST /portal/:token/negotiate·confirm` (confirm needs `{ signerName, agree: true }`) |
| Ops | `GET /summary` (tasks, KPIs, charts, setup checklist; scoped per role), `GET /notifications`, `GET /invoices·fulfillment-queue·subscriptions`, `GET /invoices/:id[/pdf[?inline=1]]`, `POST /invoices/:id/email` `{ to, message? }` (manager, finance, admin only) |
| Dashboard | `GET /dashboard`, `POST /dashboard/quotations/:id/nudge·escalate` |
| Reports | `GET /reports·/filters·/export?format=pdf\|xls` |
| Config | `GET·POST·PATCH·DELETE /config/{products,categories,customers,variants,price-list,pairings,warehouses,stock,subscription-plans,discount-tiers,category-ceilings,users}`, `GET·PATCH /config/settings`, `GET /config/products/:id/stock·/config/categories-list·/config/audit` |
| Customers | `GET /customers`, `GET /customers/:id` (with contacts), `POST /customers/:id/contacts`, `PATCH·DELETE /contacts/:id`; edits via `PATCH /config/customers/:id` |
| Bulk import | `GET /config/import/{customers,products}/template`, `POST /config/import/{customers,products}` (`{ filename, data: base64, mode: update\|skip, commit }`, manager + admin) |

---

## Testing

CI (`.github/workflows/ci.yml`) runs on every PR and push to `main`: type-check, unit tests,
migrate + seed a fresh Postgres, lint + build the client, then the full e2e suite. (The Docker
image check is switched off for now; the `Dockerfile` is still there and the job can be added back.)

```bash
cd server && npm test          # unit tests — pure business logic
cd client && npm run test:e2e  # end-to-end, all roles, real browser (~3 min, 4 workers)
cd client && npm run test:e2e:relevant   # only the specs for what you changed vs main (seconds)
# E2E_DRY=1 npm run test:e2e:relevant    # just show which specs it would run
```

**Unit** (10 files) cover the pure services: risk scoring, pricing, warehouse splitting,
billing maths and proration, replenishment, anomaly detection, auth, mail templates,
production env checks and socket cookie parsing.

**End-to-end** (16 spec files) drive the real UI in Chrome and cover every role: auth and
RBAC, the quotation builder, the approval chain, fulfilment and backorders, hybrid billing
and payments, the customer portal, configuration and reporting, notifications, filters,
live updates, the landing page, themes, the app shell and command palette, plus a smoke pass that opens every screen for every role and fails on any
console error or 5xx. A `10-guards.spec.ts` file holds regression guards for defects found
during the audit.

Playwright drives the locally installed Chrome (`channel: 'chrome'`) rather than
downloading its own browser. If ports 4000/5173 are taken, run the servers elsewhere and point
the suite at them with `E2E_BASE_URL` and `E2E_API_URL`.

---

## What we'd build next

With more time, in rough priority order:

1. **Tax.** `products.tax_rate` is captured and editable but not yet applied to totals or
   invoices — figures today are pre-tax. Wiring it through pricing, the portal and the
   invoice PDF is the first thing we'd finish.
2. **Product-level reporting.** Reports filter *by* category but output per-quotation
   rows; best-selling and most-discounted product rankings are still to come.
3. **Real approval assignment.** Today it's a role queue. Named assignees, reassignment
   and an "assigned to me" view would suit larger teams.
4. **Richer approval chains.** More than two steps, per-category or per-tier chains, and
   value-based routing alongside discount-based routing.
5. **Multi-currency.** Price lists carry a tier but not a currency.
6. **Notification durability.** Read state is a per-browser stamp; a `notification_reads`
   table would follow a user across devices, and email/Slack digests would reach people
   who aren't in the app.
7. **Portal token lifecycle.** Links never expire and can't be revoked individually.
8. **Server-side pagination.** List endpoints return the full set and paginate in the
   browser — fine at demo scale, not at ten thousand quotations.
