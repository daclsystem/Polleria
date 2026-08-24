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
import { notifyOrderCreated, notifyOrderStatus } from '../lib/whatsapp'
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
  apiUpdateReservationStatus,
  apiUpdateTable,
  getApiToken,
  usingApi,
} from '../lib/apiClient'
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
      deliveryFee: 5,
    },
    branches: [],
    nextOrderNumber: 1001,
  }
}

function requireApi() {
  if (!usingApi()) throw new Error('VITE_API_URL no configurada')
}

function isGuid(id?: string) {
  return Boolean(id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
}

interface NewOrderInput {
  type: Order['type']
  items: OrderItem[]
  customerName: string
  customerPhone?: string
  customerId?: string
  address?: string
  tableId?: string
  discount?: number
  paymentMethod: PaymentMethod
  paid: boolean
  notes?: string
  createdBy: string
  source: Order['source']
  codPaymentMethod?: 'yape' | 'plin' | 'efectivo'
  codCashAmount?: number
  deliveryFee?: number
  deliveryDistanceKm?: number
  deliveryTimeMin?: number
  addressLat?: number
  addressLng?: number
}

interface StoreApi {
  state: AppState
  apiMode: boolean
  apiLoading: boolean
  apiError: string | null
  reloadFromApi: () => Promise<void>
  createOrder: (input: NewOrderInput) => Order
  updateOrderStatus: (id: string, status: OrderStatus) => void
  addItemsToOrder: (id: string, newItems: OrderItem[], createdBy: string) => void
  payOrder: (id: string, method: PaymentMethod) => void
  cancelOrder: (id: string) => void
  updateOrder: (id: string, patch: Partial<Order>) => void
  saveProduct: (product: Product) => void
  deleteProduct: (id: string) => void
  saveUser: (user: User) => void
  deleteUser: (id: string) => void
  saveInventory: (item: InventoryItem) => void
  adjustStock: (id: string, delta: number) => void
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
}

const StoreContext = createContext<StoreApi | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(emptyApiState)
  const [apiLoading, setApiLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  const reloadFromApi = useCallback(async () => {
    requireApi()
    if (!getApiToken()) return
    setApiLoading(true)
    setApiError(null)
    try {
      const data = await apiBootstrap()
      setState({
        users: data.users as User[],
        products: data.products as Product[],
        tables: data.tables as Table[],
        inventory: data.inventory as InventoryItem[],
        settings: data.settings as Settings,
        orders: data.orders as Order[],
        customers: data.customers as Customer[],
        reservations: data.reservations as Reservation[],
        branches: data.branches as AppState['branches'],
        nextOrderNumber: data.nextOrderNumber,
      })
    } catch (e) {
      setApiError((e as Error).message)
    } finally {
      setApiLoading(false)
    }
  }, [])

  useEffect(() => {
    requireApi()
    if (getApiToken()) {
      void reloadFromApi()
      const t = setInterval(() => void reloadFromApi(), 8000)
      return () => clearInterval(t)
    }
    void apiFetch<{ products: Product[] }>('/api/catalog/products', { auth: false })
      .then((data) => setState((prev) => ({ ...prev, products: data.products })))
      .catch((e) => setApiError((e as Error).message))
    return undefined
  }, [reloadFromApi])

  const patchLocal = useCallback((updater: (prev: AppState) => AppState) => {
    setState((prev) => updater(prev))
  }, [])

  const createOrder = useCallback(
    (input: NewOrderInput) => {
      requireApi()
      let created!: Order
      patchLocal((prev) => {
        const money = totalsFromItems(input.items, input.discount ?? 0, prev.settings.igvRate)
        const table = prev.tables.find((t) => t.id === input.tableId)
        created = {
          id: uid('ord'),
          number: prev.nextOrderNumber,
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
          paymentMethod: input.paymentMethod,
          paid: input.paid,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: input.createdBy,
          notes: input.notes,
          source: input.source,
        }
        const tables = prev.tables.map((t) =>
          t.id === input.tableId ? { ...t, status: 'ocupada' as const, orderId: created.id } : t,
        )
        return {
          ...prev,
          orders: [created, ...prev.orders],
          tables,
          nextOrderNumber: prev.nextOrderNumber + 1,
        }
      })

      const guid = (id?: string) => (isGuid(id) ? id : undefined)
      const codMethod =
        input.codPaymentMethod ||
        (input.source === 'web' || input.type === 'delivery'
          ? input.paymentMethod === 'yape' || input.paymentMethod === 'efectivo'
            ? input.paymentMethod
            : 'yape'
          : undefined)

      void apiCreateOrder({
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
        tableId: guid(input.tableId),
        tableNumber: created.tableNumber,
        notes: input.notes,
        discount: input.discount ?? 0,
        subtotal: created.subtotal,
        igv: created.igv,
        total: created.total,
        createdByUserId: guid(input.createdBy),
        codPaymentMethod: codMethod,
        codCashAmount: input.codCashAmount,
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
        .then(() => {
          void notifyOrderCreated(created)
          if (getApiToken()) void reloadFromApi()
        })
        .catch((e) => setApiError((e as Error).message))

      return created
    },
    [patchLocal, reloadFromApi],
  )

  const updateOrderStatus = useCallback(
    (id: string, status: OrderStatus) => {
      requireApi()
      let updated: Order | undefined
      patchLocal((prev) => {
        const orders = prev.orders.map((o) =>
          o.id === id ? { ...o, status, updatedAt: new Date().toISOString() } : o,
        )
        const order = orders.find((o) => o.id === id)
        updated = order
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
      void apiUpdateOrderStatus(id, status)
        .then(() => {
          if (updated) void notifyOrderStatus(updated, status)
          void reloadFromApi()
        })
        .catch((e) => setApiError((e as Error).message))
    },
    [patchLocal, reloadFromApi],
  )

  const addItemsToOrder = useCallback(
    (id: string, newItems: OrderItem[], createdBy: string) => {
      requireApi()
      let money = { subtotal: 0, igv: 0, total: 0 }
      let discount = 0
      patchLocal((prev) => {
        const order = prev.orders.find((o) => o.id === id)
        if (!order) return prev
        const mergedItems = [...order.items]
        for (const item of newItems) {
          const existing = mergedItems.find(
            (i) => i.productId === item.productId && i.notes === item.notes && !item.selectedOptions?.length,
          )
          if (existing) existing.qty += item.qty
          else mergedItems.push(item)
        }
        money = totalsFromItems(mergedItems, order.discount, prev.settings.igvRate)
        discount = order.discount
        return {
          ...prev,
          orders: prev.orders.map((o) =>
            o.id === id
              ? {
                  ...o,
                  items: mergedItems,
                  ...money,
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
    (id: string, delta: number) => {
      requireApi()
      patchLocal((prev) => ({
        ...prev,
        inventory: prev.inventory.map((i) =>
          i.id === id ? { ...i, stock: Math.max(0, Math.round((i.stock + delta) * 100) / 100) } : i,
        ),
      }))
      void apiAdjustStock(id, delta)
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
    }),
    [
      state,
      apiLoading,
      apiError,
      reloadFromApi,
      createOrder,
      updateOrderStatus,
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
    ],
  )

  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore fuera de StoreProvider')
  return ctx
}
