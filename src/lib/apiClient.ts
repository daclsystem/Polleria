import { API_URL, apiUrl } from './api'
import type {
  Branch,
  Customer,
  Driver,
  InventoryItem,
  Product,
  Reservation,
  Settings,
  User,
} from '../types'

const TOKEN_KEY = 'polleria-api-token'

export function getApiToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setApiToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export function usingApi() {
  return Boolean(API_URL)
}

function isGuid(id?: string) {
  return Boolean(id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  if (!API_URL) throw new Error('VITE_API_URL no configurada')
  const headers = new Headers(options.headers || {})
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  if (options.auth !== false) {
    const token = getApiToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }
  const res = await fetch(apiUrl(path), { ...options, headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `HTTP ${res.status}`)
  }
  return data as T
}

export async function apiLogin(email: string, password: string) {
  const data = await apiFetch<{ token: string; user: { id: string; name: string; email: string; role: string } }>(
    '/api/auth/login',
    {
      method: 'POST',
      auth: false,
      body: JSON.stringify({ email, password }),
    },
  )
  setApiToken(data.token)
  return data
}

export async function apiBootstrap() {
  return apiFetch<{
    users: unknown[]
    products: unknown[]
    tables: unknown[]
    inventory: unknown[]
    settings: unknown
    orders: unknown[]
    customers: unknown[]
    reservations: unknown[]
    branches: unknown[]
    nextOrderNumber: number
    source: string
  }>('/api/catalog/bootstrap')
}

export async function apiCreateOrder(body: unknown) {
  return apiFetch<{ order: { Id?: string; id?: string; Number?: number; number?: number }; trackingUrl?: string }>(
    '/api/orders',
    {
      method: 'POST',
      auth: false,
      body: JSON.stringify(body),
    },
  )
}

export async function apiUpdateOrderStatus(id: string, status: string) {
  return apiFetch<{ order: unknown }>(`/api/orders/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

export async function apiPayOrder(
  id: string,
  payments: Array<{ method: string; amount: number; cashTendered?: number }>,
) {
  return apiFetch<{ order: unknown; paid: boolean }>(`/api/orders/${id}/payments`, {
    method: 'POST',
    body: JSON.stringify({ payments }),
  })
}

export async function apiAddOrderItems(
  id: string,
  items: unknown[],
  totals: { subtotal: number; igv: number; total: number; discount?: number },
) {
  return apiFetch<{ order: unknown }>(`/api/orders/${id}/items`, {
    method: 'POST',
    body: JSON.stringify({ items, totals }),
  })
}

export async function apiSaveProduct(product: Product) {
  if (isGuid(product.id)) {
    return apiFetch(`/api/products/${product.id}`, { method: 'PUT', body: JSON.stringify(product) })
  }
  return apiFetch<{ id: string }>('/api/products', { method: 'POST', body: JSON.stringify(product) })
}

export async function apiDeleteProduct(id: string) {
  return apiFetch(`/api/products/${id}`, { method: 'DELETE' })
}

export async function apiSaveUser(user: User) {
  if (isGuid(user.id)) {
    return apiFetch(`/api/users/${user.id}`, { method: 'PUT', body: JSON.stringify(user) })
  }
  return apiFetch<{ id: string }>('/api/users', { method: 'POST', body: JSON.stringify(user) })
}

export async function apiDeleteUser(id: string) {
  return apiFetch(`/api/users/${id}`, { method: 'DELETE' })
}

export async function apiSaveInventory(item: InventoryItem) {
  if (isGuid(item.id)) {
    return apiFetch(`/api/inventory/${item.id}`, { method: 'PUT', body: JSON.stringify(item) })
  }
  return apiFetch<{ id: string }>('/api/inventory', { method: 'POST', body: JSON.stringify(item) })
}

export async function apiAdjustStock(id: string, delta: number) {
  return apiFetch(`/api/inventory/${id}/adjust`, {
    method: 'POST',
    body: JSON.stringify({ delta }),
  })
}

export async function apiUpdateTable(id: string, patch: Record<string, unknown>) {
  return apiFetch(`/api/tables/${id}`, { method: 'PUT', body: JSON.stringify(patch) })
}

export async function apiSaveSettings(settings: Settings) {
  return apiFetch('/api/settings', { method: 'PUT', body: JSON.stringify(settings) })
}

export async function apiSaveBranch(branch: Branch) {
  if (isGuid(branch.id)) {
    return apiFetch(`/api/branches/${branch.id}`, { method: 'PUT', body: JSON.stringify(branch) })
  }
  return apiFetch<{ id: string }>('/api/branches', { method: 'POST', body: JSON.stringify(branch) })
}

export async function apiDeleteBranch(id: string) {
  return apiFetch(`/api/branches/${id}`, { method: 'DELETE' })
}

export async function apiCreateReservation(data: {
  customerName: string
  customerPhone: string
  customerId?: string
  date: string
  time: string
  guests: number
  notes?: string
}) {
  return apiFetch<Reservation>('/api/reservations', {
    method: 'POST',
    auth: false,
    body: JSON.stringify(data),
  })
}

export async function apiUpdateReservationStatus(id: string, status: string) {
  return apiFetch(`/api/reservations/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

export async function apiListCustomers() {
  return apiFetch<{ customers: Customer[] }>('/api/customers')
}

export async function apiUpsertCustomer(data: {
  name: string
  phone: string
  email?: string
  address?: string
  photoUrl?: string
}) {
  return apiFetch<{ customer: Customer; created: boolean }>('/api/customers/upsert', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function apiListDrivers() {
  return apiFetch<{ drivers: Driver[] }>('/api/drivers')
}

export async function apiCreateDriver(data: {
  name: string
  phone: string
  active?: boolean
  vehicleInfo?: string
  photoUrl?: string
}) {
  return apiFetch<{ id: string; photoUrl?: string }>('/api/drivers', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function apiUpdateDriver(
  id: string,
  data: { name: string; phone: string; active?: boolean; vehicleInfo?: string; photoUrl?: string },
) {
  return apiFetch(`/api/drivers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function apiDeleteDriver(id: string) {
  return apiFetch(`/api/drivers/${id}`, { method: 'DELETE' })
}

export async function apiRegisterCustomer(data: {
  name: string
  phone: string
  email?: string
  password: string
  address?: string
}) {
  return apiFetch<{ customer: Customer }>('/api/customers/register', {
    method: 'POST',
    auth: false,
    body: JSON.stringify(data),
  })
}

export async function apiLoginCustomer(phone: string, password: string) {
  return apiFetch<{ customer: Customer }>('/api/customers/login', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ phone, password }),
  })
}

export async function apiSaveCustomerPassword(phone: string, newPassword: string) {
  return apiFetch('/api/customers/password', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ phone, newPassword }),
  })
}

export async function apiDeliveryQuote(body: unknown) {
  return apiFetch('/api/delivery/quote', {
    method: 'POST',
    auth: false,
    body: JSON.stringify(body),
  })
}

export async function apiGetBanners(all = false) {
  return apiFetch<{ banners: unknown[] }>(all ? '/api/config/banners/all' : '/api/config/banners', {
    auth: all,
  })
}

export async function apiSaveBanners(banners: unknown[]) {
  return apiFetch('/api/config/banners', {
    method: 'PUT',
    body: JSON.stringify({ banners }),
  })
}

export async function apiGetWhatsappConfig() {
  return apiFetch<{ config: unknown }>('/api/config/whatsapp')
}

export async function apiSaveWhatsappConfig(config: unknown) {
  return apiFetch('/api/config/whatsapp', {
    method: 'PUT',
    body: JSON.stringify({ config }),
  })
}

export async function apiGetSunatConfig() {
  return apiFetch<{ config: unknown }>('/api/config/sunat')
}

export async function apiSaveSunatConfig(config: unknown) {
  return apiFetch('/api/config/sunat', {
    method: 'PUT',
    body: JSON.stringify({ config }),
  })
}

export async function apiGetInvoices() {
  return apiFetch<{ invoices: unknown[] }>('/api/config/invoices')
}

export async function apiSaveInvoices(invoices: unknown[]) {
  return apiFetch('/api/config/invoices', {
    method: 'PUT',
    body: JSON.stringify({ invoices }),
  })
}
