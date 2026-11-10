import { lazy, Suspense, type ComponentType } from 'react'
import { Link, Routes, Route } from 'react-router-dom'
import ProtectedRoute from '@/components/ProtectedRoute'
import { useLiveUpdates } from '@/hooks/useLiveUpdates'
import PageSkeleton from '@/components/PageSkeleton'
import { useAuth } from '@/hooks/useAuth'

// A lazy page whose chunk fails to load (a deploy replaced the hashed files, or
// the dev server re-bundled) reloads the app once to pick up the current build;
// a second failure in the same tab surfaces to the error boundary as before.
const RELOAD_FLAG = 'chunk-reload'
function page<T extends ComponentType<object>>(load: () => Promise<{ default: T }>) {
  return lazy(() =>
    load()
      .then((m) => {
        try {
          sessionStorage.removeItem(RELOAD_FLAG)
        } catch {
          /* storage blocked: nothing to clear */
        }
        return m
      })
      .catch((err) => {
        let retried = true
        try {
          retried = sessionStorage.getItem(RELOAD_FLAG) === '1'
          if (!retried) sessionStorage.setItem(RELOAD_FLAG, '1')
        } catch {
          /* storage blocked: don't risk a reload loop */
        }
        if (retried) throw err
        window.location.reload()
        return new Promise<{ default: T }>(() => {}) // the reload takes over
      }),
  )
}

// one chunk per screen, so the first load doesn't ship every page
const Login = page(() => import('@/pages/Login'))
const Signup = page(() => import('@/pages/Signup'))
const ForgotPassword = page(() => import('@/pages/ForgotPassword'))
const ResetPassword = page(() => import('@/pages/ResetPassword'))
const VerifyEmail = page(() => import('@/pages/VerifyEmail'))
const Legal = page(() => import('@/pages/Legal'))
const UserDetail = page(() => import('@/pages/UserDetail'))
const Dashboard = page(() => import('@/pages/Dashboard'))
const Admin = page(() => import('@/pages/Admin'))
const Quotations = page(() => import('@/pages/Quotations'))
const QuotationBuilder = page(() => import('@/pages/QuotationBuilder'))
const Fulfillment = page(() => import('@/pages/Fulfillment'))
const Billing = page(() => import('@/pages/Billing'))
const Invoices = page(() => import('@/pages/Invoices'))
const InvoiceDetail = page(() => import('@/pages/InvoiceDetail'))
const FulfillmentQueue = page(() => import('@/pages/FulfillmentQueue'))
const Subscriptions = page(() => import('@/pages/Subscriptions'))
const Portal = page(() => import('@/pages/Portal'))
const Profile = page(() => import('@/pages/Profile'))
const Approvals = page(() => import('@/pages/Approvals'))
const ApprovalDetail = page(() => import('@/pages/ApprovalDetail'))
const DealHealth = page(() => import('@/pages/DealHealth'))
const Reports = page(() => import('@/pages/Reports'))
const Landing = page(() => import('@/pages/Landing'))
const Customers = page(() => import('@/pages/Customers'))
const CustomerDetail = page(() => import('@/pages/CustomerDetail'))

// '/' is the marketing page for visitors and the dashboard once signed in.
function Home() {
  const { user, isLoading } = useAuth()
  if (isLoading) return <PageSkeleton />
  return user ? <Dashboard /> : <Landing />
}

export default function App() {
  useLiveUpdates()
  return (
    <Suspense fallback={<PageSkeleton />}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/privacy" element={<Legal />} />
      <Route path="/terms" element={<Legal />} />
      {/* public, token-gated customer portal — separate from the internal app */}
      <Route path="/portal/:token" element={<Portal />} />
      <Route path="/" element={<Home />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/profile" element={<Profile />} />
        <Route path="/quotations" element={<Quotations />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/customers/:id" element={<CustomerDetail />} />
        <Route path="/quotations/:id" element={<QuotationBuilder />} />
        <Route path="/quotations/:id/fulfillment" element={<Fulfillment />} />
        <Route path="/quotations/:id/billing" element={<Billing />} />
      </Route>
      {/* Cross-quotation screens span every rep's deals — a rep tracks their own
          progress from the deal itself, not from these. */}
      <Route element={<ProtectedRoute roles={['manager', 'finance', 'admin']} />}>
        <Route path="/fulfillment" element={<FulfillmentQueue />} />
        <Route path="/subscriptions" element={<Subscriptions />} />
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/invoices/:id" element={<InvoiceDetail />} />
        <Route path="/approvals" element={<Approvals />} />
        <Route path="/approvals/:id" element={<ApprovalDetail />} />
        <Route path="/deal-health" element={<DealHealth />} />
        <Route path="/reports" element={<Reports />} />
      </Route>
      <Route element={<ProtectedRoute roles={['manager', 'admin']} />}>
        <Route path="/admin" element={<Admin />} />
      </Route>
      <Route element={<ProtectedRoute roles={['admin']} />}>
        <Route path="/admin/users/:id" element={<UserDetail />} />
      </Route>
      <Route
        path="*"
        element={
          <main className="grid min-h-svh place-items-center bg-background p-6 text-center">
            <div className="space-y-3">
              <p className="font-heading text-4xl font-semibold">404</p>
              <p className="text-muted-foreground">There's no page at this address.</p>
              <Link to="/" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                Back to Dealwise
              </Link>
            </div>
          </main>
        }
      />
    </Routes>
    </Suspense>
  )
}
