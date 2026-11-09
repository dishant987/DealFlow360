import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import ProtectedRoute from '@/components/ProtectedRoute'
import { useLiveUpdates } from '@/hooks/useLiveUpdates'
import PageSkeleton from '@/components/PageSkeleton'

// one chunk per screen, so the first load doesn't ship every page
const Login = lazy(() => import('@/pages/Login'))
const Signup = lazy(() => import('@/pages/Signup'))
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'))
const ResetPassword = lazy(() => import('@/pages/ResetPassword'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Admin = lazy(() => import('@/pages/Admin'))
const Quotations = lazy(() => import('@/pages/Quotations'))
const QuotationBuilder = lazy(() => import('@/pages/QuotationBuilder'))
const Fulfillment = lazy(() => import('@/pages/Fulfillment'))
const Billing = lazy(() => import('@/pages/Billing'))
const Invoices = lazy(() => import('@/pages/Invoices'))
const InvoiceDetail = lazy(() => import('@/pages/InvoiceDetail'))
const FulfillmentQueue = lazy(() => import('@/pages/FulfillmentQueue'))
const Subscriptions = lazy(() => import('@/pages/Subscriptions'))
const Portal = lazy(() => import('@/pages/Portal'))
const Profile = lazy(() => import('@/pages/Profile'))
const Approvals = lazy(() => import('@/pages/Approvals'))
const ApprovalDetail = lazy(() => import('@/pages/ApprovalDetail'))
const DealHealth = lazy(() => import('@/pages/DealHealth'))
const Reports = lazy(() => import('@/pages/Reports'))

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
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Dashboard />} />
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
