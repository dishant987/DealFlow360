# DealFlow360

An intelligent, self-governing B2B sales operations platform — from quotation to cash.

Most sales tools handle the happy path: create a quote, confirm it, invoice it. Real B2B
teams work in messier conditions — multi-level discount approvals, partial stock spread
across warehouses, subscriptions bundled with one-time hardware, customers who want to
negotiate rather than email, and managers who find out a deal stalled only after it died.

DealFlow360 enforces pricing discipline on its own, reacts to live inventory, keeps
recurring and one-time billing reconciled on a single order, and gives the customer a
living document instead of a static PDF.

---

## Table of contents

- [Quick start](#quick-start)
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
createdb dealflow360
```

**Server**

```bash
cd server
cp .env.example .env        # set DATABASE_URL and JWT_SECRET
npm install
npm run db:push             # create the schema
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
| `DATABASE_URL` | Postgres connection string. Append `?sslmode=require` for a hosted DB and SSL turns on automatically. |
| `JWT_SECRET` | Signs the session cookie. Use a long random string. |
| `CLIENT_URL` | Used to build customer portal links. |
| `SMTP_*` | Optional. Without it, portal and password-reset links print to the server console. |
| `MAIL_ENABLED` | Set to `false` to print links to the console even when SMTP is configured — use it while testing. |
| `NODE_ENV` | `production` turns on HTTPS-only cookies and `trust proxy`, and the server refuses to boot with a weak `JWT_SECRET` (< 32 chars), a localhost `CLIENT_URL` or no `DATABASE_URL`. |
| `CORS_ORIGINS` | Optional comma-separated allow-list for the API and socket. Defaults to `CLIENT_URL`. |
| `DB_SSL_ALLOW_SELF_SIGNED` | Set to `true` only if your hosted Postgres uses a self-signed certificate; otherwise the certificate is verified. |
| `ALLOW_DESTRUCTIVE_SEED` | `db:seed` refuses to run with `NODE_ENV=production` unless this is `true`. |

Client build settings:

| Variable | Purpose |
| --- | --- |
| `VITE_SHOW_DEMO_LOGINS` | The demo-account buttons show in `npm run dev` only. Set to `true` for an internal staging build that should show them. |
| `VITE_API_TARGET` | Dev-server proxy target for `/api` and `/socket.io` (default `http://localhost:4000`). |

In production, serve the client and API from one origin (a reverse proxy routing `/api` and `/socket.io` to the server); the client calls both with relative URLs.

`npm run db:seed` is destructive — it clears every table and rebuilds a full demo
pipeline: 6 users, 12 customers across all three tiers, 11 products (hardware, services,
subscriptions), tier price overrides, variants, upsell pairings, 3 warehouses (Main Warehouse, East Depot, West Hub) with stock
and reorder rules, and roughly 80 quotations spread across every stage, complete with
approvals, negotiations, fulfilments, invoices and payments.

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

**Sales Rep** — builds quotations, applies line and order discounts, adds upsell items,
tracks approval and fulfilment progress on their own deals, and answers customer
negotiation requests. A rep is scoped to their own pipeline everywhere: another rep's
quotation returns 403, and the cross-quotation invoice, fulfilment and subscription
screens are not theirs to open. They can watch their own deal's fulfilment and billing
pages, but the decisions there belong to Finance.

**Sales Manager** — reviews the first approval step, approves / rejects / returns for
revision (a reason is mandatory, enforced server-side), configures discount tiers,
category ceilings and the approval-chain thresholds, and works the deal-health board.

**Finance / Operations** — handles the second-level approval on high-risk discounts,
owns warehouse splits and backorder decisions, and reconciles recurring billing, credit
notes and payments.

**Customer (portal user)** — opens a token-gated page with no account, comments on
specific lines, counters the discount, requests a delivery date, and confirms in one
click. Cost and margin never reach this view.

**Admin** — full backend setup and platform-wide analytics.

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
  src/pages/                     one file per screen
  src/components/                AppShell, DataTable, KanbanBoard, NotificationBell…
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

**Security.** httpOnly JWT cookie; bcrypt passwords; helmet; rate limiting on the
credential endpoints keyed per account per IP (so one attacker can't lock out an office);
Zod validation on every write; friendly DB errors that never leak SQL. The customer portal
is a genuinely separate unauthenticated router whose projection omits cost and margin.

---

## Data model

23 tables. The spine:

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
              ├──< invoices >── payments
              └──< credit_notes

discount_tiers · category_discount_ceilings · app_settings   (governance config)
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
| Auth | `POST /auth/signup·login·logout·forgot-password·reset-password`, `GET·PATCH /auth/me` |
| Catalogue | `GET /customers`, `GET /products` |
| Quotations | `GET·POST /quotations`, `GET·PATCH·DELETE /quotations/:id`, `POST /:id/submit·cancel·send`, `POST·PATCH·DELETE /:id/lines`, `GET /:id/upsell`, `GET·PATCH /:id/negotiations` |
| Approvals | `GET /approvals`, `GET /approvals/:id`, `POST /approvals/:id/action` |
| Fulfilment | `GET /quotations/:id/fulfillment/suggestion·allocations`, `POST /:id/fulfillment/accept·consolidate`, `POST /stock/:id/receive` |
| Billing | `GET·POST /quotations/:id/billing[/generate]`, `POST /:id/billing/subscriptions/:lineId/change·cancel·pause·resume`, `POST /invoices/:id/pay` |
| Portal *(public)* | `GET /portal/:token`, `POST /portal/:token/negotiate·confirm` |
| Ops | `GET /summary·notifications` (scoped per role), `GET /invoices·fulfillment-queue·subscriptions`, `GET /invoices/:id[/pdf]` (manager, finance, admin only) |
| Dashboard | `GET /dashboard`, `POST /dashboard/quotations/:id/nudge·escalate` |
| Reports | `GET /reports·/filters·/export?format=pdf\|xls` |
| Config | `GET·POST·PATCH·DELETE /config/{products,categories,customers,variants,price-list,pairings,warehouses,stock,subscription-plans,discount-tiers,category-ceilings,users}`, `GET·PATCH /config/settings`, `GET /config/products/:id/stock·/config/categories-list·/config/audit` |

---

## Testing

```bash
cd server && npm test          # unit tests — pure business logic
cd client && npm run test:e2e  # end-to-end, all roles, real browser
```

**Unit** (10 files) cover the pure services: risk scoring, pricing, warehouse splitting,
billing maths and proration, replenishment, anomaly detection, auth, mail templates,
production env checks and socket cookie parsing.

**End-to-end** (14 spec files) drive the real UI in Chrome and cover every role: auth and
RBAC, the quotation builder, the approval chain, fulfilment and backorders, hybrid billing
and payments, the customer portal, configuration and reporting, notifications, filters,
live updates, plus a smoke pass that opens every screen for every role and fails on any
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
