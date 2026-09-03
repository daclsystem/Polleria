import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { StoreProvider } from '../../store/StoreContext'
import { AuthProvider } from '../../auth/AuthContext'
import { WebLanding } from '../../pages/WebLanding'
import { WebAccount } from '../../pages/WebAccount'
import { WebReservar } from '../../pages/WebReservar'
import { OrderTracking } from '../../pages/OrderTracking'
import { WebCalificar } from '../../pages/WebCalificar'
import { BASENAME } from '../../lib/paths'
import { VersionUpdateWatcher } from '../../components/VersionUpdateWatcher'
import { OfflineBanner } from '../../components/OfflineBanner'
import { ThemeProvider } from '../../components/ThemeProvider'
import { ConfirmDialogProvider } from '../../components/ConfirmDialogContext'
import { OtherAppHint } from './OtherAppHint'

export default function App() {
  return (
    <ThemeProvider>
    <StoreProvider>
      <AuthProvider>
        <ConfirmDialogProvider>
        <OfflineBanner />
        <VersionUpdateWatcher />
        <BrowserRouter basename={BASENAME || undefined}>
          <Routes>
            <Route path="/" element={<WebLanding />} />
            <Route path="/cuenta" element={<WebAccount />} />
            <Route path="/reservar" element={<WebReservar />} />
            <Route path="/seguimiento/:orderId" element={<OrderTracking />} />
            <Route path="/calificar/:orderId" element={<WebCalificar />} />
            <Route path="/system/*" element={<OtherAppHint app="system" />} />
            <Route path="/driver/*" element={<OtherAppHint app="driver" />} />
            <Route path="/cliente/*" element={<OtherAppHint app="cliente" />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        </ConfirmDialogProvider>
      </AuthProvider>
    </StoreProvider>
    </ThemeProvider>
  )
}
