import { Router } from 'express'
import { v4 as uuid } from 'uuid'
import bcrypt from 'bcryptjs'
import { getPool, sql } from '../db.js'
import { persistablePhotoUrl } from '../photoUrl.js'
import { authRequired, requireRoles } from '../auth.js'

export const crudRouter = Router()

function isGuid(id?: string) {
  return Boolean(id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
}

function paramId(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value
}

/* ─── Products ─── */
crudRouter.post('/products', authRequired, requireRoles('admin'), async (req, res) => {
  const p = req.body as Record<string, unknown>
  if (!p.name || !p.category || p.price == null) {
    return res.status(400).json({ error: 'name, category y price requeridos' })
  }
  const id = isGuid(String(p.id || '')) ? String(p.id) : uuid()
  const pool = await getPool()
  await pool
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .input('name', sql.NVarChar, p.name)
    .input('description', sql.NVarChar, p.description || '')
    .input('category', sql.NVarChar, p.category)
    .input('price', sql.Decimal(10, 2), Number(p.price))
    .input('original', sql.Decimal(10, 2), p.originalPrice != null ? Number(p.originalPrice) : null)
    .input('emoji', sql.NVarChar, p.emoji || '🍗')
    .input('tone', sql.NVarChar, p.tone || '#E85D04')
    .input('imageUrl', sql.NVarChar, p.imageUrl || null)
    .input('available', sql.Bit, p.available !== false)
    .input('prep', sql.Int, Number(p.prepMinutes || 10))
    .input(
      'kitchen',
      sql.Bit,
      p.sendToKitchen !== undefined
        ? Boolean(p.sendToKitchen)
        : !/bebida|gaseosa/i.test(String(p.category || '')),
    )
    .query(`
      INSERT INTO dbo.Products (Id, Name, Description, Category, Price, OriginalPrice, Emoji, Tone, ImageUrl, Available, PrepMinutes, SendToKitchen)
      VALUES (@id, @name, @description, @category, @price, @original, @emoji, @tone, @imageUrl, @available, @prep, @kitchen)
    `)
  await replaceProductOptions(id, p.optionGroups)
  await replaceProductTags(id, p.tags)
  await replaceProductRecipes(id, p.recipes)
  await setProductCuantificable(
    id,
    p.cuantificable === true || (Array.isArray(p.recipes) && p.recipes.length > 0) || groupsHaveInventory(p.optionGroups),
  )
  res.status(201).json({ id })
})

crudRouter.put('/products/:id', authRequired, requireRoles('admin'), async (req, res) => {
  const id = paramId(req.params.id)
  const p = req.body as Record<string, unknown>
  const pool = await getPool()
  await pool
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .input('name', sql.NVarChar, p.name)
    .input('description', sql.NVarChar, p.description || '')
    .input('category', sql.NVarChar, p.category)
    .input('price', sql.Decimal(10, 2), Number(p.price))
    .input('original', sql.Decimal(10, 2), p.originalPrice != null ? Number(p.originalPrice) : null)
    .input('emoji', sql.NVarChar, p.emoji || '🍗')
    .input('tone', sql.NVarChar, p.tone || '#E85D04')
    .input('imageUrl', sql.NVarChar, p.imageUrl || null)
    .input('available', sql.Bit, p.available !== false)
    .input('prep', sql.Int, Number(p.prepMinutes || 10))
    .input(
      'kitchen',
      sql.Bit,
      p.sendToKitchen !== undefined
        ? Boolean(p.sendToKitchen)
        : !/bebida|gaseosa/i.test(String(p.category || '')),
    )
    .query(`
      UPDATE dbo.Products SET
        Name=@name, Description=@description, Category=@category, Price=@price,
        OriginalPrice=@original, Emoji=@emoji, Tone=@tone, ImageUrl=@imageUrl,
        Available=@available, PrepMinutes=@prep, SendToKitchen=@kitchen, UpdatedAt=SYSUTCDATETIME()
      WHERE Id=@id
    `)
  await replaceProductOptions(id, p.optionGroups)
  await replaceProductTags(id, p.tags)
  await replaceProductRecipes(id, p.recipes)
  await setProductCuantificable(
    id,
    p.cuantificable === true || (Array.isArray(p.recipes) && p.recipes.length > 0) || groupsHaveInventory(p.optionGroups),
  )
  res.json({ ok: true })
})

crudRouter.delete('/products/:id', authRequired, requireRoles('admin'), async (req, res) => {
  const pool = await getPool()
  await pool
    .request()
    .input('id', sql.UniqueIdentifier, paramId(req.params.id))
    .query(`DELETE FROM dbo.Products WHERE Id=@id`)
  res.json({ ok: true })
})

type OptionIn = { id?: string; name?: string; price?: number; inventoryId?: string; qtyPerUnit?: number }
type GroupIn = {
  id?: string
  title?: string
  required?: boolean
  maxSelect?: number
  options?: OptionIn[]
}

async function ensureProductOptionInventoryCols() {
  const pool = await getPool()
  await pool.request().query(`
    IF COL_LENGTH('dbo.ProductOptions', 'InventoryId') IS NULL
      ALTER TABLE dbo.ProductOptions ADD InventoryId UNIQUEIDENTIFIER NULL;
    IF COL_LENGTH('dbo.ProductOptions', 'QtyPerUnit') IS NULL
      ALTER TABLE dbo.ProductOptions ADD QtyPerUnit DECIMAL(12,4) NULL;
  `)
}

function groupsHaveInventory(raw: unknown) {
  if (!Array.isArray(raw)) return false
  return (raw as GroupIn[]).some((g) =>
    (g.options || []).some((o) => Boolean(o.inventoryId) && Number(o.qtyPerUnit || 0) > 0),
  )
}

async function replaceProductOptions(productId: string, raw: unknown) {
  if (!Array.isArray(raw)) return
  const pool = await getPool()
  try {
    await ensureProductOptionInventoryCols()
  } catch {
    /* columnas nuevas opcionales */
  }
  await pool
    .request()
    .input('pid', sql.UniqueIdentifier, productId)
    .query(`
      DELETE o FROM dbo.ProductOptions o
      INNER JOIN dbo.ProductOptionGroups g ON g.Id = o.GroupId
      WHERE g.ProductId = @pid
    `)
  await pool
    .request()
    .input('pid', sql.UniqueIdentifier, productId)
    .query(`DELETE FROM dbo.ProductOptionGroups WHERE ProductId = @pid`)

  let gSort = 0
  for (const g of raw as GroupIn[]) {
    const title = String(g.title || '').trim()
    if (!title) continue
    const gid = isGuid(g.id) ? String(g.id) : uuid()
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, gid)
      .input('pid', sql.UniqueIdentifier, productId)
      .input('title', sql.NVarChar, title)
      .input('req', sql.Bit, g.required ? 1 : 0)
      .input('max', sql.Int, Math.max(1, Number(g.maxSelect || 1)))
      .input('sort', sql.Int, gSort++)
      .query(`
        INSERT INTO dbo.ProductOptionGroups (Id, ProductId, Title, Required, MaxSelect, SortOrder)
        VALUES (@id, @pid, @title, @req, @max, @sort)
      `)
    let oSort = 0
    for (const opt of g.options || []) {
      const name = String(opt.name || '').trim()
      if (!name) continue
      const invId = isGuid(String(opt.inventoryId || '')) ? String(opt.inventoryId) : null
      const qty = invId ? Math.max(0, Number(opt.qtyPerUnit || 1)) : null
      const req = pool
        .request()
        .input('id', sql.UniqueIdentifier, isGuid(opt.id) ? String(opt.id) : uuid())
        .input('gid', sql.UniqueIdentifier, gid)
        .input('name', sql.NVarChar, name)
        .input('price', sql.Decimal(10, 2), Number(opt.price || 0))
        .input('sort', sql.Int, oSort++)
        .input('iid', sql.UniqueIdentifier, invId)
        .input('qty', sql.Decimal(12, 4), qty)
      try {
        await req.query(`
          INSERT INTO dbo.ProductOptions (Id, GroupId, Name, Price, SortOrder, InventoryId, QtyPerUnit)
          VALUES (@id, @gid, @name, @price, @sort, @iid, @qty)
        `)
      } catch {
        await pool
          .request()
          .input('id', sql.UniqueIdentifier, isGuid(opt.id) ? String(opt.id) : uuid())
          .input('gid', sql.UniqueIdentifier, gid)
          .input('name', sql.NVarChar, name)
          .input('price', sql.Decimal(10, 2), Number(opt.price || 0))
          .input('sort', sql.Int, oSort - 1)
          .query(`
            INSERT INTO dbo.ProductOptions (Id, GroupId, Name, Price, SortOrder)
            VALUES (@id, @gid, @name, @price, @sort)
          `)
      }
    }
  }
}

async function setProductCuantificable(productId: string, value: boolean) {
  try {
    const pool = await getPool()
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, productId)
      .input('c', sql.Bit, value ? 1 : 0)
      .query(`
        IF COL_LENGTH('dbo.Products', 'Cuantificable') IS NOT NULL
          UPDATE dbo.Products SET Cuantificable=@c WHERE Id=@id
      `)
  } catch {
    /* columna opcional */
  }
}

async function ensureRecipeTables() {
  const pool = await getPool()
  await pool.request().query(`
    IF OBJECT_ID(N'dbo.ProductRecipes', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.ProductRecipes (
        Id           UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_ProductRecipes PRIMARY KEY DEFAULT NEWID(),
        ProductId    UNIQUEIDENTIFIER NOT NULL,
        InventoryId  UNIQUEIDENTIFIER NOT NULL,
        QtyPerUnit   DECIMAL(12,4)    NOT NULL,
        Notes        NVARCHAR(120)    NULL,
        CONSTRAINT FK_ProductRecipes_Product FOREIGN KEY (ProductId) REFERENCES dbo.Products(Id) ON DELETE CASCADE,
        CONSTRAINT FK_ProductRecipes_Inventory FOREIGN KEY (InventoryId) REFERENCES dbo.Inventory(Id),
        CONSTRAINT CK_ProductRecipes_Qty CHECK (QtyPerUnit > 0),
        CONSTRAINT UQ_ProductRecipes UNIQUE (ProductId, InventoryId)
      );
    END
    IF OBJECT_ID(N'dbo.InventoryMovements', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.InventoryMovements (
        Id              UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_InvMov PRIMARY KEY DEFAULT NEWID(),
        InventoryId     UNIQUEIDENTIFIER NOT NULL,
        Delta           DECIMAL(12,3)    NOT NULL,
        StockAfter      DECIMAL(12,3)    NOT NULL,
        Reason          NVARCHAR(40)     NOT NULL,
        OrderId         UNIQUEIDENTIFIER NULL,
        OrderItemId     UNIQUEIDENTIFIER NULL,
        Notes           NVARCHAR(255)    NULL,
        CreatedAt       DATETIME2(0)     NOT NULL CONSTRAINT DF_InvMov_CreatedAt DEFAULT (SYSUTCDATETIME()),
        CreatedByUserId UNIQUEIDENTIFIER NULL,
        CONSTRAINT FK_InvMov_Inventory FOREIGN KEY (InventoryId) REFERENCES dbo.Inventory(Id)
      );
    END
  `)
}

async function replaceProductRecipes(productId: string, raw: unknown) {
  if (raw === undefined) return
  const pool = await getPool()
  await ensureRecipeTables()
  await pool
    .request()
    .input('pid', sql.UniqueIdentifier, productId)
    .query(`DELETE FROM dbo.ProductRecipes WHERE ProductId = @pid`)
  if (!Array.isArray(raw)) return
  for (const row of raw as Array<{ inventoryId?: string; qtyPerUnit?: number }>) {
    const inventoryId = String(row.inventoryId || '')
    const qty = Number(row.qtyPerUnit || 0)
    if (!isGuid(inventoryId) || qty <= 0) continue
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, uuid())
      .input('pid', sql.UniqueIdentifier, productId)
      .input('iid', sql.UniqueIdentifier, inventoryId)
      .input('qty', sql.Decimal(12, 4), qty)
      .query(`
        INSERT INTO dbo.ProductRecipes (Id, ProductId, InventoryId, QtyPerUnit)
        VALUES (@id, @pid, @iid, @qty)
      `)
  }
}

async function replaceProductTags(productId: string, raw: unknown) {
  if (!Array.isArray(raw)) return
  const pool = await getPool()
  await pool
    .request()
    .input('pid', sql.UniqueIdentifier, productId)
    .query(`DELETE FROM dbo.ProductTags WHERE ProductId = @pid`)
  for (const tag of raw) {
    const t = String(tag || '').trim()
    if (!t) continue
    await pool
      .request()
      .input('pid', sql.UniqueIdentifier, productId)
      .input('tag', sql.NVarChar, t.slice(0, 40))
      .query(`INSERT INTO dbo.ProductTags (ProductId, Tag) VALUES (@pid, @tag)`)
  }
}

async function assertNotSystemUser(id: string) {
  const pool = await getPool()
  const r = await pool
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .query(`SELECT TOP 1 ISNULL(IsSystem, 0) AS IsSystem FROM dbo.Users WHERE Id=@id`)
  if (r.recordset[0] && Number(r.recordset[0].IsSystem) === 1) {
    const err = new Error('Usuario de sistema protegido') as Error & { status: number }
    err.status = 403
    throw err
  }
}

/* ─── Users ─── */
crudRouter.post('/users', authRequired, requireRoles('admin'), async (req, res) => {
  const u = req.body as {
    id?: string
    name: string
    email: string
    password?: string
    role: string
    active?: boolean
    pin?: string
    phone?: string
    dni?: string
    photoUrl?: string
  }
  if (!u.name || !u.email || !u.role) return res.status(400).json({ error: 'name, email, role requeridos' })
  if (u.email.toLowerCase() === 'davant101982@gmail.com') {
    return res.status(403).json({ error: 'Email reservado del sistema' })
  }
  const id = isGuid(u.id) ? u.id! : uuid()
  const hash = await bcrypt.hash(u.password || 'changeme', 10)
  const photo = persistablePhotoUrl(u.photoUrl)
  const pool = await getPool()
  try {
    await pool
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .input('name', sql.NVarChar, u.name)
    .input('email', sql.NVarChar, u.email)
    .input('hash', sql.NVarChar, hash)
    .input('role', sql.NVarChar, u.role)
    .input('active', sql.Bit, u.active !== false)
    .input('pin', sql.NVarChar, u.pin || '0000')
    .input('phone', sql.NVarChar, u.phone || null)
    .input('dni', sql.NVarChar, u.dni || null)
    .input('photo', sql.NVarChar(500), photo)
    .query(`
      INSERT INTO dbo.Users (Id, Name, Email, PasswordHash, Role, Active, Pin, Phone, Dni, IsSystem, PhotoUrl)
      VALUES (@id, @name, @email, @hash, @role, @active, @pin, @phone, @dni, 0, @photo)
    `)
  } catch (e) {
    const msg = (e as Error).message || ''
    if (/UQ_Users_Email/i.test(msg)) return res.status(409).json({ error: 'Ese correo ya está registrado' })
    return res.status(500).json({ error: msg || 'No se pudo crear el usuario' })
  }
  res.status(201).json({ id })
})

crudRouter.put('/users/:id', authRequired, requireRoles('admin'), async (req, res) => {
  const id = paramId(req.params.id)
  try {
    await assertNotSystemUser(id)
  } catch (e) {
    const err = e as Error & { status?: number }
    return res.status(err.status || 500).json({ error: err.message })
  }
  const u = req.body as {
    name: string
    email: string
    password?: string
    role: string
    active?: boolean
    pin?: string
    phone?: string
    dni?: string
    photoUrl?: string
  }
  const pool = await getPool()
  const photo = persistablePhotoUrl(u.photoUrl)
  const reqDb = pool
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .input('name', sql.NVarChar, u.name)
    .input('email', sql.NVarChar, u.email)
    .input('role', sql.NVarChar, u.role)
    .input('active', sql.Bit, u.active !== false)
    .input('pin', sql.NVarChar, u.pin || '0000')
    .input('phone', sql.NVarChar, u.phone || null)
    .input('dni', sql.NVarChar, u.dni || null)
    .input('photo', sql.NVarChar(500), photo)

  try {
    if (u.password && u.password.length >= 4) {
      const hash = await bcrypt.hash(u.password, 10)
      reqDb.input('hash', sql.NVarChar, hash)
      await reqDb.query(`
        UPDATE dbo.Users SET Name=@name, Email=@email, PasswordHash=@hash, Role=@role,
          Active=@active, Pin=@pin, Phone=@phone, Dni=@dni, PhotoUrl=@photo, UpdatedAt=SYSUTCDATETIME()
        WHERE Id=@id AND ISNULL(IsSystem, 0) = 0
      `)
    } else {
      await reqDb.query(`
        UPDATE dbo.Users SET Name=@name, Email=@email, Role=@role,
          Active=@active, Pin=@pin, Phone=@phone, Dni=@dni, PhotoUrl=@photo, UpdatedAt=SYSUTCDATETIME()
        WHERE Id=@id AND ISNULL(IsSystem, 0) = 0
      `)
    }
  } catch (e) {
    const msg = (e as Error).message || ''
    if (/UQ_Users_Email/i.test(msg)) return res.status(409).json({ error: 'Ese correo ya está registrado' })
    return res.status(500).json({ error: msg || 'No se pudo guardar el usuario' })
  }
  res.json({ ok: true })
})

/** PATCH /api/users/me — usuario actualiza su propia foto o nombre */
crudRouter.patch('/users/me', authRequired, async (req, res) => {
  try {
    const userId = req.user?.id
    if (!userId) return res.status(401).json({ error: 'No autorizado' })
    const { name, photoUrl } = req.body as { name?: string; photoUrl?: string }
    const pool = await getPool()
    const sets: string[] = []
    const rq = pool.request().input('id', sql.UniqueIdentifier, userId)
    if (name && name.trim()) {
      sets.push('Name = @name')
      rq.input('name', sql.NVarChar, name.trim().slice(0, 120))
    }
    if (photoUrl !== undefined) {
      sets.push('PhotoUrl = @photo')
      rq.input('photo', sql.NVarChar(500), persistablePhotoUrl(photoUrl))
    }
    if (sets.length === 0) {
      return res.status(400).json({ error: 'Nada que actualizar' })
    }
    sets.push('UpdatedAt = SYSUTCDATETIME()')
    await rq.query(`UPDATE dbo.Users SET ${sets.join(', ')} WHERE Id = @id`)
    const r = await pool
      .request()
      .input('id', sql.UniqueIdentifier, userId)
      .query(`SELECT Id, Name, Email, Role, Active, Pin, Phone, Dni, PhotoUrl FROM dbo.Users WHERE Id = @id`)
    const row = r.recordset[0]
    if (!row) return res.status(404).json({ error: 'Usuario no encontrado' })
    res.json({
      user: {
        id: String(row.Id),
        name: String(row.Name || ''),
        email: row.Email ? String(row.Email) : undefined,
        role: String(row.Role || 'mozo'),
        active: Boolean(row.Active),
        phone: row.Phone ? String(row.Phone) : undefined,
        dni: row.Dni ? String(row.Dni) : undefined,
        photoUrl: row.PhotoUrl ? String(row.PhotoUrl) : undefined,
      },
    })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

crudRouter.delete('/users/:id', authRequired, requireRoles('admin'), async (req, res) => {
  const id = paramId(req.params.id)
  try {
    await assertNotSystemUser(id)
  } catch (e) {
    const err = e as Error & { status?: number }
    return res.status(err.status || 500).json({ error: err.message })
  }
  const pool = await getPool()
  await pool
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .query(`
      UPDATE dbo.Users SET Active=0, UpdatedAt=SYSUTCDATETIME()
      WHERE Id=@id AND ISNULL(IsSystem, 0) = 0
    `)
  res.json({ ok: true })
})

/* ─── Inventory ─── */
crudRouter.get('/inventory/movements', authRequired, requireRoles('admin', 'cajero', 'cocina'), async (_req, res) => {
  const pool = await getPool()
  try {
    const r = await pool.request().query(`
      SELECT TOP 120
        m.Id, m.InventoryId, i.Name AS InventoryName, i.Unit,
        m.Delta, m.StockAfter, m.Reason, m.Notes, m.CreatedAt,
        u.Name AS UserName
      FROM dbo.InventoryMovements m
      INNER JOIN dbo.Inventory i ON i.Id = m.InventoryId
      LEFT JOIN dbo.Users u ON u.Id = m.CreatedByUserId
      ORDER BY m.CreatedAt DESC
    `)
    res.json(
      r.recordset.map((row: Record<string, unknown>) => ({
        id: String(row.Id),
        inventoryId: String(row.InventoryId),
        name: String(row.InventoryName || ''),
        unit: String(row.Unit || ''),
        delta: Number(row.Delta),
        stockAfter: Number(row.StockAfter),
        reason: String(row.Reason || ''),
        notes: row.Notes ? String(row.Notes) : '',
        createdAt: new Date(row.CreatedAt as string).toISOString(),
        userName: row.UserName ? String(row.UserName) : '',
      })),
    )
  } catch {
    res.json([])
  }
})

crudRouter.get('/inventory/flow', authRequired, requireRoles('admin', 'cajero', 'cocina'), async (_req, res) => {
  const pool = await getPool()
  try {
    const limaStartUtc = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date())}T05:00:00.000Z`)
    const r = await pool.request().input('from', sql.DateTime2, limaStartUtc).query(`
      SELECT
        i.Id,
        CAST(i.Stock AS DECIMAL(12,3)) AS Stock,
        ISNULL((
          SELECT SUM(CASE WHEN m.Delta < 0 THEN -m.Delta ELSE 0 END)
          FROM dbo.InventoryMovements m
          WHERE m.InventoryId = i.Id AND m.CreatedAt >= @from
        ), 0) AS QtyOut,
        ISNULL((
          SELECT SUM(CASE WHEN m.Delta > 0 THEN m.Delta ELSE 0 END)
          FROM dbo.InventoryMovements m
          WHERE m.InventoryId = i.Id AND m.CreatedAt >= @from
        ), 0) AS QtyIn,
        ISNULL((
          SELECT SUM(m.Delta)
          FROM dbo.InventoryMovements m
          WHERE m.InventoryId = i.Id AND m.CreatedAt >= @from
        ), 0) AS DeltaNeto
      FROM dbo.Inventory i
    `)
    const round3 = (n: number) => Math.round(n * 1000) / 1000
    res.json(
      r.recordset.map((row: Record<string, unknown>) => {
        const left = Number(row.Stock || 0)
        const delta = Number(row.DeltaNeto || 0)
        return {
          inventoryId: String(row.Id),
          had: round3(left - delta),
          out: round3(Number(row.QtyOut || 0)),
          in: round3(Number(row.QtyIn || 0)),
          left: round3(left),
        }
      }),
    )
  } catch {
    res.json([])
  }
})

crudRouter.post('/inventory', authRequired, requireRoles('admin', 'cajero'), async (req, res) => {
  const item = req.body as { id?: string; name: string; unit: string; stock: number; minStock: number; cost: number; salePrice?: number }
  if (!item.name || !item.unit) return res.status(400).json({ error: 'name y unit requeridos' })
  const id = isGuid(item.id) ? item.id! : uuid()
  const pool = await getPool()
  try {
    await pool.request().query(`
      IF COL_LENGTH('dbo.Inventory', 'SalePrice') IS NULL
        ALTER TABLE dbo.Inventory ADD SalePrice DECIMAL(10,2) NOT NULL CONSTRAINT DF_Inventory_SalePrice DEFAULT (0);
    `)
  } catch {
    /* columna opcional */
  }
  await pool
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .input('name', sql.NVarChar, item.name)
    .input('unit', sql.NVarChar, item.unit)
    .input('stock', sql.Decimal(12, 3), Number(item.stock || 0))
    .input('min', sql.Decimal(12, 3), Number(item.minStock || 0))
    .input('cost', sql.Decimal(10, 2), Number(item.cost || 0))
    .input('sale', sql.Decimal(10, 2), Number(item.salePrice || 0))
    .query(`
      INSERT INTO dbo.Inventory (Id, Name, Unit, Stock, MinStock, Cost)
      VALUES (@id, @name, @unit, @stock, @min, @cost)
      IF COL_LENGTH('dbo.Inventory', 'SalePrice') IS NOT NULL
        UPDATE dbo.Inventory SET SalePrice=@sale WHERE Id=@id
    `)
  res.status(201).json({ id })
})

crudRouter.put('/inventory/:id', authRequired, requireRoles('admin', 'cajero'), async (req, res) => {
  const item = req.body as { name: string; unit: string; stock: number; minStock: number; cost: number; salePrice?: number }
  const pool = await getPool()
  await pool
    .request()
    .input('id', sql.UniqueIdentifier, paramId(req.params.id))
    .input('name', sql.NVarChar, item.name)
    .input('unit', sql.NVarChar, item.unit)
    .input('stock', sql.Decimal(12, 3), Number(item.stock || 0))
    .input('min', sql.Decimal(12, 3), Number(item.minStock || 0))
    .input('cost', sql.Decimal(10, 2), Number(item.cost || 0))
    .input('sale', sql.Decimal(10, 2), Number(item.salePrice || 0))
    .query(`
      UPDATE dbo.Inventory SET Name=@name, Unit=@unit, Stock=@stock, MinStock=@min, Cost=@cost, UpdatedAt=SYSUTCDATETIME()
      WHERE Id=@id
      IF COL_LENGTH('dbo.Inventory', 'SalePrice') IS NOT NULL
        UPDATE dbo.Inventory SET SalePrice=@sale WHERE Id=@id
    `)
  res.json({ ok: true })
})

crudRouter.post('/inventory/:id/adjust', authRequired, requireRoles('admin', 'cajero', 'cocina'), async (req, res) => {
  const delta = Number(req.body?.delta || 0)
  const notes = String(req.body?.notes || '').trim().slice(0, 255)
  const rawReason = String(req.body?.reason || '').trim().toLowerCase()
  const reason =
    rawReason === 'perdida' || rawReason === 'pérdida'
      ? 'perdida'
      : delta > 0
        ? 'ingreso'
        : rawReason === 'ajuste' || rawReason === 'uso'
          ? 'ajuste'
          : delta < 0
            ? 'ajuste'
            : 'ajuste'
  const id = paramId(req.params.id)
  const pool = await getPool()
  const cur = await pool
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .query(`SELECT Stock FROM dbo.Inventory WHERE Id=@id`)
  if (!cur.recordset[0]) return res.status(404).json({ error: 'Ítem no encontrado' })
  const after = Math.max(0, Number(cur.recordset[0].Stock || 0) + delta)
  await pool
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .input('stock', sql.Decimal(12, 3), after)
    .query(`
      UPDATE dbo.Inventory
      SET Stock = @stock, UpdatedAt = SYSUTCDATETIME()
      WHERE Id=@id
    `)
  try {
    await pool
      .request()
      .input('mid', sql.UniqueIdentifier, uuid())
      .input('iid', sql.UniqueIdentifier, id)
      .input('delta', sql.Decimal(12, 3), delta)
      .input('after', sql.Decimal(12, 3), after)
      .input('reason', sql.NVarChar, reason)
      .input('notes', sql.NVarChar, notes || null)
      .input('uid', sql.UniqueIdentifier, req.user?.id && isGuid(req.user.id) ? req.user.id : null)
      .query(`
        IF OBJECT_ID(N'dbo.InventoryMovements', N'U') IS NOT NULL
        INSERT INTO dbo.InventoryMovements
          (Id, InventoryId, Delta, StockAfter, Reason, Notes, CreatedByUserId)
        VALUES (@mid, @iid, @delta, @after, @reason, @notes, @uid)
      `)
  } catch {
    /* kardex opcional */
  }
  res.json({ ok: true, stock: after, reason })
})

/* ─── Tables ─── */
crudRouter.put('/tables/:id', authRequired, async (req, res) => {
  const patch = req.body as { seats?: number; zone?: string; status?: string; orderId?: string | null }
  const pool = await getPool()
  const cur = await pool
    .request()
    .input('id', sql.UniqueIdentifier, paramId(req.params.id))
    .query(`SELECT * FROM dbo.Tables WHERE Id=@id`)
  const row = cur.recordset[0]
  if (!row) return res.status(404).json({ error: 'Mesa no encontrada' })

  await pool
    .request()
    .input('id', sql.UniqueIdentifier, paramId(req.params.id))
    .input('seats', sql.Int, patch.seats ?? row.Seats)
    .input('zone', sql.NVarChar, patch.zone ?? row.Zone)
    .input('status', sql.NVarChar, patch.status ?? row.Status)
    .input('orderId', sql.UniqueIdentifier, patch.orderId === null ? null : patch.orderId ?? row.CurrentOrderId)
    .query(`
      UPDATE dbo.Tables SET Seats=@seats, Zone=@zone, Status=@status, CurrentOrderId=@orderId
      WHERE Id=@id
    `)
  res.json({ ok: true })
})

/* ─── Settings ─── */
crudRouter.put('/settings', authRequired, requireRoles('admin'), async (req, res) => {
  const s = req.body as {
    name: string
    slogan?: string
    address: string
    phone: string
    ruc?: string
    igvRate?: number
    hours?: string
    deliveryFee?: number
    originLat?: number
    originLng?: number
  }
  const pool = await getPool()
  await pool
    .request()
    .input('name', sql.NVarChar, s.name)
    .input('slogan', sql.NVarChar, s.slogan || '')
    .input('address', sql.NVarChar, s.address)
    .input('phone', sql.NVarChar, s.phone)
    .input('ruc', sql.NVarChar, s.ruc || '')
    .input('igv', sql.Decimal(5, 4), Number(s.igvRate ?? 0.18))
    .input('hours', sql.NVarChar, s.hours || '')
    .input('deliveryFee', sql.Decimal(10, 2), Number(s.deliveryFee ?? 5))
    .input('originLat', sql.Decimal(10, 7), s.originLat != null ? s.originLat : null)
    .input('originLng', sql.Decimal(10, 7), s.originLng != null ? s.originLng : null)
    .query(`
      UPDATE dbo.Settings SET
        Name=@name, Slogan=@slogan, Address=@address, Phone=@phone,
        Ruc=@ruc, IgvRate=@igv, Hours=@hours, DeliveryFee=@deliveryFee,
        OriginLat=@originLat, OriginLng=@originLng, UpdatedAt=SYSUTCDATETIME()
      WHERE Id=1
    `)
  res.json({ ok: true })
})

/* ─── Branches ─── */
crudRouter.post('/branches', authRequired, requireRoles('admin'), async (req, res) => {
  const b = req.body as {
    id?: string
    name: string
    address: string
    phone: string
    active?: boolean
    lat?: number
    lng?: number
  }
  if (!b.name) return res.status(400).json({ error: 'name requerido' })
  const id = isGuid(b.id) ? b.id! : uuid()
  const pool = await getPool()
  await pool
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .input('name', sql.NVarChar, b.name)
    .input('address', sql.NVarChar, b.address || '')
    .input('phone', sql.NVarChar, b.phone || '')
    .input('active', sql.Bit, b.active !== false)
    .input('lat', sql.Decimal(10, 7), b.lat != null ? Number(b.lat) : null)
    .input('lng', sql.Decimal(10, 7), b.lng != null ? Number(b.lng) : null)
    .query(`
      INSERT INTO dbo.Branches (Id, Name, Address, Phone, Lat, Lng, Active)
      VALUES (@id, @name, @address, @phone, @lat, @lng, @active)
    `)
  res.status(201).json({ id })
})

crudRouter.put('/branches/:id', authRequired, requireRoles('admin'), async (req, res) => {
  const b = req.body as {
    name: string
    address: string
    phone: string
    active?: boolean
    lat?: number
    lng?: number
  }
  const id = paramId(req.params.id)
  const pool = await getPool()
  await pool
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .input('name', sql.NVarChar, b.name)
    .input('address', sql.NVarChar, b.address || '')
    .input('phone', sql.NVarChar, b.phone || '')
    .input('active', sql.Bit, b.active !== false)
    .input('lat', sql.Decimal(10, 7), b.lat != null ? Number(b.lat) : null)
    .input('lng', sql.Decimal(10, 7), b.lng != null ? Number(b.lng) : null)
    .query(`
      UPDATE dbo.Branches
      SET Name=@name, Address=@address, Phone=@phone, Active=@active, Lat=@lat, Lng=@lng
      WHERE Id=@id
    `)
  res.json({ ok: true })
})

crudRouter.delete('/branches/:id', authRequired, requireRoles('admin'), async (req, res) => {
  const pool = await getPool()
  const id = paramId(req.params.id)
  await pool
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .query(`DELETE FROM dbo.DeliveryRanges WHERE BranchId = @id`)
  await pool
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .query(`DELETE FROM dbo.Branches WHERE Id=@id`)
  res.json({ ok: true })
})

/* ─── Reservations ─── */
crudRouter.post('/reservations', async (req, res) => {
  const r = req.body as {
    customerName: string
    customerPhone: string
    customerId?: string
    date: string
    time: string
    guests: number
    notes?: string
  }
  if (!r.customerName || !r.customerPhone || !r.date || !r.time || !r.guests) {
    return res.status(400).json({ error: 'Datos de reserva incompletos' })
  }
  const id = uuid()
  const pool = await getPool()
  await pool
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .input('customerId', sql.UniqueIdentifier, isGuid(r.customerId) ? r.customerId : null)
    .input('name', sql.NVarChar, r.customerName)
    .input('phone', sql.NVarChar, r.customerPhone)
    .input('date', sql.Date, r.date)
    .input('time', sql.NVarChar, r.time.length === 5 ? `${r.time}:00` : r.time)
    .input('guests', sql.Int, Number(r.guests))
    .input('notes', sql.NVarChar, r.notes || null)
    .query(`
      INSERT INTO dbo.Reservations (Id, CustomerId, CustomerName, CustomerPhone, [Date], [Time], Guests, Notes, Status)
      VALUES (@id, @customerId, @name, @phone, @date, @time, @guests, @notes, N'pendiente')
    `)
  res.status(201).json({
    id,
    ...r,
    status: 'pendiente',
    createdAt: new Date().toISOString(),
  })
})

crudRouter.patch('/reservations/:id/status', authRequired, async (req, res) => {
  const status = String(req.body?.status || '')
  const allowed = ['pendiente', 'confirmada', 'cancelada', 'completada']
  if (!allowed.includes(status)) return res.status(400).json({ error: 'status inválido' })
  const pool = await getPool()
  await pool
    .request()
    .input('id', sql.UniqueIdentifier, paramId(req.params.id))
    .input('status', sql.NVarChar, status)
    .query(`UPDATE dbo.Reservations SET Status=@status WHERE Id=@id`)
  res.json({ ok: true })
})

/* ─── Customers (POS + web) ─── */
function defaultPhoto(name: string) {
  const n = encodeURIComponent((name || 'Cliente').trim().slice(0, 40) || 'Cliente')
  return `https://ui-avatars.com/api/?name=${n}&background=1a3d1a&color=ffd700&size=128&bold=true`
}

function normalizePhone(phone: string) {
  let digits = phone.replace(/\D/g, '')
  if (digits.length === 9 && digits.startsWith('9')) digits = `51${digits}`
  return digits
}

crudRouter.get('/customers/search', authRequired, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim()
    if (q.length < 2) return res.json({ customers: [] })
    const digits = q.replace(/\D/g, '')
    const pool = await getPool()
    const r = await pool
      .request()
      .input('q', sql.NVarChar, `%${q}%`)
      .input('digits', sql.NVarChar, digits.length >= 3 ? `%${digits}%` : '')
      .query(`
        SELECT TOP 20 Id, Name, Phone, Email, Address, PhotoUrl, CreatedAt
        FROM dbo.Customers
        WHERE Name LIKE @q
           OR (@digits <> '' AND REPLACE(REPLACE(REPLACE(REPLACE(Phone,' ',''),'-',''),'+',''),'(','') LIKE @digits)
        ORDER BY Name
      `)
    res.json({
      customers: r.recordset.map((c: Record<string, unknown>) => ({
        id: String(c.Id),
        name: c.Name,
        phone: c.Phone,
        email: c.Email || undefined,
        address: c.Address || undefined,
        photoUrl: c.PhotoUrl || defaultPhoto(String(c.Name)),
        password: '',
        createdAt: new Date(c.CreatedAt as string).toISOString(),
      })),
    })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

crudRouter.get('/customers', authRequired, async (_req, res) => {
  try {
    const pool = await getPool()
    const r = await pool.request().query(`
      SELECT Id, Name, Phone, Email, Address, PhotoUrl, CreatedAt
      FROM dbo.Customers
      ORDER BY CreatedAt DESC
    `)
    res.json({
      customers: r.recordset.map((c: Record<string, unknown>) => ({
        id: String(c.Id),
        name: c.Name,
        phone: c.Phone,
        email: c.Email || undefined,
        address: c.Address || undefined,
        photoUrl: c.PhotoUrl || defaultPhoto(String(c.Name)),
        password: '',
        createdAt: new Date(c.CreatedAt as string).toISOString(),
      })),
    })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

/** Upsert por teléfono (POS / web) — crea o actualiza nombre + foto */
crudRouter.post('/customers/upsert', authRequired, async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim()
    const phoneRaw = String(req.body?.phone || '')
    const phone = normalizePhone(phoneRaw)
    const address = req.body?.address ? String(req.body.address) : undefined
    const email = req.body?.email ? String(req.body.email) : undefined
    let photoUrl = req.body?.photoUrl ? String(req.body.photoUrl) : ''

    if (!name || name.length < 2) return res.status(400).json({ error: 'Nombre del cliente obligatorio' })
    if (!phone || phone.length < 9) return res.status(400).json({ error: 'Teléfono del cliente obligatorio (9 dígitos)' })
    if (!photoUrl) photoUrl = defaultPhoto(name)

    const pool = await getPool()
    const existing = await pool
      .request()
      .input('phone', sql.NVarChar, phone)
      .query(`
        SELECT TOP 1 * FROM dbo.Customers
        WHERE REPLACE(REPLACE(REPLACE(Phone,' ',''),'-',''),'+','') LIKE '%' + RIGHT(@phone, 9)
      `)

    if (existing.recordset[0]) {
      const id = String(existing.recordset[0].Id)
      await pool
        .request()
        .input('id', sql.UniqueIdentifier, id)
        .input('name', sql.NVarChar, name)
        .input('phone', sql.NVarChar, phone)
        .input('address', sql.NVarChar, address || existing.recordset[0].Address || null)
        .input('email', sql.NVarChar, email || existing.recordset[0].Email || null)
        .input('photo', sql.NVarChar, photoUrl)
        .query(`
          UPDATE dbo.Customers
          SET Name=@name, Phone=@phone, Address=@address, Email=@email, PhotoUrl=@photo
          WHERE Id=@id
        `)
      return res.json({
        customer: {
          id,
          name,
          phone,
          email: email || undefined,
          address: address || undefined,
          photoUrl,
          password: '',
          createdAt: new Date(existing.recordset[0].CreatedAt).toISOString(),
        },
        created: false,
      })
    }

    const id = uuid()
    const hash = await bcrypt.hash(uuid(), 8)
    try {
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, id)
      .input('name', sql.NVarChar, name)
      .input('phone', sql.NVarChar, phone)
      .input('email', sql.NVarChar, email || null)
      .input('address', sql.NVarChar, address || null)
      .input('hash', sql.NVarChar, hash)
      .input('photo', sql.NVarChar, photoUrl)
      .query(`
        INSERT INTO dbo.Customers (Id, Name, Phone, Email, Address, PasswordHash, PhotoUrl)
        VALUES (@id, @name, @phone, @email, @address, @hash, @photo)
      `)
    } catch (e) {
      const msg = (e as Error).message || ''
      if (/UQ_Customers_Phone/i.test(msg)) return res.status(409).json({ error: 'Ese teléfono ya está registrado' })
      return res.status(500).json({ error: msg || 'No se pudo crear el cliente' })
    }

    res.status(201).json({
      customer: {
        id,
        name,
        phone,
        email: email || undefined,
        address: address || undefined,
        photoUrl,
        password: '',
        createdAt: new Date().toISOString(),
      },
      created: true,
    })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

crudRouter.post('/customers/register', async (req, res) => {
  const data = req.body as { name: string; phone: string; email?: string; password: string; address?: string }
  if (!data.name || !data.phone || !data.password) {
    return res.status(400).json({ error: 'name, phone y password requeridos' })
  }
  const pool = await getPool()
  const exists = await pool
    .request()
    .input('phone', sql.NVarChar, data.phone)
    .query(`SELECT TOP 1 Id FROM dbo.Customers WHERE Phone=@phone`)
  if (exists.recordset[0]) return res.status(409).json({ error: 'Ya existe un cliente con ese celular' })

  const id = uuid()
  const hash = await bcrypt.hash(data.password, 10)
  const photoUrl = defaultPhoto(data.name)
  await pool
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .input('name', sql.NVarChar, data.name)
    .input('phone', sql.NVarChar, data.phone)
    .input('email', sql.NVarChar, data.email || null)
    .input('hash', sql.NVarChar, hash)
    .input('address', sql.NVarChar, data.address || null)
    .input('photo', sql.NVarChar, photoUrl)
    .query(`
      INSERT INTO dbo.Customers (Id, Name, Phone, Email, PasswordHash, Address, PhotoUrl)
      VALUES (@id, @name, @phone, @email, @hash, @address, @photo)
    `)
  res.status(201).json({
    customer: {
      id,
      name: data.name,
      phone: data.phone,
      email: data.email,
      password: '',
      address: data.address,
      photoUrl,
      createdAt: new Date().toISOString(),
    },
  })
})

crudRouter.post('/customers/login', async (req, res) => {
  const { phone, password } = req.body as { phone?: string; password?: string }
  if (!phone || !password) return res.status(400).json({ error: 'phone y password requeridos' })
  const pool = await getPool()
  const r = await pool
    .request()
    .input('phone', sql.NVarChar, phone)
    .query(`SELECT TOP 1 * FROM dbo.Customers WHERE Phone=@phone`)
  const row = r.recordset[0]
  if (!row) return res.status(401).json({ error: 'Celular o contraseña incorrectos' })

  const hash = String(row.PasswordHash)
  let ok = false
  if (hash.startsWith('$2')) ok = await bcrypt.compare(password, hash)
  else ok = hash === password

  if (!ok) return res.status(401).json({ error: 'Celular o contraseña incorrectos' })

  res.json({
    customer: {
      id: String(row.Id),
      name: row.Name,
      phone: row.Phone,
      email: row.Email || undefined,
      password: '',
      address: row.Address || undefined,
      photoUrl: row.PhotoUrl || defaultPhoto(String(row.Name)),
      createdAt: new Date(row.CreatedAt).toISOString(),
    },
  })
})

crudRouter.post('/customers/password', async (req, res) => {
  const { phone, newPassword } = req.body as { phone?: string; newPassword?: string }
  if (!phone || !newPassword) return res.status(400).json({ error: 'phone y newPassword requeridos' })
  const digits = phone.replace(/\D/g, '')
  const pool = await getPool()
  const hash = await bcrypt.hash(newPassword, 10)
  const result = await pool
    .request()
    .input('hash', sql.NVarChar, hash)
    .input('phone', sql.NVarChar, phone)
    .input('last9', sql.NVarChar, digits.slice(-9))
    .query(`
      UPDATE dbo.Customers
      SET PasswordHash=@hash
      WHERE Phone=@phone OR RIGHT(REPLACE(Phone,' ',''),9)=@last9
    `)
  if (!result.rowsAffected[0]) return res.status(404).json({ error: 'Cliente no encontrado' })
  res.json({ ok: true })
})
