import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { totalsFromItems, uid } from '../lib/format'
import { enrichProducts } from '../lib/enrichProducts'
import {
  apiAddOrderItems,
  apiAdjustStock,
  apiBootstrap,
  apiCreateOrder,
  apiCreateReservation,
  apiDeleteBranch,
  apiDeleteProduct,
  apiDeleteUser,
  apiFetch,
  apiLoginCustomer,
  apiPayOrder,
  apiRegisterCustomer,
  apiSaveBranch,
  apiSaveCustomerPassword,
  apiSaveInventory,
  apiSaveProduct,
  apiSaveSettings,
  apiSaveUser,
  apiUpdateOrderStatus,
  apiStockRetorno,
  apiStockSacar,
  apiUpdateReservationStatus,
  apiUpdateTable,
  getApiToken,
  usingApi,
} from '../lib/apiClient'
import {
  connectRealtime,
  disconnectRealtime,
  onRealtimeEvent,
  onRealtimeReconnect,
  onRealtimeStatus,
  orderBelongsToStaff,
  orderLabel,
  readStaffRole,
  readStaffUser,
  roomsForStaffRole,
  shouldNotifyRole,
  type RealtimeEvent,
} from '../lib/realtime'
import { playSound } from '../lib/sounds'
import { filterKitchenItems } from '../lib/kitchen'
import { createSeed } from '../data/seed'
import { APP_NAME } from '../lib/paths'
import type {
  AppState,
  Branch,
  Customer,
  InventoryItem,
  Order,
  OrderItem,
  OrderStatus,
  PaymentMethod,
  Product,
  Reservation,
  ReservationStatus,
  Settings,
  Table,
  User,
} from '../types'

function emptyApiState(): AppState {
  return {
    users: [],
    products: [],
    inventory: [],
    tables: [],
    orders: [],
    customers: [],
    reservations: [],
    settings: {
      name: 'Chifa-Pollería Lopez',
      slogan: '',
      address: '',
      phone: '',
      ruc: '',
      igvRate: 0.18,
      hours: '',
      deliveryFee: 3,
      originLat: -13.064353,
      originLng: -76.348946,
    },
    branches: [],
    deliveryRanges: [],
    nextOrderNumber: 1001,
  }
}

function requireApi() {
  if (import.meta.env.DEV) return
  if (!usingApi()) throw new Error('VITE_API_URL no configurada')
}

function isGuid(id?: string) {
  return Boolean(id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
}

const KITCHEN_WAVE_RANK: Record<string, number> = { pendiente: 1, en_cocina: 2, listo: 3 }
const KITCHEN_WAVE_KEY = 'polleria-kitchen-waves'

function readKitchenWaveOverrides(): Record<string, string> {
  try {
    return JSON.parse(sessionStorage.getItem(KITCHEN_WAVE_KEY) || '{}') as Record<string, string>
  } catch {
    return {}
  }
}

function writeKitchenWaveOverrides(map: Record<string, string>) {
  try {
    sessionStorage.setItem(KITCHEN_WAVE_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

function rememberKitchenWave(itemId: string | undefined, wave: 'pendiente' | 'en_cocina' | 'listo') {
  if (!itemId) return
  const map = readKitchenWaveOverrides()
  const prev = map[itemId]
  if (!prev || (KITCHEN_WAVE_RANK[wave] || 0) >= (KITCHEN_WAVE_RANK[prev] || 0)) {
    map[itemId] = wave
    writeKitchenWaveOverrides(map)
  }
}

function clearKitchenWavesForOrder(items: OrderItem[]) {
  const map = readKitchenWaveOverrides()
  let changed = false
  for (const it of items) {
    if (it.id && map[it.id]) {
      delete map[it.id]
      changed = true
    }
  }
  if (changed) writeKitchenWaveOverrides(map)
}

/** No regresar una ronda de cocina ya avanzada (API viejo / sync lento). */
function mergeKitchenStatus(
  api: OrderItem['kitchenStatus'],
  local: OrderItem['kitchenStatus'],
  override?: string,
): OrderItem['kitchenStatus'] {
  const candidates = [api, local, override].filter(Boolean) as string[]
  if (!candidates.length) return api
  let best = candidates[0]
  for (const c of candidates) {
    if ((KITCHEN_WAVE_RANK[c] || 0) > (KITCHEN_WAVE_RANK[best] || 0)) best = c
  }
  if (best === 'pendiente' || best === 'en_cocina' || best === 'listo') return best
  return api
}

function mergeOrdersKitchenWaves(apiOrders: Order[], prevOrders: Order[]): Order[] {
  const localByItem = new Map<string, OrderItem['kitchenStatus']>()
  for (const o of prevOrders) {
    for (const it of o.items) {
      if (it.id && it.kitchenStatus) localByItem.set(it.id, it.kitchenStatus)
    }
  }
  const overrides = readKitchenWaveOverrides()
  return apiOrders.map((o) => ({
    ...o,
    items: o.items.map((it) => {
      if (!it.id) return it
      const merged = mergeKitchenStatus(it.kitchenStatus, localByItem.get(it.id), overrides[it.id])
      if (merged === it.kitchenStatus) return it
      return { ...it, kitchenStatus: merged }
    }),
  }))
}

export type LiveNotice = { id: string; text: string; tone: 'info' | 'ok' | 'warn' }

interface NewOrderInput {
  type: Order['type']
  items: OrderItem[]
  customerName: string
  customerPhone?: string
  customerId?: string
  address?: string
  tableId?: string
  discount?: number
  couponCode?: string
  paymentMethod: PaymentMethod
  paid: boolean
  notes?: string
  createdBy: string
  createdByUserId?: string
  source: Order['source']
  codPaymentMethod?: 'yape' | 'plin' | 'efectivo'
  codCashAmount?: number
  deliveryFee?: number
  deliveryDistanceKm?: number
  deliveryTimeMin?: number
  addressLat?: number
  addressLng?: number
  branchId?: string
}

interface StoreApi {
  state: AppState
  apiMode: boolean
  apiLoading: boolean
  apiError: string | null
  reloadFromApi: () => Promise<void>
  createOrder: (input: NewOrderInput) => Promise<Order>
  updateOrderStatus: (id: string, status: OrderStatus, kitchenFrom?: 'pendiente' | 'en_cocina') => void
  /** Cocina: sacar del almacén (antes o durante prep) */
  stockSacar: (id: string, itemIds?: string[]) => Promise<void>
  /** Retorno a almacén */
  stockRetorno: (id: string, itemIds?: string[]) => Promise<void>
  addItemsToOrder: (id: string, newItems: OrderItem[], createdBy: string) => void
  payOrder: (id: string, method: PaymentMethod) => void
  cancelOrder: (id: string) => void
  updateOrder: (id: string, patch: Partial<Order>) => void
  saveProduct: (product: Product) => void
  deleteProduct: (id: string) => void
  saveUser: (user: User) => void
  deleteUser: (id: string) => void
  saveInventory: (item: InventoryItem) => void
  adjustStock: (id: string, delta: number, extra?: { reason?: 'ingreso' | 'ajuste' | 'perdida'; notes?: string }) => void
  updateTable: (id: string, patch: Partial<Table>) => void
  saveSettings: (settings: Settings) => void
  saveBranch: (branch: Branch) => void
  deleteBranch: (id: string) => void
  registerCustomer: (data: {
    name: string
    phone: string
    email?: string
    password: string
    address?: string
  }) => Promise<Customer>
  loginCustomer: (phone: string, password: string) => Promise<Customer | null>
  saveCustomerPassword: (phone: string, newPassword: string) => Promise<boolean>
  createReservation: (data: {
    customerName: string
    customerPhone: string
    customerId?: string
    date: string
    time: string
    guests: number
    notes?: string
  }) => Promise<Reservation>
  updateReservationStatus: (id: string, status: ReservationStatus) => void
  resetDemo: () => void
  /** Socket.IO conectado al API */
  live: boolean
  notices: LiveNotice[]
  dismissNotice: (id: string) => void
  pushNotice: (text: string, tone?: LiveNotice['tone']) => void
}

const StoreContext = createContext<StoreApi | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(emptyApiState)
  const [apiLoading, setApiLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [live, setLive] = useState(false)
  const [notices, setNotices] = useState<LiveNotice[]>([])
  const stateRef = useRef(state)
  stateRef.current = state
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastNoticeRef = useRef<{ text: string; at: number } | null>(null)

  const pushNotice = useCallback((text: string, tone: LiveNotice['tone'] = 'info') => {
    const now = Date.now()
    const last = lastNoticeRef.current
    if (last && last.text === text && now - last.at < 4000) return
    lastNoticeRef.current = { text, at: now }
    const id = uid('n')
    setNotices((prev) => {
      if (prev.some((n) => n.text === text)) return prev
      return [{ id, text, tone }, ...prev].slice(0, 4)
    })
    window.setTimeout(() => {
      setNotices((prev) => prev.filter((n) => n.id !== id))
    }, 6000)
  }, [])

  const dismissNotice = useCallback((id: string) => {
    setNotices((prev) => prev.filter((n) => n.id !== id))
  }, [])

  const scheduleReload = useCallback(() => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current)
    reloadTimer.current = setTimeout(() => {
      void reloadFromApiRef.current?.()
    }, 250)
  }, [])

  const reloadFromApiRef = useRef<(() => Promise<void>) | null>(null)
  const reloadFromApi = useCallback(async () => {
    requireApi()
    if (!getApiToken()) return
    setApiLoading(true)
    setApiError(null)
    try {
      const data = await apiBootstrap()
      setState((prev) => ({
        users: data.users as User[],
        products: data.products as Product[],
        tables: data.tables as Table[],
        inventory: data.inventory as InventoryItem[],
        settings: data.settings as Settings,
        orders: mergeOrdersKitchenWaves(data.orders as Order[], prev.orders),
        customers: data.customers as Customer[],
        reservations: data.reservations as Reservation[],
        branches: data.branches as AppState['branches'],
        deliveryRanges: (data.deliveryRanges as AppState['deliveryRanges']) || [],
        nextOrderNumber: data.nextOrderNumber,
      }))
    } catch (e) {
      setApiError((e as Error).message)
    } finally {
      setApiLoading(false)
    }
  }, [])

  reloadFromApiRef.current = reloadFromApi

  useEffect(() => {
    requireApi()

    const startLive = () => {
      if (!getApiToken()) return () => {}
      void reloadFromApi()
      const role = readStaffRole()
      connectRealtime(roomsForStaffRole(role))
      const offStatus = onRealtimeStatus(setLive)
      const offReconnect = onRealtimeReconnect(() => scheduleReload())
      const onVisible = () => {
        if (document.visibilityState === 'visible') scheduleReload()
      }
      document.addEventListener('visibilitychange', onVisible)
      window.addEventListener('focus', onVisible)
      const offEvent = onRealtimeEvent((event: RealtimeEvent, payload) => {
        if (event === 'inventory:updated') {
          const data = payload as {
            inventory?: InventoryItem[]
            lowStock?: Array<{ name: string; stock: number; minStock: number }>
          }
          if (Array.isArray(data.inventory)) {
            setState((prev) => ({ ...prev, inventory: data.inventory as InventoryItem[] }))
          } else {
            scheduleReload()
          }
          const low = data.lowStock || []
          if (low.length && shouldNotifyRole(readStaffRole(), event)) {
            const names = low
              .slice(0, 3)
              .map((x) => x.name)
              .join(', ')
            pushNotice(`Stock bajo: ${names}${low.length > 3 ? '…' : ''}`, 'warn')
          }
          return
        }

        scheduleReload()
        const { n, name, status, createdByUserId, createdBy } = orderLabel(payload)
        const currentRole = readStaffRole()
        if (!shouldNotifyRole(currentRole, event, status)) return

        // Mozo: solo alertas de SUS pedidos
        if (currentRole === 'mozo') {
          const me = readStaffUser()
          if (
            !orderBelongsToStaff(
              { createdByUserId, CreatedByUserId: createdByUserId, createdBy, CreatedBy: createdBy },
              me,
            )
          ) {
            return
          }
        }

        const num = n != null ? `#${String(n).padStart(4, '0')}` : 'Pedido'

        if (event === 'kitchen:new' || event === 'order:created') {
          playSound('nuevo')
          pushNotice(`${num} nuevo${name ? ` · ${name}` : ''}`, 'warn')
        } else if (event === 'order:status') {
          if (status === 'en_cocina') {
            playSound('nuevo')
            pushNotice(`${num} en preparación (cocina)`, 'info')
          } else if (status === 'listo') {
            playSound('listo')
            pushNotice(`${num} listo para entregar`, 'ok')
          } else if (status === 'entregado') {
            pushNotice(`${num} entregado`, 'ok')
          } else if (status === 'cancelado') {
            pushNotice(`${num} cancelado`, 'warn')
          } else if (status === 'nuevo') {
            pushNotice(`${num} recibido / adicionales`, 'info')
          }
        } else if (event === 'order:paid') {
          pushNotice(`${num} cobrado`, 'ok')
        } else if (event === 'order:driver') {
          pushNotice(`${num} asignado a conductor`, 'info')
        }
      })
      const t = setInterval(() => void reloadFromApi(), 25000)
      return () => {
        clearInterval(t)
        offStatus()
        offEvent()
        offReconnect()
        document.removeEventListener('visibilitychange', onVisible)
        window.removeEventListener('focus', onVisible)
        disconnectRealtime()
        setLive(false)
      }
    }

    const loadPublicCatalog = () => {
      setApiLoading(true)
      void apiFetch<{ products: Product[] }>('/api/catalog/products', { auth: false })
        .then((data) => {
          const list = enrichProducts(data.products || [])
          setState((prev) => ({
            ...prev,
            products: list.length ? list : enrichProducts(createSeed().products),
          }))
        })
        .catch((e) => {
          setApiError((e as Error).message)
          setState((prev) =>
            prev.products.length > 0
              ? prev
              : { ...prev, products: enrichProducts(createSeed().products) },
          )
        })
        .finally(() => setApiLoading(false))
    }

    const publicFront = APP_NAME === 'web' || APP_NAME === 'cliente'
    if (publicFront) {
      loadPublicCatalog()
      return
    }

    let stop = getApiToken('staff') ? startLive() : () => {}

    if (!getApiToken('staff')) {
      loadPublicCatalog()
    }

    const onAuth = () => {
      stop()
      stop = getApiToken('staff') ? startLive() : () => {}
    }
    window.addEventListener('polleria-auth', onAuth)
    return () => {
      window.removeEventListener('polleria-auth', onAuth)
      stop()
    }
  }, [reloadFromApi, scheduleReload, pushNotice])

  const patchLocal = useCallback((updater: (prev: AppState) => AppState) => {
    setState((prev) => updater(prev))
  }, [])

  const createOrder = useCallback(
    async (input: NewOrderInput) => {
      requireApi()
      const money = totalsFromItems(input.items, input.discount ?? 0, stateRef.current.settings.igvRate)
      const table = stateRef.current.tables.find((t) => t.id === input.tableId)
      const guid = (id?: string) => (isGuid(id) ? id : undefined)
      const codMethod =
        input.codPaymentMethod ||
        (input.source === 'web' || input.type === 'delivery'
          ? input.paymentMethod === 'yape' || input.paymentMethod === 'efectivo'
            ? input.paymentMethod
            : 'yape'
          : undefined)
      // Web/delivery: siempre pendiente de liquidación (repartidor o caja cobran después)
      const isCod = input.source === 'web' || input.type === 'delivery'
      const paid = isCod ? false : input.paid
      const paymentMethod = isCod ? ('pendiente' as const) : input.paymentMethod
      const codCashAmount =
        input.codCashAmount ??
        (codMethod === 'efectivo' ? money.total : undefined)

      try {
        const res = await apiCreateOrder({
          type: input.type,
          source: input.source,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          customerId: guid(input.customerId),
          address: input.address,
          addressLat: input.addressLat,
          addressLng: input.addressLng,
          deliveryDistanceKm: input.deliveryDistanceKm,
          deliveryTimeMin: input.deliveryTimeMin,
          deliveryFee: input.deliveryFee,
          branchId: guid(input.branchId),
          tableId: guid(input.tableId),
          tableNumber: table?.number,
          notes: input.notes,
          discount: input.discount ?? 0,
          couponCode: input.couponCode,
          subtotal: money.subtotal,
          igv: money.igv,
          total: money.total,
          createdByUserId: guid(input.createdByUserId) || guid(input.createdBy),
          codPaymentMethod: codMethod,
          codCashAmount,
          items: input.items.map((i) => ({
            productId: guid(i.productId),
            name: i.name,
            qty: i.qty,
            price: i.price,
            notes: i.notes,
            options: i.selectedOptions?.map((o) => ({
              groupId: guid(o.groupId),
              optionId: guid(o.optionId),
              name: o.name,
              price: o.price,
            })),
          })),
        })

        const raw = res.order as Record<string, unknown>
        const realId = String(raw.Id || raw.id || uid('ord'))
        const realNumber = Number(raw.Number || raw.number || stateRef.current.nextOrderNumber)
        const staffId = guid(input.createdByUserId) || guid(input.createdBy)
        const created: Order = {
          id: realId,
          number: realNumber,
          type: input.type,
          status: 'nuevo',
          tableId: input.tableId,
          tableNumber: table?.number,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          customerId: input.customerId,
          address: input.address,
          items: input.items,
          discount: input.discount ?? 0,
          ...money,
          paymentMethod,
          paid,
          codPaymentMethod: codMethod,
          codCashAmount,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: input.createdBy,
          createdByUserId: staffId,
          notes: input.notes,
          source: input.source,
        }

        patchLocal((prev) => ({
          ...prev,
          orders: [created, ...prev.orders.filter((o) => o.id !== created.id)],
          tables: prev.tables.map((t) =>
            t.id === input.tableId ? { ...t, status: 'ocupada' as const, orderId: created.id } : t,
          ),
          nextOrderNumber: Math.max(prev.nextOrderNumber, realNumber + 1),
        }))

        if (getApiToken()) void reloadFromApi()
        return created
      } catch (e) {
        setApiError((e as Error).message)
        throw e
      }
    },
    [patchLocal, reloadFromApi],
  )

  const updateOrderStatus = useCallback(
    (id: string, status: OrderStatus, kitchenFrom?: 'pendiente' | 'en_cocina') => {
      requireApi()
      patchLocal((prev) => {
        const orders = prev.orders.map((o) => {
          if (o.id !== id) return o
          const from = kitchenFrom || (status === 'en_cocina' ? 'pendiente' : status === 'listo' ? 'en_cocina' : null)
          const items = o.items.map((it) => {
            if (!from) return it
            const wave = it.kitchenStatus || (filterKitchenItems([it], prev.products).length ? 'pendiente' : null)
            if (status === 'en_cocina' && from === 'pendiente' && wave === 'pendiente') {
              rememberKitchenWave(it.id, 'en_cocina')
              return { ...it, kitchenStatus: 'en_cocina' as const }
            }
            if (status === 'listo' && from === 'en_cocina' && wave === 'en_cocina') {
              rememberKitchenWave(it.id, 'listo')
              return { ...it, kitchenStatus: 'listo' as const }
            }
            return it
          })
          if (status === 'entregado' || status === 'cancelado') {
            clearKitchenWavesForOrder(o.items)
          }
          return { ...o, status, items, updatedAt: new Date().toISOString() }
        })
        const order = orders.find((o) => o.id === id)
        let tables = prev.tables
        if (order?.tableId && (status === 'entregado' || status === 'cancelado')) {
          tables = tables.map((t) =>
            t.id === order.tableId ? { ...t, status: 'libre', orderId: undefined } : t,
          )
        }
        if (order?.tableId && status === 'listo') {
          tables = tables.map((t) => (t.id === order.tableId ? { ...t, status: 'cuenta' } : t))
        }
        return { ...prev, orders, tables }
      })
      void apiUpdateOrderStatus(id, status, kitchenFrom)
        .then(() => {
          // No forzar reload inmediato en rondas de cocina: el API remoto aún puede
          // no persistir KitchenStatus y borraría “En fuego”. El sync periódico / merge lo cuida.
          if (kitchenFrom) return
          void reloadFromApi()
        })
        .catch((e) => setApiError((e as Error).message))
    },
    [patchLocal, reloadFromApi],
  )

  const stockSacar = useCallback(
    async (id: string, itemIds?: string[]) => {
      requireApi()
      try {
        const res = await apiStockSacar(id, itemIds)
        const ids = new Set(res.itemIds || [])
        patchLocal((prev) => ({
          ...prev,
          orders: prev.orders.map((o) =>
            o.id !== id
              ? o
              : {
                  ...o,
                  items: o.items.map((it) =>
                    it.id && ids.has(it.id) ? { ...it, stockDeducted: true } : it,
                  ),
                },
          ),
        }))
        if (res.lowStock?.length) {
          const names = (res.lowStock as Array<{ name: string }>)
            .slice(0, 3)
            .map((x) => x.name)
            .join(', ')
          pushNotice(`Stock bajo tras sacar: ${names}`, 'warn')
        } else {
          pushNotice('Insumos sacados del almacén', 'ok')
        }
        void reloadFromApi()
      } catch (e) {
        setApiError((e as Error).message)
        throw e
      }
    },
    [patchLocal, pushNotice, reloadFromApi],
  )

  const stockRetorno = useCallback(
    async (id: string, itemIds?: string[]) => {
      requireApi()
      try {
        const res = await apiStockRetorno(id, itemIds)
        const ids = new Set(res.itemIds || [])
        patchLocal((prev) => ({
          ...prev,
          orders: prev.orders.map((o) =>
            o.id !== id
              ? o
              : {
                  ...o,
                  items: o.items.map((it) =>
                    it.id && ids.has(it.id) ? { ...it, stockDeducted: false } : it,
                  ),
                },
          ),
        }))
        pushNotice('Retorno a almacén registrado', 'ok')
        void reloadFromApi()
      } catch (e) {
        setApiError((e as Error).message)
        throw e
      }
    },
    [patchLocal, pushNotice, reloadFromApi],
  )

  const addItemsToOrder = useCallback(
    (id: string, newItems: OrderItem[], createdBy: string) => {
      requireApi()
      let money = { subtotal: 0, igv: 0, total: 0 }
      let discount = 0
      const kitchenNew = filterKitchenItems(newItems, stateRef.current.products)
      patchLocal((prev) => {
        const order = prev.orders.find((o) => o.id === id)
        if (!order) return prev
        const mergedItems = [...order.items]
        for (const item of newItems) {
          const goesKitchen = filterKitchenItems([item], prev.products).length > 0
          mergedItems.push({
            ...item,
            kitchenStatus: goesKitchen ? 'pendiente' : null,
          })
        }
        money = totalsFromItems(mergedItems, order.discount, prev.settings.igvRate)
        discount = order.discount
        // No reiniciar comanda entera: si ya estaba en fuego, se queda; adicionales van como pendiente
        let nextStatus = order.status
        if (kitchenNew.length > 0 && (order.status === 'listo' || order.status === 'entregado')) {
          nextStatus = 'nuevo'
        }
        return {
          ...prev,
          orders: prev.orders.map((o) =>
            o.id === id
              ? {
                  ...o,
                  items: mergedItems,
                  ...money,
                  status: nextStatus,
                  updatedAt: new Date().toISOString(),
                  createdBy: `${o.createdBy} / ${createdBy}`,
                }
              : o,
          ),
        }
      })
      void apiAddOrderItems(
        id,
        newItems.map((i) => ({
          productId: isGuid(i.productId) ? i.productId : undefined,
          name: i.name,
          qty: i.qty,
          price: i.price,
          notes: i.notes,
          options: i.selectedOptions,
        })),
        { ...money, discount },
      )
        .then(() => reloadFromApi())
        .catch((e) => setApiError((e as Error).message))
    },
    [patchLocal, reloadFromApi],
  )

  const payOrder = useCallback(
    (id: string, method: PaymentMethod) => {
      requireApi()
      const current = stateRef.current.orders.find((o) => o.id === id)
      const amount = current?.total ?? 0
      patchLocal((prev) => ({
        ...prev,
        orders: prev.orders.map((o) =>
          o.id === id
            ? { ...o, paid: true, paymentMethod: method, updatedAt: new Date().toISOString() }
            : o,
        ),
      }))
      void apiPayOrder(id, [
        { method, amount, cashTendered: method === 'efectivo' ? amount : undefined },
      ])
        .then(() => reloadFromApi())
        .catch((e) => setApiError((e as Error).message))
    },
    [patchLocal, reloadFromApi],
  )

  const cancelOrder = useCallback(
    (id: string) => updateOrderStatus(id, 'cancelado'),
    [updateOrderStatus],
  )

  const updateOrder = useCallback(
    (id: string, patch: Partial<Order>) => {
      patchLocal((prev) => ({
        ...prev,
        orders: prev.orders.map((o) =>
          o.id === id ? { ...o, ...patch, updatedAt: new Date().toISOString() } : o,
        ),
      }))
    },
    [patchLocal],
  )

  const saveProduct = useCallback(
    (product: Product) => {
      requireApi()
      patchLocal((prev) => {
        const exists = prev.products.some((p) => p.id === product.id)
        return {
          ...prev,
          products: exists
            ? prev.products.map((p) => (p.id === product.id ? product : p))
            : [...prev.products, product],
        }
      })
      void apiSaveProduct(product)
        .then(() => reloadFromApi())
        .catch((e) => setApiError((e as Error).message))
    },
    [patchLocal, reloadFromApi],
  )

  const deleteProduct = useCallback(
    (id: string) => {
      requireApi()
      patchLocal((prev) => ({ ...prev, products: prev.products.filter((p) => p.id !== id) }))
      void apiDeleteProduct(id)
        .then(() => reloadFromApi())
        .catch((e) => setApiError((e as Error).message))
    },
    [patchLocal, reloadFromApi],
  )

  const saveUser = useCallback(
    (user: User) => {
      requireApi()
      patchLocal((prev) => {
        const exists = prev.users.some((u) => u.id === user.id)
        return {
          ...prev,
          users: exists ? prev.users.map((u) => (u.id === user.id ? user : u)) : [...prev.users, user],
        }
      })
      void apiSaveUser(user)
        .then(() => reloadFromApi())
        .catch((e) => setApiError((e as Error).message))
    },
    [patchLocal, reloadFromApi],
  )

  const deleteUser = useCallback(
    (id: string) => {
      requireApi()
      patchLocal((prev) => ({ ...prev, users: prev.users.filter((u) => u.id !== id) }))
      void apiDeleteUser(id)
        .then(() => reloadFromApi())
        .catch((e) => setApiError((e as Error).message))
    },
    [patchLocal, reloadFromApi],
  )

  const saveInventory = useCallback(
    (item: InventoryItem) => {
      requireApi()
      patchLocal((prev) => {
        const exists = prev.inventory.some((i) => i.id === item.id)
        return {
          ...prev,
          inventory: exists
            ? prev.inventory.map((i) => (i.id === item.id ? item : i))
            : [...prev.inventory, item],
        }
      })
      void apiSaveInventory(item)
        .then(() => reloadFromApi())
        .catch((e) => setApiError((e as Error).message))
    },
    [patchLocal, reloadFromApi],
  )

  const adjustStock = useCallback(
    (id: string, delta: number, extra?: { reason?: 'ingreso' | 'ajuste' | 'perdida'; notes?: string }) => {
      requireApi()
      patchLocal((prev) => ({
        ...prev,
        inventory: prev.inventory.map((i) =>
          i.id === id ? { ...i, stock: Math.max(0, Math.round((i.stock + delta) * 100) / 100) } : i,
        ),
      }))
      void apiAdjustStock(id, delta, extra)
        .then(() => reloadFromApi())
        .catch((e) => setApiError((e as Error).message))
    },
    [patchLocal, reloadFromApi],
  )

  const updateTable = useCallback(
    (id: string, patch: Partial<Table>) => {
      requireApi()
      patchLocal((prev) => ({
        ...prev,
        tables: prev.tables.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      }))
      void apiUpdateTable(id, patch as Record<string, unknown>)
        .then(() => reloadFromApi())
        .catch((e) => setApiError((e as Error).message))
    },
    [patchLocal, reloadFromApi],
  )

  const saveSettings = useCallback(
    (settings: Settings) => {
      requireApi()
      patchLocal((prev) => ({ ...prev, settings }))
      void apiSaveSettings(settings)
        .then(() => reloadFromApi())
        .catch((e) => setApiError((e as Error).message))
    },
    [patchLocal, reloadFromApi],
  )

  const saveBranch = useCallback(
    (branch: Branch) => {
      requireApi()
      patchLocal((prev) => {
        const exists = prev.branches.some((b) => b.id === branch.id)
        return {
          ...prev,
          branches: exists
            ? prev.branches.map((b) => (b.id === branch.id ? branch : b))
            : [...prev.branches, branch],
        }
      })
      void apiSaveBranch(branch)
        .then(() => reloadFromApi())
        .catch((e) => setApiError((e as Error).message))
    },
    [patchLocal, reloadFromApi],
  )

  const deleteBranch = useCallback(
    (id: string) => {
      requireApi()
      patchLocal((prev) => ({ ...prev, branches: prev.branches.filter((b) => b.id !== id) }))
      void apiDeleteBranch(id)
        .then(() => reloadFromApi())
        .catch((e) => setApiError((e as Error).message))
    },
    [patchLocal, reloadFromApi],
  )

  const registerCustomer = useCallback(async (data: {
    name: string
    phone: string
    email?: string
    password: string
    address?: string
  }) => {
    requireApi()
    const { customer } = await apiRegisterCustomer(data)
    patchLocal((prev) => ({ ...prev, customers: [...(prev.customers || []), customer] }))
    return customer
  }, [patchLocal])

  const loginCustomer = useCallback(async (phone: string, password: string) => {
    requireApi()
    try {
      const { customer } = await apiLoginCustomer(phone, password)
      return customer
    } catch {
      return null
    }
  }, [])

  const saveCustomerPassword = useCallback(async (phone: string, newPassword: string) => {
    requireApi()
    try {
      await apiSaveCustomerPassword(phone, newPassword)
      return true
    } catch {
      return false
    }
  }, [])

  const createReservation = useCallback(
    async (data: {
      customerName: string
      customerPhone: string
      customerId?: string
      date: string
      time: string
      guests: number
      notes?: string
    }) => {
      requireApi()
      const reservation = await apiCreateReservation(data)
      patchLocal((prev) => ({
        ...prev,
        reservations: [...(prev.reservations || []), reservation],
      }))
      if (getApiToken()) void reloadFromApi()
      return reservation
    },
    [patchLocal, reloadFromApi],
  )

  const updateReservationStatus = useCallback(
    (id: string, status: ReservationStatus) => {
      requireApi()
      patchLocal((prev) => ({
        ...prev,
        reservations: (prev.reservations || []).map((r) => (r.id === id ? { ...r, status } : r)),
      }))
      void apiUpdateReservationStatus(id, status)
        .then(() => reloadFromApi())
        .catch((e) => setApiError((e as Error).message))
    },
    [patchLocal, reloadFromApi],
  )

  const resetDemo = useCallback(() => {
    void reloadFromApi()
  }, [reloadFromApi])

  const api = useMemo<StoreApi>(
    () => ({
      state,
      apiMode: true,
      apiLoading,
      apiError,
      reloadFromApi,
      createOrder,
      updateOrderStatus,
      stockSacar,
      stockRetorno,
      addItemsToOrder,
      payOrder,
      cancelOrder,
      updateOrder,
      saveProduct,
      deleteProduct,
      saveUser,
      deleteUser,
      saveInventory,
      adjustStock,
      updateTable,
      saveSettings,
      saveBranch,
      deleteBranch,
      registerCustomer,
      loginCustomer,
      saveCustomerPassword,
      createReservation,
      updateReservationStatus,
      resetDemo,
      live,
      notices,
      dismissNotice,
      pushNotice,
    }),
    [
      state,
      apiLoading,
      apiError,
      reloadFromApi,
      createOrder,
      updateOrderStatus,
      stockSacar,
      stockRetorno,
      addItemsToOrder,
      payOrder,
      cancelOrder,
      updateOrder,
      saveProduct,
      deleteProduct,
      saveUser,
      deleteUser,
      saveInventory,
      adjustStock,
      updateTable,
      saveSettings,
      saveBranch,
      deleteBranch,
      registerCustomer,
      loginCustomer,
      saveCustomerPassword,
      createReservation,
      updateReservationStatus,
      resetDemo,
      live,
      notices,
      dismissNotice,
      pushNotice,
    ],
  )

  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore fuera de StoreProvider')
  return ctx
}
