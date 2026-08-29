import type { Customer } from '../types'
import { setApiToken } from './apiClient'

export const CUST_SESSION_KEY = 'polleria-customer-session'
const LEGACY_KEY = 'chifa-lopez-customer'
const HOME_KEY = 'polleria-customer-home'

export type CustomerHomePath = '/web' | '/pedir'

export function getCustomerSession(): Customer | null {
  try {
    const raw = localStorage.getItem(CUST_SESSION_KEY) || localStorage.getItem(LEGACY_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as Customer
    if (!c?.id || !c?.phone) return null
    return c
  } catch {
    return null
  }
}

/** Home de la sesión cliente: carta web o app /pedir */
export function getCustomerHome(): CustomerHomePath {
  try {
    const h = localStorage.getItem(HOME_KEY)
    if (h === '/pedir' || h === '/web') return h
  } catch {
    /* ignore */
  }
  return '/web'
}

export function setCustomerHome(path: CustomerHomePath) {
  localStorage.setItem(HOME_KEY, path)
}

export function setCustomerSession(
  customer: Customer,
  token?: string | null,
  home?: CustomerHomePath,
) {
  localStorage.setItem(CUST_SESSION_KEY, JSON.stringify(customer))
  localStorage.removeItem(LEGACY_KEY)
  if (home) setCustomerHome(home)
  if (token) setApiToken(token, 'customer')
}

export function clearCustomerSession() {
  localStorage.removeItem(CUST_SESSION_KEY)
  localStorage.removeItem(LEGACY_KEY)
  localStorage.removeItem(HOME_KEY)
  setApiToken(null, 'customer')
}
