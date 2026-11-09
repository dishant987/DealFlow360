import { lazy, Suspense, type ComponentType } from 'react'
import { Routes, Route } from 'react-router-dom'
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
      {/* public, token-gated customer portal — separate from the internal app */}
      <Route path="/portal/:token" element={<Portal />} />
      <Route path="/" element={<Home />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/profile" element={<Profile />} />
        <Route path="/quotations" element={<Quotations />} />
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
    </Routes>
    </Suspense>
  )
}
