import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ROLE_HOME, type ModuleId } from '../types'

export function ProtectedRoute({
  children,
  module,
}: {
  children: ReactNode
  module?: ModuleId
}) {
  const { user, actingRole, needsViewPick, can } = useAuth()
  const location = useLocation()

  if (!user || needsViewPick) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  if (module && !can(module)) {
    return <Navigate to={ROLE_HOME[actingRole]} replace />
  }
  return children
}
