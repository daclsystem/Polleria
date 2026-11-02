import { lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { StoreProvider } from '../../store/StoreContext'
import { AuthProvider } from '../../auth/AuthContext'
import { Layout } from '../../components/Layout'
import { ProtectedRoute } from '../../components/ProtectedRoute'
import { Login } from '../../pages/Login'
import { BASENAME } from '../../lib/paths'
import { VersionUpdateWatcher } from '../../components/VersionUpdateWatcher'
import { OfflineBanner } from '../../components/OfflineBanner'
import { ThemeProvider } from '../../components/ThemeProvider'
import { ConfirmDialogProvider } from '../../components/ConfirmDialogContext'

// Cada módulo se descarga cuando se abre; el acceso no carga mapas, reportes ni editores.
const Dashboard = lazy(() => import('../../pages/Dashboard').then((m) => ({ default: m.Dashboard })))
const Pos = lazy(() => import('../../pages/Pos').then((m) => ({ default: m.Pos })))
const Comandas = lazy(() => import('../../pages/Comandas').then((m) => ({ default: m.Comandas })))
const Cocina = lazy(() => import('../../pages/Cocina').then((m) => ({ default: m.Cocina })))
const Mesas = lazy(() => import('../../pages/Mesas').then((m) => ({ default: m.Mesas })))
const Reservas = lazy(() => import('../../pages/Reservas').then((m) => ({ default: m.Reservas })))
const MenuPage = lazy(() => import('../../pages/Menu').then((m) => ({ default: m.MenuPage })))
const Inventario = lazy(() => import('../../pages/Inventario').then((m) => ({ default: m.Inventario })))
const Usuarios = lazy(() => import('../../pages/Usuarios').then((m) => ({ default: m.Usuarios })))
const Clientes = lazy(() => import('../../pages/Clientes').then((m) => ({ default: m.Clientes })))
const Conductores = lazy(() => import('../../pages/Conductores').then((m) => ({ default: m.Conductores })))
const Reportes = lazy(() => import('../../pages/Reportes').then((m) => ({ default: m.Reportes })))
const PedidosWeb = lazy(() => import('../../pages/PedidosWeb').then((m) => ({ default: m.PedidosWeb })))
const Sucursales = lazy(() => import('../../pages/Sucursales').then((m) => ({ default: m.Sucursales })))
const Facturacion = lazy(() => import('../../pages/Facturacion').then((m) => ({ default: m.Facturacion })))
const WhatsApp = lazy(() => import('../../pages/WhatsApp').then((m) => ({ default: m.WhatsApp })))
const Configuracion = lazy(() => import('../../pages/Configuracion').then((m) => ({ default: m.Configuracion })))
const WebConfig = lazy(() => import('../../pages/WebConfig').then((m) => ({ default: m.WebConfig })))
const Cupones = lazy(() => import('../../pages/Cupones').then((m) => ({ default: m.Cupones })))
const ImprimirQR = lazy(() => import('../../pages/ImprimirQR').then((m) => ({ default: m.ImprimirQR })))
const SalonMesas = lazy(() => import('../../pages/SalonMesas').then((m) => ({ default: m.SalonMesas })))

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
            <Route path="/login" element={<Login />} />
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route
                path="/"
                element={
                  <ProtectedRoute module="dashboard">
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/pos"
                element={
                  <ProtectedRoute module="pos">
                    <Pos />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/comandas"
                element={
                  <ProtectedRoute module="comandas">
                    <Comandas />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/cocina"
                element={
                  <ProtectedRoute module="cocina">
                    <Cocina />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/mesas"
                element={
                  <ProtectedRoute module="mesas">
                    <Mesas />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reservas"
                element={
                  <ProtectedRoute module="reservas">
                    <Reservas />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/menu"
                element={
                  <ProtectedRoute module="menu">
                    <MenuPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin-mesas"
                element={
                  <ProtectedRoute module="admin-mesas">
                    <SalonMesas />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/inventario"
                element={
                  <ProtectedRoute module="inventario">
                    <Inventario />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/usuarios"
                element={
                  <ProtectedRoute module="usuarios">
                    <Usuarios />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/clientes"
                element={
                  <ProtectedRoute module="clientes">
                    <Clientes />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/conductores"
                element={
                  <ProtectedRoute module="conductores">
                    <Conductores />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reportes"
                element={
                  <ProtectedRoute module="reportes">
                    <Reportes />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/pedidos-web"
                element={
                  <ProtectedRoute module="pedidos-web">
                    <PedidosWeb vista="curso" />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/historial"
                element={
                  <ProtectedRoute module="historial">
                    <PedidosWeb vista="historial" />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/web-config"
                element={
                  <ProtectedRoute module="web-config">
                    <WebConfig />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/sucursales"
                element={
                  <ProtectedRoute module="sucursales">
                    <Sucursales />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/facturacion"
                element={
                  <ProtectedRoute module="facturacion">
                    <Facturacion />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/whatsapp"
                element={
                  <ProtectedRoute module="whatsapp">
                    <WhatsApp />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/config"
                element={
                  <ProtectedRoute module="config">
                    <Configuracion />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/imprimir-qr"
                element={
                  <ProtectedRoute module="imprimir-qr">
                    <ImprimirQR />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/cupones"
                element={
                  <ProtectedRoute module="cupones">
                    <Cupones />
                  </ProtectedRoute>
                }
              />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        </ConfirmDialogProvider>
      </AuthProvider>
    </StoreProvider>
    </ThemeProvider>
  )
}
