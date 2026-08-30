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
      .input('kitchen', sql.Bit, !/bebida|gaseosa/i.test(p.category))
      .query(`
        INSERT INTO dbo.Products (Id, Name, Description, Category, Price, OriginalPrice, Emoji, Tone, Available, PrepMinutes, SendToKitchen)
        VALUES (@id, @name, @description, @category, @price, @original, @emoji, @tone, 1, @prep, @kitchen)
      `)
  }
}

function mapProduct(r: Record<string, unknown>) {
  const category = String(r.Category || '')
  const sendRaw = r.SendToKitchen
  const sendToKitchen =
    sendRaw == null
      ? !/bebida|gaseosa/i.test(category)
      : Boolean(sendRaw)
  return {
    id: String(r.Id),
    name: r.Name,
    description: r.Description || '',
    category,
    price: Number(r.Price),
    originalPrice: r.OriginalPrice != null ? Number(r.OriginalPrice) : undefined,
    emoji: r.Emoji || '🍗',
    tone: r.Tone || '#E85D04',
    imageUrl: r.ImageUrl || undefined,
    available: Boolean(r.Available),
    prepMinutes: Number(r.PrepMinutes || 10),
    sendToKitchen,
    tags: [] as string[],
    optionGroups: [] as Array<{
      id: string
      title: string
      required: boolean
      maxSelect: number
      options: Array<{ id: string; name: string; price: number }>
    }>,
    soldCount: 0,
    ratingAvg: 0,
    reviewCount: 0,
  }
}

const DEFAULT_GROUPS: Record<
  string,
  { title: string; required: boolean; maxSelect: number; options: Array<{ name: string; price: number }> }
> = {
  presa: {
    title: 'Elige tu presa',
    required: true,
    maxSelect: 1,
    options: [
      { name: 'Pecho', price: 0 },
      { name: 'Pierna', price: 0 },
    ],
  },
  papas: {
    title: 'Elige tus papas',
    required: true,
    maxSelect: 1,
    options: [
      { name: 'Papas regulares', price: 0 },
      { name: 'Papas familiares (+S/4)', price: 4 },
      { name: 'Sin papas', price: 0 },
    ],
  },
  cremas: {
    title: 'Elige tus cremas',
    required: false,
    maxSelect: 3,
    options: [
      { name: 'Mayonesa', price: 0 },
      { name: 'Ketchup', price: 0 },
      { name: 'Ají', price: 0 },
      { name: 'Mostaza', price: 0 },
      { name: 'Huancaína', price: 1 },
      { name: 'Rocoto', price: 1 },
      { name: 'Mayonesa al ajo', price: 1 },
      { name: 'Salsa BBQ', price: 1.5 },
    ],
  },
  adicionales: {
    title: 'Adicionales',
    required: false,
    maxSelect: 5,
    options: [
      { name: 'Papas extra', price: 5 },
      { name: 'Arroz chaufa extra', price: 7 },
      { name: 'Ensalada extra', price: 4 },
      { name: 'Huevo frito', price: 2.5 },
      { name: 'Porción de pollo extra', price: 8 },
      { name: 'Choclo con queso', price: 4 },
    ],
  },
  bebida: {
    title: 'Agrega una bebida',
    required: false,
    maxSelect: 1,
    options: [
      { name: 'Inca Kola personal', price: 3.5 },
      { name: 'Coca-Cola personal', price: 3.5 },
      { name: 'Inca Kola 1.5L', price: 8 },
      { name: 'Chicha morada', price: 4.5 },
      { name: 'Limonada', price: 5 },
    ],
  },
}

const NAME_TAGS: Record<string, string[]> = {
  'Combo 1/4 clásico': ['Oferta', 'Popular'],
  'Combo 1/2 familiar': ['Oferta'],
  'Combo entero Lopez': ['Oferta', 'Top'],
  Mostrito: ['Económico'],
  'Pollo entero': ['Popular'],
  'Alitas BBQ x6': ['Popular'],
  Aeropuerto: ['Oferta', 'Popular'],
  'Chaufa de pollo': ['Popular'],
}

function groupKeysForCategory(category: string, name: string): string[] {
  if (/bebida/i.test(category)) return []
  const isPollo =
    /pollo|pollos|combo|mostrito|brasa|alitas/i.test(category) ||
    /pollo|combo|mostrito|1\/4|1\/2|entero|alitas/i.test(name)
  if (isPollo) {
    // Multinivel completo: presa → papas → cremas → adicionales → bebida
    return ['presa', 'papas', 'cremas', 'adicionales', 'bebida']
  }
  if (/chifa|parrilla|guarnici/i.test(category)) return ['cremas', 'adicionales', 'bebida']
  return ['cremas', 'adicionales']
}

/** Rellena tags y grupos de opciones si la carta aún no los tiene en DB. */
async function ensureProductExtras() {
  const pool = await getPool()
  const products = await pool.request().query(`SELECT Id, Name, Category FROM dbo.Products`)
  for (const row of products.recordset as Array<{ Id: string; Name: string; Category: string }>) {
    const pid = String(row.Id)
    const name = String(row.Name)
    const category = String(row.Category || '')

    const tagCount = await pool
      .request()
      .input('pid', sql.UniqueIdentifier, pid)
      .query(`SELECT COUNT(*) AS c FROM dbo.ProductTags WHERE ProductId = @pid`)
    if (Number(tagCount.recordset[0].c) === 0) {
      const tags = NAME_TAGS[name] || []
      if (/combo/i.test(category) && !tags.includes('Oferta')) tags.push('Popular')
      for (const tag of tags) {
        await pool
          .request()
          .input('pid', sql.UniqueIdentifier, pid)
          .input('tag', sql.NVarChar, tag)
          .query(`INSERT INTO dbo.ProductTags (ProductId, Tag) VALUES (@pid, @tag)`)
      }
    }

    // Asegura grupos multinivel faltantes (ej. presa) aunque ya existan otros
    const existingTitlesR = await pool
      .request()
      .input('pid', sql.UniqueIdentifier, pid)
      .query(`SELECT Title, SortOrder FROM dbo.ProductOptionGroups WHERE ProductId = @pid`)
    const existingTitles = new Set(
      (existingTitlesR.recordset as Array<{ Title: string }>).map((r) =>
        String(r.Title || '').toLowerCase(),
      ),
    )
    let sort =
      Math.max(
        0,
        ...(existingTitlesR.recordset as Array<{ SortOrder: number }>).map((r) =>
          Number(r.SortOrder || 0),
        ),
        -1,
      ) + 1

    for (const key of groupKeysForCategory(category, name)) {
      const def = DEFAULT_GROUPS[key]
      if (!def) continue
      const already = [...existingTitles].some(
        (t) => t.includes(def.title.toLowerCase().slice(0, 12)) || t.includes(key),
      )
      // también match por palabras clave
      const keyword =
        key === 'presa'
          ? existingTitles.has('elige tu presa') || [...existingTitles].some((t) => t.includes('presa'))
          : key === 'papas'
            ? [...existingTitles].some((t) => t.includes('papa'))
            : already
      if (keyword || already) continue

      const gid = uuid()
      await pool
        .request()
        .input('id', sql.UniqueIdentifier, gid)
        .input('pid', sql.UniqueIdentifier, pid)
        .input('title', sql.NVarChar, def.title)
        .input('req', sql.Bit, def.required ? 1 : 0)
        .input('max', sql.Int, def.maxSelect)
        .input('sort', sql.Int, key === 'presa' ? 0 : key === 'papas' ? 1 : sort++)
        .query(`
          INSERT INTO dbo.ProductOptionGroups (Id, ProductId, Title, Required, MaxSelect, SortOrder)
          VALUES (@id, @pid, @title, @req, @max, @sort)
        `)
      let osort = 0
      for (const opt of def.options) {
        await pool
          .request()
          .input('id', sql.UniqueIdentifier, uuid())
          .input('gid', sql.UniqueIdentifier, gid)
          .input('name', sql.NVarChar, opt.name)
          .input('price', sql.Decimal(10, 2), opt.price)
          .input('sort', sql.Int, osort++)
          .query(`
            INSERT INTO dbo.ProductOptions (Id, GroupId, Name, Price, SortOrder)
            VALUES (@id, @gid, @name, @price, @sort)
          `)
      }
      existingTitles.add(def.title.toLowerCase())
    }
  }
}

async function attachProductExtras<T extends ReturnType<typeof mapProduct>>(products: T[]) {
  if (!products.length) return products
  const pool = await getPool()
  const ids = products.map((p) => p.id)

  const tagsR = await pool.request().query(`
    SELECT ProductId, Tag FROM dbo.ProductTags
    WHERE ProductId IN (${ids.map((id) => `'${id}'`).join(',')})
  `)
  const tagsBy = new Map<string, string[]>()
  for (const t of tagsR.recordset as Array<{ ProductId: string; Tag: string }>) {
    const pid = String(t.ProductId)
    const list = tagsBy.get(pid) || []
    list.push(String(t.Tag))
    tagsBy.set(pid, list)
  }

  const groupsR = await pool.request().query(`
    SELECT Id, ProductId, Title, Required, MaxSelect, SortOrder
    FROM dbo.ProductOptionGroups
    WHERE ProductId IN (${ids.map((id) => `'${id}'`).join(',')})
    ORDER BY SortOrder
  `)
  const groupIds = (groupsR.recordset as Array<{ Id: string }>).map((g) => String(g.Id))
  const optsByGroup = new Map<string, Array<{ id: string; name: string; price: number }>>()
  if (groupIds.length) {
    const optsR = await pool.request().query(`
      SELECT Id, GroupId, Name, Price, SortOrder
      FROM dbo.ProductOptions
      WHERE GroupId IN (${groupIds.map((id) => `'${id}'`).join(',')})
      ORDER BY SortOrder
    `)
    for (const o of optsR.recordset as Array<{ Id: string; GroupId: string; Name: string; Price: number }>) {
      const gid = String(o.GroupId)
      const list = optsByGroup.get(gid) || []
      list.push({ id: String(o.Id), name: String(o.Name), price: Number(o.Price) })
      optsByGroup.set(gid, list)
    }
  }
  type OptionGroup = {
    id: string
    title: string
    required: boolean
    maxSelect: number
    options: Array<{ id: string; name: string; price: number }>
  }
  const groupsBy = new Map<string, OptionGroup[]>()
  for (const g of groupsR.recordset as Array<{
    Id: string
    ProductId: string
    Title: string
    Required: boolean
    MaxSelect: number
  }>) {
    const pid = String(g.ProductId)
    const list = groupsBy.get(pid) || []
    list.push({
      id: String(g.Id),
      title: String(g.Title),
      required: Boolean(g.Required),
      maxSelect: Number(g.MaxSelect),
      options: optsByGroup.get(String(g.Id)) || [],
    })
    groupsBy.set(pid, list)
  }

  let soldBy = new Map<string, number>()
  try {
    const soldR = await pool.request().query(`
      SELECT oi.ProductId, SUM(oi.Qty) AS Sold
      FROM dbo.OrderItems oi
      INNER JOIN dbo.Orders o ON o.Id = oi.OrderId
      WHERE oi.ProductId IS NOT NULL
        AND o.Status <> 'cancelado'
        AND o.CreatedAt >= DATEADD(day, -60, SYSUTCDATETIME())
      GROUP BY oi.ProductId
    `)
    soldBy = new Map(
      (soldR.recordset as Array<{ ProductId: string; Sold: number }>).map((r) => [
        String(r.ProductId),
        Number(r.Sold),
      ]),
    )
  } catch {
    /* tabla o datos aún no listos */
  }

  let ratingBy = new Map<string, { avg: number; count: number }>()
  try {
    await pool.request().query(`
      IF OBJECT_ID(N'dbo.ProductReviews', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.ProductReviews (
          Id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_ProductReviews PRIMARY KEY DEFAULT NEWID(),
          ProductId UNIQUEIDENTIFIER NOT NULL,
          CustomerId UNIQUEIDENTIFIER NULL,
          CustomerName NVARCHAR(120) NOT NULL,
          Stars TINYINT NOT NULL,
          Comment NVARCHAR(500) NULL,
          OrderId UNIQUEIDENTIFIER NULL,
          CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_ProductReviews_Created DEFAULT SYSUTCDATETIME()
        )
      END
    `)
    const ratingR = await pool.request().query(`
      SELECT ProductId, AVG(CAST(Stars AS FLOAT)) AS AvgStars, COUNT(*) AS Cnt
      FROM dbo.ProductReviews
      GROUP BY ProductId
    `)
    ratingBy = new Map(
      (ratingR.recordset as Array<{ ProductId: string; AvgStars: number; Cnt: number }>).map((r) => [
        String(r.ProductId),
        { avg: Math.round(Number(r.AvgStars) * 10) / 10, count: Number(r.Cnt) },
      ]),
    )
  } catch {
    /* reviews opcionales */
  }

  for (const p of products) {
    p.tags = tagsBy.get(p.id) || []
    p.optionGroups = groupsBy.get(p.id) || []
    p.soldCount = soldBy.get(p.id) || 0
    const rating = ratingBy.get(p.id)
    p.ratingAvg = rating?.avg || 0
    p.reviewCount = rating?.count || 0
  }
  return products
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
  const userId = r.CreatedByUserId ? String(r.CreatedByUserId) : undefined
  const byName = r.CreatedByName ? String(r.CreatedByName) : undefined
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
    codPaymentMethod: r.CodPaymentMethod ? String(r.CodPaymentMethod) : undefined,
    codCashAmount: r.CodCashAmount != null ? Number(r.CodCashAmount) : undefined,
    createdAt: new Date(r.CreatedAt as string).toISOString(),
    updatedAt: new Date(r.UpdatedAt as string).toISOString(),
    createdBy: byName || (userId ? userId : 'api'),
    createdByUserId: userId,
    notes: r.Notes || undefined,
    source: r.Source,
    driverId: r.DriverId ? String(r.DriverId) : undefined,
    driverLat: r.DriverLat != null ? Number(r.DriverLat) : undefined,
    driverLng: r.DriverLng != null ? Number(r.DriverLng) : undefined,
    addressLat: r.AddressLat != null ? Number(r.AddressLat) : undefined,
    addressLng: r.AddressLng != null ? Number(r.AddressLng) : undefined,
    driverArrivedAt: r.DriverArrivedAt ? new Date(r.DriverArrivedAt as string).toISOString() : undefined,
    deliveryPhotoUrl: r.DeliveryPhotoUrl ? String(r.DeliveryPhotoUrl) : undefined,
    driverSettledAt: r.DriverSettledAt ? new Date(r.DriverSettledAt as string).toISOString() : undefined,
  }
}

/** Estado completo para el POS — reemplaza el seed local */
catalogRouter.get('/bootstrap', authRequired, async (_req, res) => {
  try {
    await ensureProducts()
    await ensureProductExtras()
    const pool = await getPool()

    const [users, products, tables, inventory, settings, orders, customers, reservations, branches, ranges] =
      await Promise.all([
        pool.request().query(`
          SELECT Id, Name, Email, Role, Active, Pin, Phone, PhotoUrl, Dni
          FROM dbo.Users
          WHERE ISNULL(IsSystem, 0) = 0
          ORDER BY Name
        `),
        pool.request().query(`SELECT * FROM dbo.Products ORDER BY Category, Name`),
        pool.request().query(`SELECT * FROM dbo.Tables ORDER BY Number`),
        pool.request().query(`SELECT * FROM dbo.Inventory ORDER BY Name`),
        pool.request().query(`SELECT TOP 1 * FROM dbo.Settings WHERE Id = 1`),
        pool.request().query(`
          SELECT TOP 400 o.*, u.Name AS CreatedByName
          FROM dbo.Orders o
          LEFT JOIN dbo.Users u ON u.Id = o.CreatedByUserId
          ORDER BY o.CreatedAt DESC
        `),
        pool.request().query(`SELECT Id, Name, Phone, Email, Address, PhotoUrl, CreatedAt FROM dbo.Customers ORDER BY CreatedAt DESC`),
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
          id: String(it.Id),
          productId: it.ProductId ? String(it.ProductId) : 'x',
          name: it.Name,
          qty: Number(it.Qty),
          price: Number(it.Price),
          notes: it.Notes || undefined,
          kitchenStatus: it.KitchenStatus ? String(it.KitchenStatus) : undefined,
          stockDeducted: Boolean(it.StockDeducted),
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
        dni: u.Dni ? String(u.Dni) : undefined,
        isSystem: false,
        photoUrl:
          u.PhotoUrl ||
          `https://ui-avatars.com/api/?name=${encodeURIComponent(String(u.Name || 'Usuario'))}&background=e11d2e&color=ffffff&size=128&bold=true`,
      })),
      products: await attachProductExtras(products.recordset.map(mapProduct)),
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
        deliveryFee: Number(s.DeliveryFee ?? 3),
        originLat: s.OriginLat != null ? Number(s.OriginLat) : undefined,
        originLng: s.OriginLng != null ? Number(s.OriginLng) : undefined,
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
        photoUrl:
          c.PhotoUrl ||
          `https://ui-avatars.com/api/?name=${encodeURIComponent(String(c.Name || 'Cliente'))}&background=1a3d1a&color=ffd700&size=128&bold=true`,
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
        lat: b.Lat != null ? Number(b.Lat) : undefined,
        lng: b.Lng != null ? Number(b.Lng) : undefined,
      })),
      deliveryRanges: ranges.recordset.map((r: Record<string, unknown>) => ({
        id: String(r.Id),
        branchId: r.BranchId ? String(r.BranchId) : undefined,
        name: r.Name,
        distanceKmFrom: Number(r.DistanceKmFrom),
        distanceKmTo: r.DistanceKmTo != null ? Number(r.DistanceKmTo) : null,
        fee: Number(r.Fee),
        sortOrder: Number(r.SortOrder),
        active: Boolean(r.Active),
      })),
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
    await ensureProductExtras()
    const pool = await getPool()
    const r = await pool.request().query(`SELECT * FROM dbo.Products WHERE Available = 1 ORDER BY Category, Name`)
    const products = await attachProductExtras(r.recordset.map(mapProduct))
    res.json({ products })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

catalogRouter.get('/tables', authRequired, async (_req, res) => {
  const pool = await getPool()
  const r = await pool.request().query(`SELECT * FROM dbo.Tables ORDER BY Number`)
  res.json({ tables: r.recordset.map(mapTable) })
})
