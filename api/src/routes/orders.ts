import { Router } from 'express'
import { v4 as uuid } from 'uuid'
import { getPool, sql } from '../db.js'
import { authRequired } from '../auth.js'
import { emitEvent } from '../realtime.js'

export const ordersRouter = Router()

function paramId(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value
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
    tableId?: string
    tableNumber?: number
    notes?: string
    discount?: number
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

  if (body.source === 'web' || body.type === 'delivery') {
    if (!body.codPaymentMethod) {
      return res.status(400).json({ error: 'Indica pago contra entrega: yape | plin | efectivo' })
    }
    if (body.codPaymentMethod === 'efectivo' && !(body.codCashAmount && body.codCashAmount > 0)) {
      return res.status(400).json({ error: 'Indica con cuánto paga en efectivo' })
    }
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
      .input('discount', sql.Decimal(10, 2), body.discount ?? 0)
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
          CodPaymentMethod, CodCashAmount, Discount, Subtotal, Igv, Total, Paid, Notes, Source, CreatedByUserId
        ) VALUES (
          @id, @number, @type, @status, @tableId, @tableNumber, @customerId, @customerName, @customerPhone,
          @address, @addressLat, @addressLng, @deliveryDistanceKm, @deliveryTimeMin, @deliveryFee,
          @codPaymentMethod, @codCashAmount, @discount, @subtotal, @igv, @total, 0, @notes, @source, @createdBy
        )
      `)

    let sort = 0
    for (const item of body.items) {
      const itemId = uuid()
      await new sql.Request(tx)
        .input('id', sql.UniqueIdentifier, itemId)
        .input('orderId', sql.UniqueIdentifier, orderId)
        .input('productId', sql.UniqueIdentifier, item.productId || null)
        .input('name', sql.NVarChar, item.name)
        .input('qty', sql.Int, item.qty)
        .input('price', sql.Decimal(10, 2), item.price)
        .input('notes', sql.NVarChar, item.notes || null)
        .input('sort', sql.Int, sort++)
        .query(`
          INSERT INTO dbo.OrderItems (Id, OrderId, ProductId, Name, Qty, Price, Notes, SortOrder)
          VALUES (@id, @orderId, @productId, @name, @qty, @price, @notes, @sort)
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

    await tx.commit()

    const order = await loadOrder(orderId)
    emitEvent('order:created', order, ['ops', 'cocina', 'caja'])
    emitEvent('kitchen:new', order, ['cocina'])

    // WhatsApp: flag para worker / endpoint de notificación
    res.status(201).json({ order, whatsappPending: true })
  } catch (e) {
    await tx.rollback()
    res.status(500).json({ error: (e as Error).message })
  }
})

ordersRouter.patch('/:id/status', authRequired, async (req, res) => {
  const { status } = req.body as { status?: string }
  const allowed = ['nuevo', 'en_cocina', 'listo', 'entregado', 'cancelado']
  if (!status || !allowed.includes(status)) {
    return res.status(400).json({ error: 'status inválido' })
  }

  const pool = await getPool()
  const orderId = paramId(req.params.id)
  const existing = await loadOrder(orderId)
  if (!existing) return res.status(404).json({ error: 'Pedido no encontrado' })

  await pool
    .request()
    .input('id', sql.UniqueIdentifier, orderId)
    .input('status', sql.NVarChar, status)
    .query(`UPDATE dbo.Orders SET Status = @status, UpdatedAt = SYSUTCDATETIME() WHERE Id = @id`)

  if (existing.TableId) {
    if (status === 'listo') {
      await pool
        .request()
        .input('tableId', sql.UniqueIdentifier, existing.TableId)
        .query(`UPDATE dbo.Tables SET Status = N'cuenta' WHERE Id = @tableId`)
    } else if (status === 'entregado' || status === 'cancelado') {
      await pool
        .request()
        .input('tableId', sql.UniqueIdentifier, existing.TableId)
        .query(`UPDATE dbo.Tables SET Status = N'libre', CurrentOrderId = NULL WHERE Id = @tableId`)
    }
  }

  const order = await loadOrder(orderId)
  emitEvent('order:status', order, ['ops', 'cocina', 'caja', 'mesas'])
  res.json({ order })
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
    const maxSort = await new sql.Request(tx)
      .input('orderId', sql.UniqueIdentifier, orderId)
      .query(`SELECT ISNULL(MAX(SortOrder), -1) AS m FROM dbo.OrderItems WHERE OrderId=@orderId`)
    let sort = Number(maxSort.recordset[0].m) + 1

    for (const item of items) {
      const itemId = uuid()
      await new sql.Request(tx)
        .input('id', sql.UniqueIdentifier, itemId)
        .input('orderId', sql.UniqueIdentifier, orderId)
        .input('productId', sql.UniqueIdentifier, item.productId || null)
        .input('name', sql.NVarChar, item.name)
        .input('qty', sql.Int, item.qty)
        .input('price', sql.Decimal(10, 2), item.price)
        .input('notes', sql.NVarChar, item.notes || null)
        .input('sort', sql.Int, sort++)
        .query(`
          INSERT INTO dbo.OrderItems (Id, OrderId, ProductId, Name, Qty, Price, Notes, SortOrder)
          VALUES (@id, @orderId, @productId, @name, @qty, @price, @notes, @sort)
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
          SET Discount=@discount, Subtotal=@subtotal, Igv=@igv, Total=@total, UpdatedAt=SYSUTCDATETIME()
          WHERE Id=@id
        `)
    } else {
      await new sql.Request(tx)
        .input('id', sql.UniqueIdentifier, orderId)
        .query(`UPDATE dbo.Orders SET UpdatedAt=SYSUTCDATETIME() WHERE Id=@id`)
    }

    await tx.commit()
    const order = await loadOrder(orderId)
    emitEvent('order:updated', order, ['ops', 'cocina', 'caja', 'mesas'])
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

    if (paid && existing.TableId) {
      await new sql.Request(tx)
        .input('tableId', sql.UniqueIdentifier, existing.TableId)
        .query(`UPDATE dbo.Tables SET Status = N'libre', CurrentOrderId = NULL WHERE Id = @tableId`)
    }

    await tx.commit()
    const order = await loadOrder(paramId(req.params.id))
    emitEvent('order:paid', order, ['ops', 'caja', 'mesas'])
    res.json({ order, paid })
  } catch (e) {
    await tx.rollback()
    res.status(500).json({ error: (e as Error).message })
  }
})
