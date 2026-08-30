import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { StoreProvider } from './store/StoreContext'
import { AuthProvider } from './auth/AuthContext'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Pos } from './pages/Pos'
import { Comandas } from './pages/Comandas'
import { Cocina } from './pages/Cocina'
import { Mesas } from './pages/Mesas'
import { Reservas } from './pages/Reservas'
import { MenuPage } from './pages/Menu'
import { Inventario } from './pages/Inventario'
import { Usuarios } from './pages/Usuarios'
import { Clientes } from './pages/Clientes'
import { Conductores } from './pages/Conductores'
import { Reportes } from './pages/Reportes'
import { PedidosWeb } from './pages/PedidosWeb'
import { Sucursales } from './pages/Sucursales'
import { Facturacion } from './pages/Facturacion'
import { WhatsApp } from './pages/WhatsApp'
import { Configuracion } from './pages/Configuracion'
import { WebConfig } from './pages/WebConfig'
import { Cupones } from './pages/Cupones'
import { CustomerApp } from './pages/Customer'
import { WebLanding } from './pages/WebLanding'
import { WebAccount } from './pages/WebAccount'
import { WebReservar } from './pages/WebReservar'
import { OrderTracking } from './pages/OrderTracking'
import { ConductorApp } from './pages/ConductorApp'
import { BASENAME } from './lib/paths'
import { OfflineBanner } from './components/OfflineBanner'
import { ThemeProvider } from './components/ThemeProvider'

export default function App() {
  return (
    <ThemeProvider>
    <StoreProvider>
      <AuthProvider>
        <OfflineBanner />
        <BrowserRouter basename={BASENAME}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/conductor" element={<ConductorApp />} />
            <Route path="/web" element={<WebLanding />} />
            <Route path="/web/cuenta" element={<WebAccount />} />
            <Route path="/web/reservar" element={<WebReservar />} />
            <Route path="/web/seguimiento/:orderId" element={<OrderTracking />} />
            <Route path="/pedir" element={<CustomerApp />} />            <Route path="/pedir/:orderId" element={<CustomerApp />} />
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
                    <PedidosWeb />
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
            </Route>
              <Route
                path="/cupones"
                element={
                  <ProtectedRoute module="cupones">
                    <Cupones />
                  </ProtectedRoute>
                }
              />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </StoreProvider>
    </ThemeProvider>
  )
}
