import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { StoreProvider } from '../../store/StoreContext'
import { AuthProvider } from '../../auth/AuthContext'
import { Layout } from '../../components/Layout'
import { ProtectedRoute } from '../../components/ProtectedRoute'
import { Login } from '../../pages/Login'
import { Dashboard } from '../../pages/Dashboard'
import { Pos } from '../../pages/Pos'
import { Comandas } from '../../pages/Comandas'
import { Cocina } from '../../pages/Cocina'
import { Mesas } from '../../pages/Mesas'
import { Reservas } from '../../pages/Reservas'
import { MenuPage } from '../../pages/Menu'
import { Inventario } from '../../pages/Inventario'
import { Usuarios } from '../../pages/Usuarios'
import { Clientes } from '../../pages/Clientes'
import { Conductores } from '../../pages/Conductores'
import { Reportes } from '../../pages/Reportes'
import { PedidosWeb } from '../../pages/PedidosWeb'
import { Sucursales } from '../../pages/Sucursales'
import { Facturacion } from '../../pages/Facturacion'
import { WhatsApp } from '../../pages/WhatsApp'
import { Configuracion } from '../../pages/Configuracion'
import { WebConfig } from '../../pages/WebConfig'
import { Cupones } from '../../pages/Cupones'
import { BASENAME } from '../../lib/paths'
import { VersionUpdateWatcher } from '../../components/VersionUpdateWatcher'

export default function App() {
  return (
    <StoreProvider>
      <AuthProvider>
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
      </AuthProvider>
    </StoreProvider>
  )
}
