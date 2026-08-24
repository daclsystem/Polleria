import { Router } from 'express'
import { v4 as uuid } from 'uuid'
import { getPool, sql } from '../db.js'
import { authRequired } from '../auth.js'

export const catalogRouter = Router()

const SEED_PRODUCTS = [
  { name: 'Combo 1/4 clásico', description: '1/4 de pollo + papas + ensalada + cremas', category: 'Combos', price: 18.9, originalPrice: 22.9, emoji: '🍗', tone: '#E85D04', prepMinutes: 12 },
  { name: 'Combo 1/2 familiar', description: '1/2 pollo + papas grandes + ensalada + gaseosa 1.5L', category: 'Combos', price: 36.9, originalPrice: 42.9, emoji: '🍽️', tone: '#D00000', prepMinutes: 14 },
  { name: 'Combo entero Lopez', description: 'Pollo entero + papas familiares + ensalada', category: 'Combos', price: 62.9, originalPrice: 72.9, emoji: '🔥', tone: '#9B2226', prepMinutes: 16 },
  { name: 'Mostrito', description: '1/8 pollo + papas + arroz chaufa + huevo', category: 'Combos', price: 16.5, emoji: '🍛', tone: '#C9A227', prepMinutes: 10 },
  { name: '1/4 de pollo', description: 'Cuarto a la brasa', category: 'Pollos', price: 12.9, emoji: '🍗', tone: '#E85D04', prepMinutes: 8 },
  { name: '1/2 pollo', description: 'Medio pollo a las brasas', category: 'Pollos', price: 23.9, emoji: '🍖', tone: '#D00000', prepMinutes: 10 },
  { name: 'Pollo entero', description: 'Entero a la brasa', category: 'Pollos', price: 42.9, emoji: '🐓', tone: '#9B2226', prepMinutes: 12 },
  { name: 'Alitas BBQ x6', description: 'Alitas crocantes BBQ', category: 'Parrilla', price: 18, emoji: '🦴', tone: '#E85D04', prepMinutes: 12 },
  { name: 'Chaufa de pollo', description: 'Arroz chaufa clásico', category: 'Chifa', price: 14.5, emoji: '🥡', tone: '#BC6C25', prepMinutes: 12 },
  { name: 'Aeropuerto', description: 'Chaufa + tallarín + pollo', category: 'Chifa', price: 18, emoji: '✈️', tone: '#9B2226', prepMinutes: 14 },
  { name: 'Inca Kola 1.5L', description: 'Gaseosa', category: 'Bebidas', price: 8, emoji: '🥤', tone: '#F4A261', prepMinutes: 1 },
  { name: 'Chicha morada', description: 'Vaso', category: 'Bebidas', price: 4.5, emoji: '🟣', tone: '#6A4C93', prepMinutes: 1 },
]

async function ensureProducts() {
  const pool = await getPool()
  const count = await pool.request().query(`SELECT COUNT(*) AS c FROM dbo.Products`)
  if (Number(count.recordset[0].c) > 0) return

  for (const p of SEED_PRODUCTS) {
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, uuid())
      .input('name', sql.NVarChar, p.name)
      .input('description', sql.NVarChar, p.description)
      .input('category', sql.NVarChar, p.category)
      .input('price', sql.Decimal(10, 2), p.price)
      .input('original', sql.Decimal(10, 2), p.originalPrice ?? null)
      .input('emoji', sql.NVarChar, p.emoji)
      .input('tone', sql.NVarChar, p.tone)
      .input('prep', sql.Int, p.prepMinutes)
      .query(`
        INSERT INTO dbo.Products (Id, Name, Description, Category, Price, OriginalPrice, Emoji, Tone, Available, PrepMinutes)
        VALUES (@id, @name, @description, @category, @price, @original, @emoji, @tone, 1, @prep)
      `)
  }
}

function mapProduct(r: Record<string, unknown>) {
  return {
    id: String(r.Id),
    name: r.Name,
    description: r.Description || '',
    category: r.Category,
    price: Number(r.Price),
    originalPrice: r.OriginalPrice != null ? Number(r.OriginalPrice) : undefined,
    emoji: r.Emoji || '🍗',
    tone: r.Tone || '#E85D04',
    imageUrl: r.ImageUrl || undefined,
    available: Boolean(r.Available),
    prepMinutes: Number(r.PrepMinutes || 10),
  }
}

function mapTable(r: Record<string, unknown>) {
  return {
    id: String(r.Id),
    number: Number(r.Number),
    seats: Number(r.Seats),
    zone: r.Zone,
    status: r.Status,
    orderId: r.CurrentOrderId ? String(r.CurrentOrderId) : undefined,
  }
}

function mapOrder(r: Record<string, unknown>, items: unknown[] = []) {
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
    discount: Number(r.Discount || 0),
    subtotal: Number(r.Subtotal),
    igv: Number(r.Igv),
    total: Number(r.Total),
    paymentMethod: r.Paid ? 'efectivo' : 'pendiente',
    paid: Boolean(r.Paid),
    createdAt: new Date(r.CreatedAt as string).toISOString(),
    updatedAt: new Date(r.UpdatedAt as string).toISOString(),
    createdBy: r.CreatedByUserId ? String(r.CreatedByUserId) : 'api',
    notes: r.Notes || undefined,
    source: r.Source,
  }
}

/** Estado completo para el POS — reemplaza el seed local */
catalogRouter.get('/bootstrap', authRequired, async (_req, res) => {
  try {
    await ensureProducts()
    const pool = await getPool()

    const [users, products, tables, inventory, settings, orders, customers, reservations, branches, ranges] =
      await Promise.all([
        pool.request().query(`SELECT Id, Name, Email, Role, Active, Pin, Phone FROM dbo.Users ORDER BY Name`),
        pool.request().query(`SELECT * FROM dbo.Products ORDER BY Category, Name`),
        pool.request().query(`SELECT * FROM dbo.Tables ORDER BY Number`),
        pool.request().query(`SELECT * FROM dbo.Inventory ORDER BY Name`),
        pool.request().query(`SELECT TOP 1 * FROM dbo.Settings WHERE Id = 1`),
        pool.request().query(`SELECT TOP 100 * FROM dbo.Orders ORDER BY CreatedAt DESC`),
        pool.request().query(`SELECT Id, Name, Phone, Email, Address, CreatedAt FROM dbo.Customers ORDER BY CreatedAt DESC`),
        pool.request().query(`SELECT TOP 50 * FROM dbo.Reservations ORDER BY [Date] DESC, [Time] DESC`),
        pool.request().query(`SELECT * FROM dbo.Branches ORDER BY Name`),
        pool.request().query(`SELECT * FROM dbo.DeliveryRanges ORDER BY SortOrder`),
      ])

    const orderIds = orders.recordset.map((o: { Id: string }) => o.Id)
    let itemsByOrder = new Map<string, unknown[]>()
    if (orderIds.length) {
      const items = await pool.request().query(`
        SELECT * FROM dbo.OrderItems
        WHERE OrderId IN (${orderIds.map((_, i) => `'${orderIds[i]}'`).join(',')})
        ORDER BY SortOrder
      `)
      for (const it of items.recordset) {
        const oid = String(it.OrderId)
        const list = itemsByOrder.get(oid) || []
        list.push({
          productId: it.ProductId ? String(it.ProductId) : 'x',
          name: it.Name,
          qty: Number(it.Qty),
          price: Number(it.Price),
          notes: it.Notes || undefined,
        })
        itemsByOrder.set(oid, list)
      }
    }

    const s = settings.recordset[0] || {}
    res.json({
      users: users.recordset.map((u: Record<string, unknown>) => ({
        id: String(u.Id),
        name: u.Name,
        email: u.Email,
        password: '',
        role: u.Role,
        active: Boolean(u.Active),
        pin: u.Pin || '0000',
        phone: u.Phone || undefined,
      })),
      products: products.recordset.map(mapProduct),
      tables: tables.recordset.map(mapTable),
      inventory: inventory.recordset.map((r: Record<string, unknown>) => ({
        id: String(r.Id),
        name: r.Name,
        unit: r.Unit,
        stock: Number(r.Stock),
        minStock: Number(r.MinStock),
        cost: Number(r.Cost),
      })),
      settings: {
        name: s.Name || 'Chifa-Pollería Lopez',
        slogan: s.Slogan || '',
        address: s.Address || '',
        phone: s.Phone || '',
        ruc: s.Ruc || '',
        igvRate: Number(s.IgvRate ?? 0.18),
        hours: s.Hours || '',
        deliveryFee: 5,
      },
      orders: orders.recordset.map((o: Record<string, unknown>) =>
        mapOrder(o, itemsByOrder.get(String(o.Id)) || []),
      ),
      customers: customers.recordset.map((c: Record<string, unknown>) => ({
        id: String(c.Id),
        name: c.Name,
        phone: c.Phone,
        email: c.Email || undefined,
        password: '',
        address: c.Address || undefined,
        createdAt: new Date(c.CreatedAt as string).toISOString(),
      })),
      reservations: reservations.recordset.map((r: Record<string, unknown>) => ({
        id: String(r.Id),
        customerName: r.CustomerName,
        customerPhone: r.CustomerPhone,
        customerId: r.CustomerId ? String(r.CustomerId) : undefined,
        date: String(r.Date).slice(0, 10),
        time: String(r.Time).slice(0, 5),
        guests: Number(r.Guests),
        notes: r.Notes || undefined,
        status: r.Status,
        createdAt: new Date(r.CreatedAt as string).toISOString(),
      })),
      branches: branches.recordset.map((b: Record<string, unknown>) => ({
        id: String(b.Id),
        name: b.Name,
        address: b.Address,
        phone: b.Phone,
        active: Boolean(b.Active),
      })),
      deliveryRanges: ranges.recordset,
      nextOrderNumber: Number(s.NextOrderNumber || 1001),
      source: 'api',
    })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

catalogRouter.get('/products', async (_req, res) => {
  try {
    await ensureProducts()
    const pool = await getPool()
    const r = await pool.request().query(`SELECT * FROM dbo.Products WHERE Available = 1 ORDER BY Category, Name`)
    res.json({ products: r.recordset.map(mapProduct) })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

catalogRouter.get('/tables', authRequired, async (_req, res) => {
  const pool = await getPool()
  const r = await pool.request().query(`SELECT * FROM dbo.Tables ORDER BY Number`)
  res.json({ tables: r.recordset.map(mapTable) })
})
