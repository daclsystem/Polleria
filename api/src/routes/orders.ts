import { Router } from 'express'
import { v4 as uuid } from 'uuid'
import { getPool, sql } from '../db.js'
import { authRequired } from '../auth.js'
import { emitEvent, roomsForOrderStatus } from '../realtime.js'
import { notifyOrderCreatedServer, notifyOrderStatusServer } from '../lib/whatsappNotify.js'
import {
  deductStockForKitchenItems,
  deductStockForOrderItems,
  deductStockForSaleItems,
  publishInventorySnapshot,
  restoreStockForCancelledOrder,
  restoreStockForOrderItems,
} from '../lib/stockDeduct.js'
import {
  computeCouponDiscount,
  customerCouponUses,
  loadCouponByCode,
} from './coupons.js'

export const ordersRouter = Router()

function paramId(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value
}

/** ¿Hay al menos un producto de preparación (SendToKitchen)? */
async function productsNeedKitchen(productIds: Array<string | undefined | null>) {
  const ids = [...new Set(productIds.filter((id): id is string => Boolean(id)))]
  if (!ids.length) return false
  try {
    const pool = await getPool()
    const req = pool.request()
    const placeholders = ids.map((_, i) => {
      req.input(`p${i}`, sql.UniqueIdentifier, ids[i])
      return `@p${i}`
    })
    const r = await req.query(`
      SELECT TOP 1 1 AS ok
      FROM dbo.Products
      WHERE Id IN (${placeholders.join(',')})
        AND ISNULL(
          SendToKitchen,
          CASE WHEN Category LIKE N'%Bebida%' OR Category LIKE N'%Gaseosa%' THEN 0 ELSE 1 END
        ) = 1
    `)
    return r.recordset.length > 0
  } catch {
    // Columna aún no migrada: notificar cocina por defecto
    return true
  }
}

/** KitchenStatus por producto (NULL = no cocina) */
async function kitchenStatusForProduct(productId?: string | null): Promise<string | null> {
  if (!productId) return null
  try {
    const pool = await getPool()
    const r = await pool
      .request()
      .input('id', sql.UniqueIdentifier, productId)
      .query(`
        SELECT ISNULL(
          SendToKitchen,
          CASE WHEN Category LIKE N'%Bebida%' OR Category LIKE N'%Gaseosa%' THEN 0 ELSE 1 END
        ) AS SendToKitchen
        FROM dbo.Products WHERE Id=@id
      `)
    const ok = Boolean(r.recordset[0]?.SendToKitchen)
    return ok ? 'pendiente' : null
  } catch {
    return 'pendiente'
  }
}

async function deriveOrderStatusFromItems(orderId: string, tx?: InstanceType<typeof sql.Transaction>) {
  const req = tx ? new sql.Request(tx) : (await getPool()).request()
  const r = await req.input('orderId', sql.UniqueIdentifier, orderId).query(`
    SELECT KitchenStatus FROM dbo.OrderItems
    WHERE OrderId=@orderId AND KitchenStatus IS NOT NULL
  `)
  const statuses = r.recordset.map((x: { KitchenStatus: string }) => String(x.KitchenStatus))
  if (!statuses.length) return null
  if (statuses.some((s) => s === 'en_cocina')) return 'en_cocina'
  if (statuses.some((s) => s === 'pendiente')) return 'nuevo'
  if (statuses.every((s) => s === 'listo')) return 'listo'
  return null
}

function mapTrackOrder(
  order: Record<string, unknown>,
  items: unknown[],
  driver?: { Id?: string; Name?: string; Phone?: string } | null,
) {
  return {
    id: String(order.Id),
    number: Number(order.Number),
    type: order.Type,
    status: order.Status,
    customerName: order.CustomerName,
    customerPhone: order.CustomerPhone
      ? `***${String(order.CustomerPhone).replace(/\D/g, '').slice(-4)}`
      : undefined,
    address: order.Address || undefined,
    addressLat: order.AddressLat != null ? Number(order.AddressLat) : undefined,
    addressLng: order.AddressLng != null ? Number(order.AddressLng) : undefined,
    items: (items as Array<Record<string, unknown>>).map((it) => ({
      name: it.Name,
      qty: Number(it.Qty),
      price: Number(it.Price),
    })),
    discount: Number(order.Discount || 0),
    subtotal: Number(order.Subtotal),
    igv: Number(order.Igv),
    total: Number(order.Total),
    paid: Boolean(order.Paid),
    deliveryFee: Number(order.DeliveryFee || 0),
    driverId: order.DriverId ? String(order.DriverId) : undefined,
    driverName: driver?.Name ? String(driver.Name) : undefined,
    driverLat: order.DriverLat != null ? Number(order.DriverLat) : undefined,
    driverLng: order.DriverLng != null ? Number(order.DriverLng) : undefined,
    createdAt: new Date(order.CreatedAt as string).toISOString(),
    updatedAt: new Date(order.UpdatedAt as string).toISOString(),
    notes: order.Notes || undefined,
    source: order.Source,
    codPaymentMethod: order.CodPaymentMethod || undefined,
  }
}

async function loadOrder(orderId: string) {
  const pool = await getPool()
  const order = await pool
    .request()
    .input('id', sql.UniqueIdentifier, orderId)
    .query(`SELECT * FROM dbo.Orders WHERE Id = @id`)
  if (!order.recordset[0]) return null

  const items = await pool
    .request()
    .input('id', sql.UniqueIdentifier, orderId)
    .query(`SELECT * FROM dbo.OrderItems WHERE OrderId = @id ORDER BY SortOrder`)

  const payments = await pool
    .request()
    .input('id', sql.UniqueIdentifier, orderId)
    .query(`SELECT * FROM dbo.OrderPayments WHERE OrderId = @id ORDER BY CreatedAt`)

  return {
    ...order.recordset[0],
    items: items.recordset,
    payments: payments.recordset,
  }
}

/** Tracking público tipo PedidosYa — sin auth */
ordersRouter.get('/track/:id', async (req, res) => {
  try {
    const id = paramId(req.params.id)
    const tel = String(req.query.tel || '').replace(/\D/g, '')
    const order = await loadOrder(id)
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' })

    if (tel) {
      const phone = String(order.CustomerPhone || '').replace(/\D/g, '')
      const telDigits = tel.replace(/\D/g, '')
      const ok =
        !telDigits ||
        !phone ||
        phone.endsWith(telDigits.slice(-9)) ||
        phone.endsWith(telDigits.slice(-4)) ||
        telDigits.endsWith(phone.slice(-9)) ||
        telDigits.endsWith(phone.slice(-4))
      if (!ok) {
        return res.status(403).json({ error: 'Teléfono no coincide con el pedido' })
      }
    }

    let driver: { Id?: string; Name?: string; Phone?: string } | null = null
    if (order.DriverId) {
      const pool = await getPool()
      const dr = await pool
        .request()
        .input('id', sql.UniqueIdentifier, String(order.DriverId))
        .query(`SELECT TOP 1 Id, Name, Phone FROM dbo.Drivers WHERE Id=@id`)
      driver = dr.recordset[0] || null
    }

    const isDelivery = order.Type === 'delivery' || order.Type === 'web'
    res.json({
      order: mapTrackOrder(order, order.items as unknown[], driver),
      steps: isDelivery
        ? [
            { key: 'nuevo', label: 'Pedido recibido' },
            { key: 'en_cocina', label: 'Preparando' },
            { key: 'listo', label: 'Listo · esperando repartidor' },
            { key: 'en_camino', label: 'En camino' },
            { key: 'entregado', label: 'Entregado' },
          ]
        : [
            { key: 'nuevo', label: 'Pedido recibido' },
            { key: 'en_cocina', label: 'Preparando' },
            { key: 'listo', label: 'Listo para recojo' },
            { key: 'entregado', label: 'Entregado' },
          ],
    })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

/** Tracking por número + celular */
ordersRouter.get('/track', async (req, res) => {
  try {
    const number = Number(req.query.number)
    const tel = String(req.query.tel || '').replace(/\D/g, '')
    if (!number || !tel) return res.status(400).json({ error: 'number y tel requeridos' })

    const pool = await getPool()
    const r = await pool
      .request()
      .input('number', sql.Int, number)
      .query(`SELECT TOP 1 * FROM dbo.Orders WHERE Number = @number`)
    const row = r.recordset[0]
    if (!row) return res.status(404).json({ error: 'Pedido no encontrado' })

    const phone = String(row.CustomerPhone || '').replace(/\D/g, '')
    if (!phone.endsWith(tel.slice(-9)) && !phone.endsWith(tel.slice(-4))) {
      return res.status(403).json({ error: 'Teléfono no coincide' })
    }

    const order = await loadOrder(String(row.Id))
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' })
    res.json({
      order: mapTrackOrder(order, order.items as unknown[]),
      steps: [
        { key: 'nuevo', label: 'Pedido recibido' },
        { key: 'en_cocina', label: 'Preparando' },
        { key: 'listo', label: 'Listo / en camino' },
        { key: 'entregado', label: 'Entregado' },
      ],
    })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

/** Historial del cliente autenticado (login por celular) */
ordersRouter.get('/mine', authRequired, async (req, res) => {
  try {
    const u = req.user
    if (!u || (u.accountType !== 'customer' && u.role !== 'customer')) {
      return res.status(403).json({ error: 'Solo clientes' })
    }
    const pool = await getPool()
    const r = await pool
      .request()
      .input('customerId', sql.UniqueIdentifier, u.id)
      .query(`
        SELECT TOP 100 o.*
        FROM dbo.Orders o
        WHERE o.CustomerId = @customerId
        ORDER BY o.CreatedAt DESC
      `)

    const orders = []
    for (const row of r.recordset) {
      const full = await loadOrder(String(row.Id))
      if (!full) continue
      const rawItems = ((full as { items?: unknown[] }).items || []) as Array<Record<string, unknown>>
      const items = rawItems.map((it) => ({
        id: String(it.Id || it.id || ''),
        productId: it.ProductId ? String(it.ProductId) : 'x',
        name: String(it.Name || ''),
        qty: Number(it.Qty || 0),
        price: Number(it.Price || 0),
        notes: it.Notes ? String(it.Notes) : undefined,
      }))
      orders.push({
        id: String(full.Id),
        number: Number(full.Number),
        type: full.Type,
        status: full.Status,
        customerName: full.CustomerName,
        customerPhone: full.CustomerPhone || undefined,
        customerId: full.CustomerId ? String(full.CustomerId) : u.id,
        address: full.Address || undefined,
        items,
        discount: Number(full.Discount || 0),
        subtotal: Number(full.Subtotal),
        igv: Number(full.Igv),
        total: Number(full.Total),
        paymentMethod: full.Paid ? 'efectivo' : 'pendiente',
        paid: Boolean(full.Paid),
        codPaymentMethod: full.CodPaymentMethod || undefined,
        createdAt: new Date(full.CreatedAt as string).toISOString(),
        updatedAt: new Date(full.UpdatedAt as string).toISOString(),
        createdBy: 'Web',
        source: full.Source,
        driverId: full.DriverId ? String(full.DriverId) : undefined,
      })
    }
    res.json({ orders })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

ordersRouter.get('/', authRequired, async (req, res) => {
  const status = req.query.status as string | undefined
  const pool = await getPool()
  const request = pool.request()
  let where = '1=1'
  if (status) {
    request.input('status', sql.NVarChar, status)
    where += ' AND Status = @status'
  }
  const r = await request.query(`
    SELECT TOP 200 * FROM dbo.Orders
    WHERE ${where}
    ORDER BY CreatedAt DESC
  `)
  res.json({ orders: r.recordset })
})

ordersRouter.get('/kitchen', authRequired, async (_req, res) => {
  const pool = await getPool()
  const r = await pool.request().query(`
    SELECT * FROM dbo.Orders
    WHERE Status IN (N'nuevo', N'en_cocina', N'listo')
    ORDER BY CreatedAt ASC
  `)
  res.json({ orders: r.recordset })
})

ordersRouter.get('/:id', authRequired, async (req, res) => {
  const order = await loadOrder(paramId(req.params.id))
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' })
  res.json({ order })
})

type CodMethod = 'yape' | 'plin' | 'efectivo'

/** Crear pedido (POS mozo/caja o web cliente) */
ordersRouter.post('/', async (req, res) => {
  const body = req.body as {
    type: 'salon' | 'llevar' | 'delivery' | 'web'
    source: 'pos' | 'web'
    customerName: string
    customerPhone?: string
    customerId?: string
    address?: string
    addressLat?: number
    addressLng?: number
    deliveryDistanceKm?: number
    deliveryTimeMin?: number
    deliveryFee?: number
    branchId?: string
    tableId?: string
    tableNumber?: number
    notes?: string
    discount?: number
    couponCode?: string
    subtotal: number
    igv: number
    total: number
    createdByUserId?: string
    codPaymentMethod?: CodMethod
    codCashAmount?: number
    items: Array<{
      productId?: string
      name: string
      qty: number
      price: number
      notes?: string
      options?: Array<{ groupId?: string; optionId?: string; name: string; price: number }>
    }>
  }

  if (!body.customerName || !body.items?.length) {
    return res.status(400).json({ error: 'customerName e items requeridos' })
  }

  if (body.type === 'delivery') {
    try {
      const { quoteDeliveryAddress, quoteDeliveryPoint } = await import('../lib/deliveryQuote.js')
      const quoted =
        body.addressLat != null && body.addressLng != null
          ? await quoteDeliveryPoint(Number(body.addressLat), Number(body.addressLng), body.branchId)
          : body.address
            ? await quoteDeliveryAddress(String(body.address), body.branchId)
            : null
      if (quoted) {
        body.addressLat = quoted.lat
        body.addressLng = quoted.lng
        body.deliveryDistanceKm = quoted.distanceKm
        body.deliveryTimeMin = quoted.timeMin
        body.deliveryFee = quoted.fee
        const hasFeeLine = body.items.some((i) => i.productId === 'delivery' || /^delivery$/i.test(i.name))
        if (!hasFeeLine && quoted.fee > 0) {
          body.items.push({ productId: undefined, name: 'Delivery', qty: 1, price: quoted.fee })
          const itemsGross = body.items.reduce((s, i) => s + i.qty * i.price, 0)
          const after = Math.max(0, itemsGross - Number(body.discount || 0))
          const igvRate = 0.18
          body.total = after
          body.subtotal = Math.round((after / (1 + igvRate)) * 100) / 100
          body.igv = Math.round((after - body.subtotal) * 100) / 100
        }
      }
    } catch (e) {
      const err = e as Error & { status?: number }
      return res.status(err.status || 422).json({ error: err.message || 'No se pudo calcular el delivery' })
    }
  }

  if (body.source === 'web' || body.type === 'delivery') {
    if (!body.codPaymentMethod) {
      return res.status(400).json({ error: 'Indica pago contra entrega: yape | plin | efectivo' })
    }
    // Efectivo sin monto → se asume el total (repartidor/caja liquidan después)
    if (body.codPaymentMethod === 'efectivo' && !(body.codCashAmount && body.codCashAmount > 0)) {
      body.codCashAmount = Number(body.total) || 0
    }
  }

  let appliedCoupon: Awaited<ReturnType<typeof loadCouponByCode>> = null
  let appliedDiscount = Number(body.discount ?? 0)
  const couponCodeRaw = String(body.couponCode || '').trim().toUpperCase()
  if (couponCodeRaw) {
    appliedCoupon = await loadCouponByCode(couponCodeRaw)
    if (!appliedCoupon) return res.status(400).json({ error: 'Cupón no válido' })
    if (body.customerId) {
      const uses = await customerCouponUses(appliedCoupon.id, body.customerId)
      if (uses >= appliedCoupon.maxUsesPerCustomer) {
        return res.status(400).json({ error: 'Ya usaste este cupón el máximo de veces' })
      }
    }
    const itemsGross = body.items.reduce((s, i) => s + i.qty * i.price, 0)
    const calc = computeCouponDiscount(appliedCoupon, itemsGross)
    if (!calc.ok) return res.status(400).json({ error: calc.error })
    appliedDiscount = calc.discount
    const after = Math.max(0, Math.round((itemsGross - appliedDiscount) * 100) / 100)
    const igvRate = body.subtotal > 0 ? body.igv / body.subtotal : 0.18
    body.total = after
    body.subtotal = Math.round((after / (1 + igvRate)) * 100) / 100
    body.igv = Math.round((after - body.subtotal) * 100) / 100
    body.discount = appliedDiscount
    if (body.codPaymentMethod === 'efectivo') body.codCashAmount = after
  }

  const pool = await getPool()
  const tx = new sql.Transaction(pool)
  await tx.begin()

  try {
    const numRes = await new sql.Request(tx).query(`
      UPDATE dbo.Settings
      SET NextOrderNumber = NextOrderNumber + 1, UpdatedAt = SYSUTCDATETIME()
      OUTPUT DELETED.NextOrderNumber AS Number
      WHERE Id = 1
    `)
    const number = Number(numRes.recordset[0].Number)
    const orderId = uuid()

    await new sql.Request(tx)
      .input('id', sql.UniqueIdentifier, orderId)
      .input('number', sql.Int, number)
      .input('type', sql.NVarChar, body.type)
      .input('status', sql.NVarChar, 'nuevo')
      .input('tableId', sql.UniqueIdentifier, body.tableId || null)
      .input('tableNumber', sql.Int, body.tableNumber ?? null)
      .input('customerId', sql.UniqueIdentifier, body.customerId || null)
      .input('customerName', sql.NVarChar, body.customerName)
      .input('customerPhone', sql.NVarChar, body.customerPhone || null)
      .input('address', sql.NVarChar, body.address || null)
      .input('addressLat', sql.Decimal(10, 7), body.addressLat ?? null)
      .input('addressLng', sql.Decimal(10, 7), body.addressLng ?? null)
      .input('deliveryDistanceKm', sql.Decimal(8, 2), body.deliveryDistanceKm ?? null)
      .input('deliveryTimeMin', sql.Int, body.deliveryTimeMin ?? null)
      .input('deliveryFee', sql.Decimal(10, 2), body.deliveryFee ?? 0)
      .input('codPaymentMethod', sql.NVarChar, body.codPaymentMethod || null)
      .input('codCashAmount', sql.Decimal(10, 2), body.codCashAmount ?? null)
      .input('discount', sql.Decimal(10, 2), appliedDiscount)
      .input('couponCode', sql.NVarChar, appliedCoupon?.code || null)
      .input('subtotal', sql.Decimal(10, 2), body.subtotal)
      .input('igv', sql.Decimal(10, 2), body.igv)
      .input('total', sql.Decimal(10, 2), body.total)
      .input('notes', sql.NVarChar, body.notes || null)
      .input('source', sql.NVarChar, body.source)
      .input('createdBy', sql.UniqueIdentifier, body.createdByUserId || null)
      .query(`
        INSERT INTO dbo.Orders (
          Id, Number, Type, Status, TableId, TableNumber, CustomerId, CustomerName, CustomerPhone,
          Address, AddressLat, AddressLng, DeliveryDistanceKm, DeliveryTimeMin, DeliveryFee,
          CodPaymentMethod, CodCashAmount, Discount, CouponCode, Subtotal, Igv, Total, Paid, Notes, Source, CreatedByUserId
        ) VALUES (
          @id, @number, @type, @status, @tableId, @tableNumber, @customerId, @customerName, @customerPhone,
          @address, @addressLat, @addressLng, @deliveryDistanceKm, @deliveryTimeMin, @deliveryFee,
          @codPaymentMethod, @codCashAmount, @discount, @couponCode, @subtotal, @igv, @total, 0, @notes, @source, @createdBy
        )
      `)

    let sort = 0
    for (const item of body.items) {
      const itemId = uuid()
      const kStatus = await kitchenStatusForProduct(item.productId)
      await new sql.Request(tx)
        .input('id', sql.UniqueIdentifier, itemId)
        .input('orderId', sql.UniqueIdentifier, orderId)
        .input('productId', sql.UniqueIdentifier, item.productId || null)
        .input('name', sql.NVarChar, item.name)
        .input('qty', sql.Int, item.qty)
        .input('price', sql.Decimal(10, 2), item.price)
        .input('notes', sql.NVarChar, item.notes || null)
        .input('sort', sql.Int, sort++)
        .input('kitchenStatus', sql.NVarChar, kStatus)
        .query(`
          INSERT INTO dbo.OrderItems (Id, OrderId, ProductId, Name, Qty, Price, Notes, SortOrder, KitchenStatus)
          VALUES (@id, @orderId, @productId, @name, @qty, @price, @notes, @sort, @kitchenStatus)
        `)

      for (const opt of item.options || []) {
        await new sql.Request(tx)
          .input('id', sql.UniqueIdentifier, uuid())
          .input('itemId', sql.UniqueIdentifier, itemId)
          .input('groupId', sql.UniqueIdentifier, opt.groupId || null)
          .input('optionId', sql.UniqueIdentifier, opt.optionId || null)
          .input('name', sql.NVarChar, opt.name)
          .input('price', sql.Decimal(10, 2), opt.price)
          .query(`
            INSERT INTO dbo.OrderItemOptions (Id, OrderItemId, GroupId, OptionId, Name, Price)
            VALUES (@id, @itemId, @groupId, @optionId, @name, @price)
          `)
      }
    }

    if (body.tableId) {
      await new sql.Request(tx)
        .input('tableId', sql.UniqueIdentifier, body.tableId)
        .input('orderId', sql.UniqueIdentifier, orderId)
        .query(`
          UPDATE dbo.Tables SET Status = N'ocupada', CurrentOrderId = @orderId WHERE Id = @tableId
        `)
    }

    if (appliedCoupon) {
      await new sql.Request(tx)
        .input('id', sql.UniqueIdentifier, uuid())
        .input('couponId', sql.UniqueIdentifier, appliedCoupon.id)
        .input('customerId', sql.UniqueIdentifier, body.customerId || null)
        .input('orderId', sql.UniqueIdentifier, orderId)
        .input('discount', sql.Decimal(10, 2), appliedDiscount)
        .query(`
          INSERT INTO dbo.CouponRedemptions (Id, CouponId, CustomerId, OrderId, Discount)
          VALUES (@id, @couponId, @customerId, @orderId, @discount);
          UPDATE dbo.Coupons SET UsedCount = UsedCount + 1 WHERE Id = @couponId;
        `)
    }

    await tx.commit()

    const order = await loadOrder(orderId)
    emitEvent('order:created', order, ['ops', 'caja'])
    const needsKitchen = await productsNeedKitchen(body.items.map((i) => i.productId))
    if (needsKitchen) {
      emitEvent('kitchen:new', order, ['cocina'])
    }

    // WhatsApp: solo delivery o pedido del cliente (app/web) — no mesa/salón POS
    void notifyOrderCreatedServer({
      ...(order as Record<string, unknown>),
      Id: orderId,
      Number: (order as { Number: number }).Number,
      Type: (order as { Type: string }).Type,
      Status: (order as { Status: string }).Status,
      CustomerName: (order as { CustomerName: string }).CustomerName,
      CustomerPhone: (order as { CustomerPhone?: string }).CustomerPhone,
      Address: (order as { Address?: string }).Address,
      Total: (order as { Total: number }).Total,
      CodPaymentMethod: (order as { CodPaymentMethod?: string }).CodPaymentMethod,
      Source: (order as { Source?: string }).Source || body.source,
      items: ((order as { items?: Array<{ Name: string; Qty: number; Price: number }> }).items || []).map((i) => ({
        Name: i.Name,
        Qty: i.Qty,
        Price: i.Price,
      })),
    }).catch((e) => console.warn('[whatsapp] create', (e as Error).message))

    const isCustomerChannel = body.source === 'web' || body.type === 'delivery' || body.type === 'web'
    res.status(201).json({
      order,
      trackingUrl: isCustomerChannel
        ? `${(process.env.FRONT_PUBLIC_URL || 'https://chifapollerialopez.com').replace(/\/$/, '')}/seguimiento/${orderId}`
        : undefined,
      whatsappPending: isCustomerChannel,
    })
  } catch (e) {
    await tx.rollback()
    res.status(500).json({ error: (e as Error).message })
  }
})

ordersRouter.patch('/:id/status', authRequired, async (req, res) => {
  const { status, kitchenFrom } = req.body as {
    status?: string
    kitchenFrom?: 'pendiente' | 'en_cocina'
  }
  const allowed = ['nuevo', 'en_cocina', 'listo', 'entregado', 'cancelado']
  if (!status || !allowed.includes(status)) {
    return res.status(400).json({ error: 'status inválido' })
  }

  const pool = await getPool()
  const orderId = paramId(req.params.id)
  const existing = await loadOrder(orderId)
  if (!existing) return res.status(404).json({ error: 'Pedido no encontrado' })

  const orderType = String(existing.Type || '')
  const isDeliveryOrder = orderType === 'delivery' || orderType === 'web'

  // Delivery: no marcar entregado sin repartidor asignado (solo el conductor o con DriverId)
  if (status === 'entregado' && isDeliveryOrder && !existing.DriverId) {
    return res.status(400).json({
      error: 'Asigna un repartidor antes de marcar entregado. El conductor confirma la entrega en su app.',
    })
  }

  const tx = new sql.Transaction(pool)
  await tx.begin()
  try {
    if (status === 'en_cocina') {
      const from = kitchenFrom || 'pendiente'
      await new sql.Request(tx)
        .input('orderId', sql.UniqueIdentifier, orderId)
        .input('from', sql.NVarChar, from)
        .query(`
          UPDATE dbo.OrderItems
          SET KitchenStatus = N'en_cocina'
          WHERE OrderId=@orderId AND KitchenStatus=@from
        `)
      // Baja de almacén en tiempo real (receta × qty)
      await deductStockForKitchenItems(orderId, tx, req.user?.id || null)
    } else if (status === 'listo') {
      const from = kitchenFrom || 'en_cocina'
      await new sql.Request(tx)
        .input('orderId', sql.UniqueIdentifier, orderId)
        .input('from', sql.NVarChar, from)
        .query(`
          UPDATE dbo.OrderItems
          SET KitchenStatus = N'listo'
          WHERE OrderId=@orderId AND KitchenStatus=@from
        `)
    } else if (status === 'entregado' || status === 'cancelado') {
      if (status === 'cancelado') {
        await restoreStockForCancelledOrder(orderId, tx, req.user?.id || null)
      }
      await new sql.Request(tx)
        .input('orderId', sql.UniqueIdentifier, orderId)
        .query(`
          UPDATE dbo.OrderItems
          SET KitchenStatus = CASE WHEN KitchenStatus IS NOT NULL THEN N'listo' ELSE KitchenStatus END
          WHERE OrderId=@orderId
        `)
    }

    const derived = (await deriveOrderStatusFromItems(orderId, tx)) || status
    let finalStatus = status
    if (status === 'listo' || status === 'en_cocina') {
      finalStatus = derived
    }

    await new sql.Request(tx)
      .input('id', sql.UniqueIdentifier, orderId)
      .input('status', sql.NVarChar, finalStatus)
      .query(`UPDATE dbo.Orders SET Status = @status, UpdatedAt = SYSUTCDATETIME() WHERE Id = @id`)

    if (existing.TableId) {
      if (finalStatus === 'listo') {
        await new sql.Request(tx)
          .input('tableId', sql.UniqueIdentifier, existing.TableId)
          .query(`UPDATE dbo.Tables SET Status = N'cuenta' WHERE Id = @tableId`)
      } else if (finalStatus === 'entregado' || finalStatus === 'cancelado') {
        await new sql.Request(tx)
          .input('tableId', sql.UniqueIdentifier, existing.TableId)
          .query(`UPDATE dbo.Tables SET Status = N'libre', CurrentOrderId = NULL WHERE Id = @tableId`)
      }
    }

    await tx.commit()
  } catch (e) {
    await tx.rollback()
    return res.status(500).json({ error: (e as Error).message })
  }

  const order = await loadOrder(orderId)
  const final = String((order as { Status?: string })?.Status || status)
  emitEvent('order:status', order, roomsForOrderStatus(final))
  if (status === 'en_cocina' || status === 'cancelado') {
    void publishInventorySnapshot()
  }

  if (order && (order as { CustomerPhone?: string }).CustomerPhone) {
    void notifyOrderStatusServer(
      {
        Id: orderId,
        Number: (order as { Number: number }).Number,
        Type: (order as { Type: string }).Type,
        Status: final,
        CustomerName: (order as { CustomerName: string }).CustomerName,
        CustomerPhone: (order as { CustomerPhone?: string }).CustomerPhone,
        Address: (order as { Address?: string }).Address,
        Total: (order as { Total: number }).Total,
        Source: (order as { Source?: string }).Source,
        items: ((order as { items?: Array<{ Name: string; Qty: number; Price: number }> }).items || []).map((i) => ({
          Name: i.Name,
          Qty: i.Qty,
          Price: i.Price,
        })),
      },
      final,
    ).catch((e) => console.warn('[whatsapp] status', (e as Error).message))
  }

  res.json({ order })
})

/**
 * Cocina: sacar insumos del almacén (antes o durante prep).
 * Body opcional: { itemIds?: string[] }
 */
ordersRouter.post('/:id/stock/sacar', authRequired, async (req, res) => {
  const orderId = paramId(req.params.id)
  const itemIds = Array.isArray(req.body?.itemIds)
    ? (req.body.itemIds as unknown[]).map(String).filter(Boolean)
    : undefined
  const pool = await getPool()
  const existing = await loadOrder(orderId)
  if (!existing) return res.status(404).json({ error: 'Pedido no encontrado' })

  const tx = new sql.Transaction(pool)
  await tx.begin()
  try {
    const result = await deductStockForOrderItems(orderId, tx, req.user?.id || null, {
      itemIds,
      // Solo ítems de cocina (no barra: eso va al pagar)
      kitchenStatuses: ['pendiente', 'en_cocina', 'listo'],
      reason: 'cocina',
      notesPrefix: 'Sacar',
    })
    await tx.commit()
    void publishInventorySnapshot()
    const order = await loadOrder(orderId)
    emitEvent('order:updated', order, roomsForOrderStatus(String(existing.Status || 'nuevo')))
    res.json({ order, ...result })
  } catch (e) {
    await tx.rollback()
    res.status(500).json({ error: (e as Error).message })
  }
})

/**
 * Cocina / caja: retorno a almacén de lo ya descontado.
 * Body opcional: { itemIds?: string[] }
 */
ordersRouter.post('/:id/stock/retorno', authRequired, async (req, res) => {
  const orderId = paramId(req.params.id)
  const itemIds = Array.isArray(req.body?.itemIds)
    ? (req.body.itemIds as unknown[]).map(String).filter(Boolean)
    : undefined
  const pool = await getPool()
  const existing = await loadOrder(orderId)
  if (!existing) return res.status(404).json({ error: 'Pedido no encontrado' })

  const tx = new sql.Transaction(pool)
  await tx.begin()
  try {
    const result = await restoreStockForOrderItems(orderId, tx, req.user?.id || null, {
      itemIds,
      reason: 'retorno',
      notesPrefix: 'Retorno',
    })
    await tx.commit()
    void publishInventorySnapshot()
    const order = await loadOrder(orderId)
    emitEvent('order:updated', order, roomsForOrderStatus(String(existing.Status || 'nuevo')))
    res.json({ order, ...result })
  } catch (e) {
    await tx.rollback()
    res.status(500).json({ error: (e as Error).message })
  }
})

/** Agregar ítems a pedido abierto (mesa) */
ordersRouter.post('/:id/items', authRequired, async (req, res) => {
  const orderId = paramId(req.params.id)
  const items = req.body?.items as Array<{
    productId?: string
    name: string
    qty: number
    price: number
    notes?: string
    options?: Array<{ groupId?: string; optionId?: string; name: string; price: number }>
  }>
  const totals = req.body?.totals as { subtotal: number; igv: number; total: number; discount?: number } | undefined

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items[] requerido' })
  }

  const pool = await getPool()
  const existing = await loadOrder(orderId)
  if (!existing) return res.status(404).json({ error: 'Pedido no encontrado' })
  if (existing.Paid) return res.status(400).json({ error: 'Pedido ya pagado' })

  const tx = new sql.Transaction(pool)
  await tx.begin()
  try {
    const needsKitchenBump = await productsNeedKitchen(items.map((i) => i.productId))
    const maxSort = await new sql.Request(tx)
      .input('orderId', sql.UniqueIdentifier, orderId)
      .query(`SELECT ISNULL(MAX(SortOrder), -1) AS m FROM dbo.OrderItems WHERE OrderId=@orderId`)
    let sort = Number(maxSort.recordset[0].m) + 1

    for (const item of items) {
      const itemId = uuid()
      const kStatus = (await kitchenStatusForProduct(item.productId)) ? 'pendiente' : null
      await new sql.Request(tx)
        .input('id', sql.UniqueIdentifier, itemId)
        .input('orderId', sql.UniqueIdentifier, orderId)
        .input('productId', sql.UniqueIdentifier, item.productId || null)
        .input('name', sql.NVarChar, item.name)
        .input('qty', sql.Int, item.qty)
        .input('price', sql.Decimal(10, 2), item.price)
        .input('notes', sql.NVarChar, item.notes || null)
        .input('sort', sql.Int, sort++)
        .input('kitchenStatus', sql.NVarChar, kStatus)
        .query(`
          INSERT INTO dbo.OrderItems (Id, OrderId, ProductId, Name, Qty, Price, Notes, SortOrder, KitchenStatus)
          VALUES (@id, @orderId, @productId, @name, @qty, @price, @notes, @sort, @kitchenStatus)
        `)

      for (const opt of item.options || []) {
        await new sql.Request(tx)
          .input('id', sql.UniqueIdentifier, uuid())
          .input('itemId', sql.UniqueIdentifier, itemId)
          .input('groupId', sql.UniqueIdentifier, opt.groupId || null)
          .input('optionId', sql.UniqueIdentifier, opt.optionId || null)
          .input('name', sql.NVarChar, opt.name)
          .input('price', sql.Decimal(10, 2), opt.price)
          .query(`
            INSERT INTO dbo.OrderItemOptions (Id, OrderItemId, GroupId, OptionId, Name, Price)
            VALUES (@id, @itemId, @groupId, @optionId, @name, @price)
          `)
      }
    }

    if (totals) {
      await new sql.Request(tx)
        .input('id', sql.UniqueIdentifier, orderId)
        .input('discount', sql.Decimal(10, 2), totals.discount ?? existing.Discount)
        .input('subtotal', sql.Decimal(10, 2), totals.subtotal)
        .input('igv', sql.Decimal(10, 2), totals.igv)
        .input('total', sql.Decimal(10, 2), totals.total)
        .query(`
          UPDATE dbo.Orders
          SET Discount=@discount, Subtotal=@subtotal, Igv=@igv, Total=@total,
              UpdatedAt=SYSUTCDATETIME()
          WHERE Id=@id
        `)
    } else {
      await new sql.Request(tx)
        .input('id', sql.UniqueIdentifier, orderId)
        .query(`UPDATE dbo.Orders SET UpdatedAt=SYSUTCDATETIME() WHERE Id=@id`)
    }

    // Adicionales de prep: NO reinician toda la comanda.
    // Si ya estaba en fuego/listo, se mantiene; solo hay ítems "pendiente" nuevos.
    // Si estaba listo y llegan platos nuevos → vuelve a "nuevo" solo a nivel cabecera
    // cuando NO quede nada en fuego (derive).
    if (needsKitchenBump) {
      const derived = await deriveOrderStatusFromItems(orderId, tx)
      const prev = String(existing.Status || '')
      let nextStatus = prev
      if (prev === 'listo' || prev === 'entregado') {
        nextStatus = derived || 'nuevo'
      } else if (prev === 'nuevo' || prev === 'en_cocina') {
        // Mantener en_cocina si ya cocinaban; si era nuevo se queda nuevo
        nextStatus = prev === 'en_cocina' ? 'en_cocina' : derived || prev
      }
      if (nextStatus && nextStatus !== prev) {
        await new sql.Request(tx)
          .input('id', sql.UniqueIdentifier, orderId)
          .input('status', sql.NVarChar, nextStatus)
          .query(`UPDATE dbo.Orders SET Status=@status, UpdatedAt=SYSUTCDATETIME() WHERE Id=@id`)
      }
    }

    await tx.commit()
    const order = await loadOrder(orderId)
    emitEvent('order:updated', order, ['ops', 'caja', 'mesas', 'cocina'])
    if (needsKitchenBump) {
      emitEvent('kitchen:new', order, ['cocina'])
      emitEvent('order:status', order, roomsForOrderStatus(String((order as { Status?: string })?.Status || 'nuevo')))
    }
    res.json({ order })
  } catch (e) {
    await tx.rollback()
    res.status(500).json({ error: (e as Error).message })
  }
})

type PayMethod = 'efectivo' | 'yape' | 'plin' | 'tarjeta'

/** Cobro de mesa — soporta pago múltiple */
ordersRouter.post('/:id/payments', authRequired, async (req, res) => {
  const payments = req.body?.payments as Array<{
    method: PayMethod
    amount: number
    cashTendered?: number
    reference?: string
  }>

  if (!Array.isArray(payments) || payments.length === 0) {
    return res.status(400).json({ error: 'payments[] requerido' })
  }

  for (const p of payments) {
    if (!['efectivo', 'yape', 'plin', 'tarjeta'].includes(p.method)) {
      return res.status(400).json({ error: `Método inválido: ${p.method}` })
    }
    if (!(p.amount > 0)) return res.status(400).json({ error: 'Monto inválido' })
    if (p.method === 'efectivo' && p.cashTendered != null && p.cashTendered < p.amount) {
      return res.status(400).json({ error: 'Efectivo recibido menor al monto' })
    }
  }

  const pool = await getPool()
  const existing = await loadOrder(paramId(req.params.id))
  if (!existing) return res.status(404).json({ error: 'Pedido no encontrado' })

  const already = (existing.payments as Array<{ Amount: number }>).reduce((s, x) => s + Number(x.Amount), 0)
  const incoming = payments.reduce((s, p) => s + Number(p.amount), 0)
  const totalPaid = already + incoming
  const orderTotal = Number(existing.Total)

  if (totalPaid > orderTotal + 0.01) {
    return res.status(400).json({ error: 'La suma de pagos supera el total' })
  }

  const tx = new sql.Transaction(pool)
  await tx.begin()
  try {
    for (const p of payments) {
      const change =
        p.method === 'efectivo' && p.cashTendered != null
          ? Math.max(0, Number(p.cashTendered) - Number(p.amount))
          : null
      await new sql.Request(tx)
        .input('id', sql.UniqueIdentifier, uuid())
        .input('orderId', sql.UniqueIdentifier, paramId(req.params.id))
        .input('method', sql.NVarChar, p.method)
        .input('amount', sql.Decimal(10, 2), p.amount)
        .input('cashTendered', sql.Decimal(10, 2), p.cashTendered ?? null)
        .input('cashChange', sql.Decimal(10, 2), change)
        .input('reference', sql.NVarChar, p.reference || null)
        .input('userId', sql.UniqueIdentifier, req.user?.id || null)
        .query(`
          INSERT INTO dbo.OrderPayments (Id, OrderId, Method, Amount, CashTendered, CashChange, Reference, CreatedByUserId)
          VALUES (@id, @orderId, @method, @amount, @cashTendered, @cashChange, @reference, @userId)
        `)
    }

    const paid = totalPaid >= orderTotal - 0.01
    await new sql.Request(tx)
      .input('id', sql.UniqueIdentifier, paramId(req.params.id))
      .input('paid', sql.Bit, paid)
      .query(`UPDATE dbo.Orders SET Paid = @paid, UpdatedAt = SYSUTCDATETIME() WHERE Id = @id`)

    // Barra / gaseosa / sin cocina: descuenta stock solo al liquidar el cobro
    if (paid && !existing.Paid) {
      await deductStockForSaleItems(paramId(req.params.id), tx, req.user?.id || null)
    }

    if (paid && existing.TableId) {
      await new sql.Request(tx)
        .input('tableId', sql.UniqueIdentifier, existing.TableId)
        .query(`UPDATE dbo.Tables SET Status = N'libre', CurrentOrderId = NULL WHERE Id = @tableId`)
    }

    await tx.commit()
    const order = await loadOrder(paramId(req.params.id))
    emitEvent('order:paid', order, ['ops', 'caja', 'mesas'])
    if (paid && !existing.Paid) {
      void publishInventorySnapshot()
    }
    res.json({ order, paid })
  } catch (e) {
    await tx.rollback()
    res.status(500).json({ error: (e as Error).message })
  }
})

/**
 * Caja: Liquidar pedido web entregado (ya pagado online).
 * El repartidor ya entregó, caja confirma la liquidación.
 */
ordersRouter.post('/:id/settle-cashier', authRequired, async (req, res) => {
  const orderId = paramId(req.params.id)
  const pool = await getPool()
  const existing = await loadOrder(orderId)
  if (!existing) return res.status(404).json({ error: 'Pedido no encontrado' })

  if (existing.Status !== 'entregado') {
    return res.status(400).json({ error: 'Solo pedidos entregados se pueden liquidar' })
  }
  if (!existing.Paid) {
    return res.status(400).json({ error: 'Este pedido no está pagado. Usa cobrar normal.' })
  }

  try {
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, orderId)
      .query(`
        UPDATE dbo.Orders
        SET DriverSettledAt = SYSUTCDATETIME(), UpdatedAt = SYSUTCDATETIME()
        WHERE Id = @id
      `)

    const order = await loadOrder(orderId)
    emitEvent('order:updated', order, ['ops', 'caja'])
    res.json({ order, settled: true })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})
