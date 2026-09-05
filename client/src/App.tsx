import { Routes, Route } from 'react-router-dom'
import Login from '@/pages/Login'
import Signup from '@/pages/Signup'
import ForgotPassword from '@/pages/ForgotPassword'
import ResetPassword from '@/pages/ResetPassword'
import Dashboard from '@/pages/Dashboard'
import Admin from '@/pages/Admin'
import Quotations from '@/pages/Quotations'
import QuotationBuilder from '@/pages/QuotationBuilder'
import Fulfillment from '@/pages/Fulfillment'
import Billing from '@/pages/Billing'
import Portal from '@/pages/Portal'
import Approvals from '@/pages/Approvals'
import ApprovalDetail from '@/pages/ApprovalDetail'
import DealHealth from '@/pages/DealHealth'
import Reports from '@/pages/Reports'
import ProtectedRoute from '@/components/ProtectedRoute'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      {/* public, token-gated customer portal — separate from the internal app */}
      <Route path="/portal/:token" element={<Portal />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/quotations" element={<Quotations />} />
        <Route path="/quotations/:id" element={<QuotationBuilder />} />
        <Route path="/quotations/:id/fulfillment" element={<Fulfillment />} />
        <Route path="/quotations/:id/billing" element={<Billing />} />
      </Route>
      <Route element={<ProtectedRoute roles={['manager', 'finance', 'admin']} />}>
        <Route path="/approvals" element={<Approvals />} />
        <Route path="/approvals/:id" element={<ApprovalDetail />} />
        <Route path="/deal-health" element={<DealHealth />} />
        <Route path="/reports" element={<Reports />} />
      </Route>
      <Route element={<ProtectedRoute roles={['admin']} />}>
        <Route path="/admin" element={<Admin />} />
      </Route>
    </Routes>
  )
}
