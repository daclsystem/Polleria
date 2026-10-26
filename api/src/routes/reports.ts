import { Router } from 'express'
import { authRequired, requireRoles } from '../auth.js'
import { getPool, sql } from '../db.js'
import { pickOrderMoney } from '../lib/money.js'

export const reportsRouter = Router()

const MAX_RANGE_MS = 400 * 24 * 60 * 60 * 1000
const GUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

function num(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function payMethod(paid: boolean, raw: unknown) {
  if (!paid) return 'pendiente'
  const m = String(raw || '').toLowerCase()
  if (m === 'yape' || m === 'plin') return 'yape'
  if (m === 'tarjeta') return 'tarjeta'
  if (m === 'efectivo') return 'efectivo'
  return 'efectivo'
}

function mapOrder(r: Record<string, unknown>, items: unknown[]) {
  const userId = r.CreatedByUserId ? String(r.CreatedByUserId) : undefined
  const paid = Boolean(r.Paid)
  const itemRows = items as Array<{ qty?: unknown; price?: unknown }>
  const money = pickOrderMoney(r, itemRows)
  return {
    id: String(r.Id),
    number: Number(r.Number),
    type: r.Type,
    status: r.Status,
    tableId: r.TableId ? String(r.TableId) : undefined,
    tableNumber: r.TableNumber != null ? Number(r.TableNumber) : undefined,
    customerName: r.CustomerName,
    customerPhone: r.CustomerPhone || undefined,
    customerId: r.CustomerId ? String(r.CustomerId) : undefined,
    address: r.Address || undefined,
    items,
    discount: money.discount,
    subtotal: money.subtotal,
    igv: money.igv,
    total: money.total,
    paymentMethod: payMethod(paid, r.PayMethod),
    paid,
    codPaymentMethod: r.CodPaymentMethod ? String(r.CodPaymentMethod) : undefined,
    createdAt: new Date(r.CreatedAt as string).toISOString(),
    updatedAt: new Date(r.UpdatedAt as string).toISOString(),
    createdBy: r.CreatedByName ? String(r.CreatedByName) : userId || 'api',
    createdByUserId: userId,
    notes: r.Notes || undefined,
    source: r.Source,
    driverId: r.DriverId ? String(r.DriverId) : undefined,
    driverName: r.DriverName ? String(r.DriverName) : undefined,
  }
}

/** Pedidos del rango, tal como están en la base (estado, cobro, ítems). Sin el tope del inicio. */
reportsRouter.get('/orders', authRequired, requireRoles('admin', 'cajero'), async (req, res) => {
  try {
    const from = new Date(String(req.query.from || ''))
    const to = new Date(String(req.query.to || ''))
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
      return res.status(400).json({ error: 'Rango de fechas inválido' })
    }
    if (to.getTime() - from.getTime() > MAX_RANGE_MS) {
      return res.status(400).json({ error: 'El rango máximo es 400 días' })
    }

    const pool = await getPool()
    const orders = await pool
      .request()
      .input('from', sql.DateTime2, from)
      .input('to', sql.DateTime2, to)
      .query(`
        SELECT o.*, u.Name AS CreatedByName, d.Name AS DriverName, pay.Method AS PayMethod
        FROM dbo.Orders o
        LEFT JOIN dbo.Users u ON u.Id = o.CreatedByUserId
        LEFT JOIN dbo.Drivers d ON d.Id = o.DriverId
        OUTER APPLY (
          SELECT TOP 1 p.Method
          FROM dbo.OrderPayments p
          WHERE p.OrderId = o.Id
          ORDER BY p.Amount DESC, p.CreatedAt DESC
        ) pay
        WHERE o.CreatedAt >= @from AND o.CreatedAt < @to
        ORDER BY o.CreatedAt ASC
      `)

    const ids = orders.recordset
      .map((o: { Id: unknown }) => String(o.Id))
      .filter((id: string) => GUID.test(id))

    const itemsByOrder = new Map<string, unknown[]>()
    for (let i = 0; i < ids.length; i += 400) {
      const chunk = ids.slice(i, i + 400)
      const list = chunk.map((id) => `'${id}'`).join(',')
      const items = await pool.request().query(`
        SELECT * FROM dbo.OrderItems
        WHERE OrderId IN (${list})
        ORDER BY SortOrder
      `)
      for (const it of items.recordset) {
        const oid = String(it.OrderId)
        const row = itemsByOrder.get(oid) || []
        row.push({
          id: String(it.Id),
          productId: it.ProductId ? String(it.ProductId) : 'x',
          name: it.Name,
          qty: num(it.Qty),
          price: num(it.Price),
          notes: it.Notes || undefined,
          kitchenStatus: it.KitchenStatus ? String(it.KitchenStatus) : undefined,
        })
        itemsByOrder.set(oid, row)
      }
    }

    res.json({
      orders: orders.recordset.map((o: Record<string, unknown>) =>
        mapOrder(o, itemsByOrder.get(String(o.Id)) || []),
      ),
    })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})
