export type Role = 'admin' | 'cajero' | 'cocina' | 'mozo'

export type OrderType = 'salon' | 'llevar' | 'delivery' | 'web'
export type OrderStatus = 'nuevo' | 'en_cocina' | 'listo' | 'entregado' | 'cancelado'
export type PaymentMethod = 'efectivo' | 'yape' | 'tarjeta' | 'pendiente'
export type TableStatus = 'libre' | 'ocupada' | 'cuenta'

export interface User {
  id: string
  name: string
  email: string
  password: string
  role: Role
  active: boolean
  pin: string
  /** Celular WhatsApp para recuperación de cuenta */
  phone?: string
}

export interface ProductOption {
  id: string
  name: string
  price: number
}

export interface ProductOptionGroup {
  id: string
  title: string
  required: boolean
  maxSelect: number
  options: ProductOption[]
}

export interface Product {
  id: string
  name: string
  description: string
  category: string
  price: number
  originalPrice?: number
  emoji: string
  tone: string
  /** URL pública MinIO (foto del plato) */
  imageUrl?: string
  available: boolean
  prepMinutes: number
  optionGroups?: ProductOptionGroup[]
  tags?: string[]
}

export interface InventoryItem {
  id: string
  name: string
  unit: string
  stock: number
  minStock: number
  cost: number
}

export interface Table {
  id: string
  number: number
  seats: number
  zone: string
  status: TableStatus
  orderId?: string
}

export interface SelectedOption {
  groupId: string
  optionId: string
  name: string
  price: number
}

export interface OrderItem {
  productId: string
  name: string
  qty: number
  price: number
  notes?: string
  selectedOptions?: SelectedOption[]
}

export interface Order {
  id: string
  number: number
  type: OrderType
  status: OrderStatus
  tableId?: string
  tableNumber?: number
  customerName: string
  customerPhone?: string
  customerId?: string
  address?: string
  items: OrderItem[]
  discount: number
  subtotal: number
  igv: number
  total: number
  paymentMethod: PaymentMethod
  paid: boolean
  createdAt: string
  updatedAt: string
  createdBy: string
  notes?: string
  source: 'pos' | 'web'
  driverLat?: number
  driverLng?: number
}

export type PrinterDriver = 'browser' | 'usb' | 'network'

export interface PrinterConfig {
  id: string
  label: string
  driver: PrinterDriver
  enabled: boolean
  usbVendorId?: number
  usbProductId?: number
  usbDeviceName?: string
  networkUrl?: string
  cols: number
  openDrawer: boolean
  beepOnPrint: boolean
  autoCut: boolean
}

export interface PrinterSetup {
  caja: PrinterConfig
  cocina: PrinterConfig
}

export const DEFAULT_PRINTER: PrinterConfig = {
  id: '',
  label: '',
  driver: 'browser',
  enabled: true,
  cols: 48,
  openDrawer: false,
  beepOnPrint: false,
  autoCut: true,
}

export interface Settings {
  name: string
  slogan: string
  address: string
  phone: string
  ruc: string
  igvRate: number
  hours: string
  deliveryFee: number
  printers?: PrinterSetup
}

export interface Customer {
  id: string
  name: string
  phone: string
  email?: string
  password: string
  address?: string
  createdAt: string
}

export type ReservationStatus = 'pendiente' | 'confirmada' | 'cancelada' | 'completada'

export interface Reservation {
  id: string
  customerName: string
  customerPhone: string
  customerId?: string
  date: string
  time: string
  guests: number
  notes?: string
  status: ReservationStatus
  createdAt: string
}

export interface Branch {
  id: string
  name: string
  address: string
  phone: string
  active: boolean
}

export interface AppState {
  users: User[]
  products: Product[]
  inventory: InventoryItem[]
  tables: Table[]
  orders: Order[]
  customers: Customer[]
  reservations: Reservation[]
  settings: Settings
  branches: Branch[]
  nextOrderNumber: number
}

export const MODULES = [
  'dashboard',
  'pos',
  'comandas',
  'cocina',
  'mesas',
  'reservas',
  'menu',
  'inventario',
  'usuarios',
  'reportes',
  'pedidos-web',
  'sucursales',
  'facturacion',
  'whatsapp',
  'web-config',
  'config',
] as const

export type ModuleId = (typeof MODULES)[number]

export const ROLE_MODULES: Record<Role, ModuleId[]> = {
  admin: [...MODULES],
  cajero: ['dashboard', 'pos', 'comandas', 'mesas', 'reservas', 'pedidos-web', 'reportes', 'facturacion', 'whatsapp'],
  cocina: ['cocina', 'comandas'],
  mozo: ['pos', 'comandas', 'mesas', 'reservas'],
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrador',
  cajero: 'Cajero',
  cocina: 'Cocina',
  mozo: 'Mozo',
}

export const ROLE_HOME: Record<Role, string> = {
  admin: '/',
  cajero: '/',
  cocina: '/cocina',
  mozo: '/mesas',
}

export const TYPE_LABEL: Record<OrderType, string> = {
  salon: 'Salón',
  llevar: 'Para llevar',
  delivery: 'Delivery',
  web: 'Pedido web',
}

export const PAY_LABEL: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  yape: 'Yape / Plin',
  tarjeta: 'Tarjeta',
  pendiente: 'Pendiente',
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  nuevo: 'Nuevo',
  en_cocina: 'En cocina',
  listo: 'Listo',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
}
