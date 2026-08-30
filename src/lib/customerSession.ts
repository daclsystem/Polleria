import type { Customer } from '../types'
import { apiLogout, setApiToken } from './apiClient'
import { siteUrl } from './paths'

export const CUST_SESSION_KEY = 'polleria-customer-session'
const LEGACY_KEY = 'chifa-lopez-customer'
const HOME_KEY = 'polleria-customer-home'
const HANDOFF_COOKIE = 'polleria-cust-handoff'

export type CustomerHomeApp = 'web' | 'cliente'

function absorbHandoff() {
  if (typeof document === 'undefined') return
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${HANDOFF_COOKIE}=([^;]*)`))
  if (!m?.[1]) return
  try {
    const data = JSON.parse(decodeURIComponent(m[1])) as {
      customer?: Customer
      token?: string
      home?: CustomerHomeApp
    }
    if (data.customer?.id && data.customer.phone) {
      localStorage.setItem(CUST_SESSION_KEY, JSON.stringify(data.customer))
      if (data.token) setApiToken(data.token, 'customer')
      if (data.home) localStorage.setItem(HOME_KEY, data.home)
    }
  } catch {
    /* ignore */
  }
  document.cookie = `${HANDOFF_COOKIE}=; Path=/; Max-Age=0`
}

function writeHandoff(customer: Customer, token?: string | null, home?: CustomerHomeApp) {
  if (!import.meta.env.DEV || typeof document === 'undefined') return
  const payload = encodeURIComponent(JSON.stringify({ customer, token: token || null, home: home || 'cliente' }))
  document.cookie = `${HANDOFF_COOKIE}=${payload}; Path=/; SameSite=Lax; Max-Age=600`
}

export function getCustomerSession(): Customer | null {
  try {
    absorbHandoff()
    const raw = localStorage.getItem(CUST_SESSION_KEY) || localStorage.getItem(LEGACY_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as Customer
    if (!c?.id || !c?.phone) return null
    return c
  } catch {
    return null
  }
}

/** App de origen del cliente (web pública o /cliente). */
export function getCustomerHomeApp(): CustomerHomeApp {
  try {
    const h = localStorage.getItem(HOME_KEY)
    if (h === 'cliente' || h === '/pedir') return 'cliente'
    if (h === 'web' || h === '/web') return 'web'
  } catch {
    /* ignore */
  }
  return 'web'
}

/** @deprecated usar getCustomerHomeApp / getCustomerHomeUrl */
export function getCustomerHome(): string {
  return getCustomerHomeUrl()
}

export function getCustomerHomeUrl() {
  return siteUrl(getCustomerHomeApp(), '/')
}

export function setCustomerHome(app: CustomerHomeApp | '/web' | '/pedir') {
  const normalized: CustomerHomeApp =
    app === 'cliente' || app === '/pedir' ? 'cliente' : 'web'
  localStorage.setItem(HOME_KEY, normalized)
}

export function setCustomerSession(
  customer: Customer,
  token?: string | null,
  home?: CustomerHomeApp | '/web' | '/pedir',
) {
  localStorage.setItem(CUST_SESSION_KEY, JSON.stringify(customer))
  localStorage.removeItem(LEGACY_KEY)
  if (home) setCustomerHome(home)
  if (token) setApiToken(token, 'customer')
  const normalized: CustomerHomeApp | undefined =
    home === 'cliente' || home === '/pedir' ? 'cliente' : home === 'web' || home === '/web' ? 'web' : undefined
  writeHandoff(customer, token, normalized)
}

export function clearCustomerSession() {
  void apiLogout('customer')
  localStorage.removeItem(CUST_SESSION_KEY)
  localStorage.removeItem(LEGACY_KEY)
  localStorage.removeItem(HOME_KEY)
  setApiToken(null, 'customer')
}
