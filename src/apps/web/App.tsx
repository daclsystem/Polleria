import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { StoreProvider } from '../../store/StoreContext'
import { AuthProvider } from '../../auth/AuthContext'
import { WebLanding } from '../../pages/WebLanding'
import { WebAccount } from '../../pages/WebAccount'
import { WebReservar } from '../../pages/WebReservar'
import { OrderTracking } from '../../pages/OrderTracking'
import { BASENAME } from '../../lib/paths'
import { VersionUpdateWatcher } from '../../components/VersionUpdateWatcher'

export default function App() {
  return (
    <StoreProvider>
      <AuthProvider>
        <VersionUpdateWatcher />
        <BrowserRouter basename={BASENAME || undefined}>
          <Routes>
            <Route path="/" element={<WebLanding />} />
            <Route path="/cuenta" element={<WebAccount />} />
            <Route path="/reservar" element={<WebReservar />} />
            <Route path="/seguimiento/:orderId" element={<OrderTracking />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </StoreProvider>
  )
}
