import { Router } from 'express'
import { v4 as uuid } from 'uuid'
import bcrypt from 'bcryptjs'
import { getPool, sql } from '../db.js'
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
    photoUrl?: string
  }
  if (!u.name || !u.email || !u.role) return res.status(400).json({ error: 'name, email, role requeridos' })
  const id = isGuid(u.id) ? u.id! : uuid()
  const hash = await bcrypt.hash(u.password || 'changeme', 10)
  const photo =
    u.photoUrl ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}&background=e11d2e&color=ffffff&size=128&bold=true`
  const pool = await getPool()
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
    .input('photo', sql.NVarChar, photo)
    .query(`
      INSERT INTO dbo.Users (Id, Name, Email, PasswordHash, Role, Active, Pin, Phone, PhotoUrl)
      VALUES (@id, @name, @email, @hash, @role, @active, @pin, @phone, @photo)
    `)
  res.status(201).json({ id })
})

crudRouter.put('/users/:id', authRequired, requireRoles('admin'), async (req, res) => {
  const id = paramId(req.params.id)
  const u = req.body as {
    name: string
    email: string
    password?: string
    role: string
    active?: boolean
    pin?: string
    phone?: string
    photoUrl?: string
  }
  const pool = await getPool()
  const photo =
    u.photoUrl ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name || 'Usuario')}&background=e11d2e&color=ffffff&size=128&bold=true`
  const reqDb = pool
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .input('name', sql.NVarChar, u.name)
    .input('email', sql.NVarChar, u.email)
    .input('role', sql.NVarChar, u.role)
    .input('active', sql.Bit, u.active !== false)
    .input('pin', sql.NVarChar, u.pin || '0000')
    .input('phone', sql.NVarChar, u.phone || null)
    .input('photo', sql.NVarChar, photo)

  if (u.password && u.password.length >= 4) {
    const hash = await bcrypt.hash(u.password, 10)
    reqDb.input('hash', sql.NVarChar, hash)
    await reqDb.query(`
      UPDATE dbo.Users SET Name=@name, Email=@email, PasswordHash=@hash, Role=@role,
        Active=@active, Pin=@pin, Phone=@phone, PhotoUrl=@photo, UpdatedAt=SYSUTCDATETIME()
      WHERE Id=@id
    `)
  } else {
    await reqDb.query(`
      UPDATE dbo.Users SET Name=@name, Email=@email, Role=@role,
        Active=@active, Pin=@pin, Phone=@phone, PhotoUrl=@photo, UpdatedAt=SYSUTCDATETIME()
      WHERE Id=@id
    `)
  }
  res.json({ ok: true })
})

crudRouter.delete('/users/:id', authRequired, requireRoles('admin'), async (req, res) => {
  const pool = await getPool()
  await pool
    .request()
    .input('id', sql.UniqueIdentifier, paramId(req.params.id))
    .query(`UPDATE dbo.Users SET Active=0, UpdatedAt=SYSUTCDATETIME() WHERE Id=@id`)
  res.json({ ok: true })
})

/* ─── Inventory ─── */
crudRouter.post('/inventory', authRequired, requireRoles('admin', 'cajero'), async (req, res) => {
  const item = req.body as { id?: string; name: string; unit: string; stock: number; minStock: number; cost: number }
  if (!item.name || !item.unit) return res.status(400).json({ error: 'name y unit requeridos' })
  const id = isGuid(item.id) ? item.id! : uuid()
  const pool = await getPool()
  await pool
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .input('name', sql.NVarChar, item.name)
    .input('unit', sql.NVarChar, item.unit)
    .input('stock', sql.Decimal(12, 3), Number(item.stock || 0))
    .input('min', sql.Decimal(12, 3), Number(item.minStock || 0))
    .input('cost', sql.Decimal(10, 2), Number(item.cost || 0))
    .query(`
      INSERT INTO dbo.Inventory (Id, Name, Unit, Stock, MinStock, Cost)
      VALUES (@id, @name, @unit, @stock, @min, @cost)
    `)
  res.status(201).json({ id })
})

crudRouter.put('/inventory/:id', authRequired, requireRoles('admin', 'cajero'), async (req, res) => {
  const item = req.body as { name: string; unit: string; stock: number; minStock: number; cost: number }
  const pool = await getPool()
  await pool
    .request()
    .input('id', sql.UniqueIdentifier, paramId(req.params.id))
    .input('name', sql.NVarChar, item.name)
    .input('unit', sql.NVarChar, item.unit)
    .input('stock', sql.Decimal(12, 3), Number(item.stock || 0))
    .input('min', sql.Decimal(12, 3), Number(item.minStock || 0))
    .input('cost', sql.Decimal(10, 2), Number(item.cost || 0))
    .query(`
      UPDATE dbo.Inventory SET Name=@name, Unit=@unit, Stock=@stock, MinStock=@min, Cost=@cost, UpdatedAt=SYSUTCDATETIME()
      WHERE Id=@id
    `)
  res.json({ ok: true })
})

crudRouter.post('/inventory/:id/adjust', authRequired, requireRoles('admin', 'cajero', 'cocina'), async (req, res) => {
  const delta = Number(req.body?.delta || 0)
  const pool = await getPool()
  await pool
    .request()
    .input('id', sql.UniqueIdentifier, paramId(req.params.id))
    .input('delta', sql.Decimal(12, 3), delta)
    .query(`
      UPDATE dbo.Inventory
      SET Stock = CASE WHEN Stock + @delta < 0 THEN 0 ELSE Stock + @delta END,
          UpdatedAt = SYSUTCDATETIME()
      WHERE Id=@id
    `)
  res.json({ ok: true })
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
    .query(`
      UPDATE dbo.Settings SET
        Name=@name, Slogan=@slogan, Address=@address, Phone=@phone,
        Ruc=@ruc, IgvRate=@igv, Hours=@hours, UpdatedAt=SYSUTCDATETIME()
      WHERE Id=1
    `)
  res.json({ ok: true })
})

/* ─── Branches ─── */
crudRouter.post('/branches', authRequired, requireRoles('admin'), async (req, res) => {
  const b = req.body as { id?: string; name: string; address: string; phone: string; active?: boolean }
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
    .query(`
      INSERT INTO dbo.Branches (Id, Name, Address, Phone, Active)
      VALUES (@id, @name, @address, @phone, @active)
    `)
  res.status(201).json({ id })
})

crudRouter.put('/branches/:id', authRequired, requireRoles('admin'), async (req, res) => {
  const b = req.body as { name: string; address: string; phone: string; active?: boolean }
  const pool = await getPool()
  await pool
    .request()
    .input('id', sql.UniqueIdentifier, paramId(req.params.id))
    .input('name', sql.NVarChar, b.name)
    .input('address', sql.NVarChar, b.address || '')
    .input('phone', sql.NVarChar, b.phone || '')
    .input('active', sql.Bit, b.active !== false)
    .query(`UPDATE dbo.Branches SET Name=@name, Address=@address, Phone=@phone, Active=@active WHERE Id=@id`)
  res.json({ ok: true })
})

crudRouter.delete('/branches/:id', authRequired, requireRoles('admin'), async (req, res) => {
  const pool = await getPool()
  await pool
    .request()
    .input('id', sql.UniqueIdentifier, paramId(req.params.id))
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
    if (!phone || phone.length < 11) return res.status(400).json({ error: 'Teléfono del cliente obligatorio' })
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
