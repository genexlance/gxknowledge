import AuthGate from '../admin/AuthGate'
import AdminPage from '../admin/AdminPage'

export default function AdminRoute() {
  return (
    <AuthGate>
      <AdminPage />
    </AuthGate>
  )
}


