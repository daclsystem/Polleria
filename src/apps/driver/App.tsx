import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { StoreProvider } from '../../store/StoreContext'
import { AuthProvider } from '../../auth/AuthContext'
import { ConductorApp } from '../../pages/ConductorApp'
import { DriverDeliveryMap } from '../../pages/DriverDeliveryMap'
import { BASENAME } from '../../lib/paths'
import { VersionUpdateWatcher } from '../../components/VersionUpdateWatcher'
import { OfflineBanner } from '../../components/OfflineBanner'
import { ThemeProvider } from '../../components/ThemeProvider'
import { ConfirmDialogProvider } from '../../components/ConfirmDialogContext'

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
            <Route path="/" element={<ConductorApp />} />
            <Route path="/pedido/:orderId" element={<DriverDeliveryMap />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        </ConfirmDialogProvider>
      </AuthProvider>
    </StoreProvider>
    </ThemeProvider>
  )
}
