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
  /** DNI / documento */
  dni?: string
  /** Cuenta interna: no se lista ni se edita desde Equipo */
  isSystem?: boolean
  /** Foto de perfil (MinIO o ui-avatars) */
  photoUrl?: string
  /** Local donde trabaja (mozo, etc.) */
  branchId?: string
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
  /** Si false, no imprime en comanda de cocina (ej. bebidas). Default: según categoría. */
  sendToKitchen?: boolean
  /** Si true, baja almacén al cobrar (gaseosa, pollo, etc.) */
  cuantificable?: boolean
  /** Receta: cuánto insumo consume 1 unidad vendida (ej. 1/2 pollo = 0.5) */
  recipes?: ProductRecipe[]
  optionGroups?: ProductOptionGroup[]
  tags?: string[]
  /** Unidades vendidas (últimos ~60 días) */
  soldCount?: number
  ratingAvg?: number
  reviewCount?: number
}

export interface ProductRecipe {
  inventoryId: string
  qtyPerUnit: number
}

export interface InventoryItem {
  id: string
  name: string
  unit: string
  stock: number
  minStock: number
  cost: number
  /** Precio de venta si se comercializa el insumo (ej. gaseosa) */
  salePrice?: number
}

export interface Table {
  id: string
  number: number
  seats: number
  zone: string
  status: TableStatus
  orderId?: string
  branchId?: string
}

export interface SelectedOption {
  groupId: string
  optionId: string
  name: string
  price: number
}

export interface OrderItem {
  id?: string
  productId: string
  name: string
  qty: number
  price: number
  notes?: string
  selectedOptions?: SelectedOption[]
  /** Ronda cocina: pendiente (recibido) | en_cocina | listo | undefined (barra) */
  kitchenStatus?: 'pendiente' | 'en_cocina' | 'listo' | null
  /** Ya se bajó del almacén (sacar cocina o cobro de barra) */
  stockDeducted?: boolean
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
  /** Preferencia de cobro en puerta (web/delivery). Paid sigue en false hasta liquidar. */
  codPaymentMethod?: 'yape' | 'plin' | 'efectivo'
  codCashAmount?: number
  createdAt: string
  updatedAt: string
  createdBy: string
  /** Usuario staff que tomó el pedido (GUID) — para reportes de mozos */
  createdByUserId?: string
  notes?: string
  source: 'pos' | 'web'
  driverId?: string
  driverName?: string
  driverPhone?: string
  driverPhotoUrl?: string
  driverVehicle?: string
  driverPlate?: string
  localWhatsapp?: string
  driverLat?: number
  driverLng?: number
  addressLat?: number
  addressLng?: number
  driverArrivedAt?: string
  deliveryPhotoUrl?: string
  driverSettledAt?: string
  /** Documento al cobrar: ticket interno, boleta o factura */
  docTipo?: FiscalDocTipo
  docNumero?: string
  docNombre?: string
  docEmail?: string
  docPhone?: string
  docAddress?: string
}

export type FiscalDocTipo = 'ninguno' | 'boleta_simple' | 'boleta_dni' | 'factura'

export type PaySplit = {
  method: PaymentMethod
  amount: number
  cashTendered?: number
  reference?: string
}

export type PrinterDriver = 'browser' | 'usb' | 'network' | 'rawbt'

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
  originLat?: number
  originLng?: number
  printers?: PrinterSetup
}

export interface Customer {
  id: string
  name: string
  phone: string
  email?: string
  password: string
  address?: string
  photoUrl?: string
  createdAt: string
}

export interface Driver {
  id: string
  name: string
  phone: string
  active: boolean
  vehicleInfo?: string
  plate?: string
  photoUrl?: string
  lat?: number
  lng?: number
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
  lat?: number
  lng?: number
}

export interface DeliveryRange {
  id: string
  branchId?: string
  name: string
  distanceKmFrom: number
  distanceKmTo: number | null
  fee: number
  sortOrder: number
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
  deliveryRanges?: DeliveryRange[]
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
  'clientes',
  'conductores',
  'reportes',
  'pedidos-web',
  'historial',
  'sucursales',
  'facturacion',
  'whatsapp',
  'web-config',
  'cupones',
  'config',
] as const

export type ModuleId = (typeof MODULES)[number]

export const ROLE_MODULES: Record<Role, ModuleId[]> = {
  /** Solo admin ve “Administrar” (carta, equipo, clientes, conductores, etc.) */
  admin: [...MODULES],
  /** Cajero: solo cobrar y liquidar */
  cajero: ['dashboard', 'comandas'],
  /** Cocina: solo preparar */
  cocina: ['cocina'],
  /** Mozo: mesas, pedidos, reservas, historial */
  mozo: ['mesas', 'pedidos-web', 'reservas', 'historial', 'pos'],
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrador',
  cajero: 'Cajero',
  cocina: 'Cocina',
  mozo: 'Mozo',
}

export function canCharge(role: Role) {
  return role === 'cajero' || role === 'admin'
}

export const ROLE_HOME: Record<Role, string> = {
  admin: '/',
  cajero: '/comandas',
  cocina: '/cocina',
  mozo: '/mesas',
}

export const STAFF_VIEW_OPTIONS: { id: Role; label: string; hint: string }[] = [
  { id: 'admin', label: 'Administrador', hint: 'Todo el sistema' },
  { id: 'mozo', label: 'Mozo', hint: 'Mesas, pedidos, reservas e historial' },
  { id: 'cocina', label: 'Cocina', hint: 'Preparar comandas' },
  { id: 'cajero', label: 'Caja', hint: 'Cobrar y liquidar' },
]

export const TYPE_LABEL: Record<OrderType, string> = {
  salon: 'Salón',
  llevar: 'Recojo en tienda',
  delivery: 'Delivery',
  web: 'Delivery',
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
