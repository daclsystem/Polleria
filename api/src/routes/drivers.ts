import { Router } from 'express'
import { v4 as uuid } from 'uuid'
import { getPool, sql } from '../db.js'
import { authRequired, requireRoles } from '../auth.js'
import { emitEvent, roomsForOrderStatus } from '../realtime.js'
import { notifyOrderStatusServer } from '../lib/whatsappNotify.js'

export const driversRouter = Router()

function paramId(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value
}

function isGuid(id?: string) {
  return Boolean(id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
}

function isDriver(req: { user?: { accountType?: string; role?: string } }) {
  return req.user?.accountType === 'driver' || req.user?.role === 'driver'
}

function mapDriver(r: Record<string, unknown>) {
  const name = String(r.Name || 'Conductor')
  return {
    id: String(r.Id),
    name: r.Name,
    phone: r.Phone,
    active: Boolean(r.Active),
    vehicleInfo: r.VehicleInfo || undefined,
    plate: r.Plate ? String(r.Plate) : undefined,
    photoUrl:
      r.PhotoUrl ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0f766e&color=ffffff&size=128&bold=true`,
    lat: r.Lat != null ? Number(r.Lat) : undefined,
    lng: r.Lng != null ? Number(r.Lng) : undefined,
  }
}

async function ensureDriverPlate(pool: Awaited<ReturnType<typeof getPool>>) {
  await pool.request().query(`
    IF COL_LENGTH('dbo.Drivers', 'Plate') IS NULL
      ALTER TABLE dbo.Drivers ADD Plate NVARCHAR(20) NULL;
  `)
}

function mapDeliveryOrder(o: Record<string, unknown>) {
  return {
    id: String(o.Id),
    number: Number(o.Number),
    type: String(o.Type || ''),
    status: String(o.Status || ''),
    customerName: String(o.CustomerName || ''),
    customerPhone: o.CustomerPhone ? String(o.CustomerPhone) : undefined,
    address: o.Address ? String(o.Address) : undefined,
    addressLat: o.AddressLat != null ? Number(o.AddressLat) : undefined,
    addressLng: o.AddressLng != null ? Number(o.AddressLng) : undefined,
    total: Number(o.Total),
    paid: Boolean(o.Paid),
    deliveryFee: Number(o.DeliveryFee || 0),
    deliveryDistanceKm: o.DeliveryDistanceKm != null ? Number(o.DeliveryDistanceKm) : undefined,
    driverId: o.DriverId ? String(o.DriverId) : undefined,
    driverLat: o.DriverLat != null ? Number(o.DriverLat) : undefined,
    driverLng: o.DriverLng != null ? Number(o.DriverLng) : undefined,
    driverAssignedAt: o.DriverAssignedAt
      ? new Date(o.DriverAssignedAt as string).toISOString()
      : undefined,
    driverArrivedAt: o.DriverArrivedAt
      ? new Date(o.DriverArrivedAt as string).toISOString()
      : undefined,
    deliveryPhotoUrl: o.DeliveryPhotoUrl ? String(o.DeliveryPhotoUrl) : undefined,
    driverCollectedMethod: o.DriverCollectedMethod ? String(o.DriverCollectedMethod) : undefined,
    driverCollectedAmount:
      o.DriverCollectedAmount != null ? Number(o.DriverCollectedAmount) : undefined,
    driverSettledAt: o.DriverSettledAt
      ? new Date(o.DriverSettledAt as string).toISOString()
      : undefined,
    createdAt: new Date(o.CreatedAt as string).toISOString(),
    notes: o.Notes ? String(o.Notes) : undefined,
    codPaymentMethod: o.CodPaymentMethod ? String(o.CodPaymentMethod) : undefined,
  }
}

async function ensureDriverFlowColumns(pool: Awaited<ReturnType<typeof getPool>>) {
  try {
    await pool.request().query(`
      IF COL_LENGTH('dbo.Orders', 'DriverArrivedAt') IS NULL
        ALTER TABLE dbo.Orders ADD DriverArrivedAt DATETIME2(0) NULL;
      IF COL_LENGTH('dbo.Orders', 'DeliveryPhotoUrl') IS NULL
        ALTER TABLE dbo.Orders ADD DeliveryPhotoUrl NVARCHAR(500) NULL;
      IF COL_LENGTH('dbo.Orders', 'DriverCollectedMethod') IS NULL
        ALTER TABLE dbo.Orders ADD DriverCollectedMethod NVARCHAR(20) NULL;
      IF COL_LENGTH('dbo.Orders', 'DriverCollectedAmount') IS NULL
        ALTER TABLE dbo.Orders ADD DriverCollectedAmount DECIMAL(10,2) NULL;
      IF COL_LENGTH('dbo.Orders', 'DriverSettledAt') IS NULL
        ALTER TABLE dbo.Orders ADD DriverSettledAt DATETIME2(0) NULL;
    `)
  } catch {
    /* ignore */
  }
}

async function getStoreOrigin() {
  const pool = await getPool()
  const r = await pool.request().query(`
    SELECT TOP 1 Name, Address, OriginLat, OriginLng FROM dbo.Settings WHERE Id = 1
  `)
  const s = r.recordset[0]
  return {
    name: String(s?.Name || 'Local'),
    address: String(s?.Address || ''),
    lat: s?.OriginLat != null ? Number(s.OriginLat) : undefined,
    lng: s?.OriginLng != null ? Number(s.OriginLng) : undefined,
  }
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const x =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

function orderStopsNearest(
  origin: { lat: number; lng: number },
  stops: Array<ReturnType<typeof mapDeliveryOrder>>,
) {
  const withCoords = stops.filter((s) => s.addressLat != null && s.addressLng != null)
  const without = stops.filter((s) => s.addressLat == null || s.addressLng == null)
  const remaining = [...withCoords]
  const ordered: typeof stops = []
  let cur = origin
  while (remaining.length) {
    remaining.sort(
      (a, b) =>
        haversineKm(cur, { lat: a.addressLat!, lng: a.addressLng! }) -
        haversineKm(cur, { lat: b.addressLat!, lng: b.addressLng! }),
    )
    const next = remaining.shift()!
    ordered.push(next)
    cur = { lat: next.addressLat!, lng: next.addressLng! }
  }
  return [...ordered, ...without]
}

function buildGoogleMapsUrl(
  origin: { lat?: number; lng?: number; address?: string },
  stops: Array<{ address?: string; addressLat?: number; addressLng?: number }>,
) {
  if (!stops.length) return null
  const dest = stops[stops.length - 1]
  const waypoints = stops.slice(0, -1)
  const point = (s: { address?: string; addressLat?: number; addressLng?: number }) => {
    if (s.addressLat != null && s.addressLng != null) return `${s.addressLat},${s.addressLng}`
    return s.address || ''
  }
  const destination = point(dest)
  if (!destination) return null
  const params = new URLSearchParams({ api: '1', travelmode: 'driving', destination })
  if (origin.lat != null && origin.lng != null) params.set('origin', `${origin.lat},${origin.lng}`)
  else if (origin.address) params.set('origin', origin.address)
  if (waypoints.length) {
    params.set('waypoints', waypoints.map(point).filter(Boolean).join('|'))
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

/** Staff: listar conductores */
driversRouter.get('/', authRequired, requireRoles('admin', 'cajero', 'mozo'), async (_req, res) => {
  const pool = await getPool()
  await ensureDriverPlate(pool)
  const r = await pool.request().query(`SELECT * FROM dbo.Drivers ORDER BY Name`)
  res.json({ drivers: r.recordset.map(mapDriver) })
})

driversRouter.post('/', authRequired, requireRoles('admin'), async (req, res) => {
  const body = req.body as {
    id?: string
    name: string
    phone: string
    active?: boolean
    vehicleInfo?: string
    plate?: string
    photoUrl?: string
  }
  if (!body.name || !body.phone) return res.status(400).json({ error: 'name y phone requeridos' })
  const id = isGuid(body.id) ? body.id! : uuid()
  let phone = body.phone.replace(/\D/g, '')
  if (phone.length === 9 && phone.startsWith('9')) phone = `51${phone}`
  const photo =
    body.photoUrl ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(body.name)}&background=0f766e&color=ffffff&size=128&bold=true`

  const pool = await getPool()
  await ensureDriverPlate(pool)
  await pool
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .input('name', sql.NVarChar, body.name)
    .input('phone', sql.NVarChar, phone)
    .input('active', sql.Bit, body.active !== false)
    .input('vehicle', sql.NVarChar, body.vehicleInfo || null)
    .input('plate', sql.NVarChar, body.plate ? String(body.plate).trim().toUpperCase() : null)
    .input('photo', sql.NVarChar, photo)
    .query(`
      INSERT INTO dbo.Drivers (Id, Name, Phone, Active, VehicleInfo, Plate, PhotoUrl)
      VALUES (@id, @name, @phone, @active, @vehicle, @plate, @photo)
    `)
  res.status(201).json({ id, photoUrl: photo })
})

driversRouter.put('/:id', authRequired, requireRoles('admin'), async (req, res) => {
  const body = req.body as {
    name: string
    phone: string
    active?: boolean
    vehicleInfo?: string
    plate?: string
    photoUrl?: string
  }
  let phone = String(body.phone || '').replace(/\D/g, '')
  if (phone.length === 9 && phone.startsWith('9')) phone = `51${phone}`
  const photo =
    body.photoUrl ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(body.name || 'Conductor')}&background=0f766e&color=ffffff&size=128&bold=true`
  const pool = await getPool()
  await ensureDriverPlate(pool)
  await pool
    .request()
    .input('id', sql.UniqueIdentifier, paramId(req.params.id))
    .input('name', sql.NVarChar, body.name)
    .input('phone', sql.NVarChar, phone)
    .input('active', sql.Bit, body.active !== false)
    .input('vehicle', sql.NVarChar, body.vehicleInfo || null)
    .input('plate', sql.NVarChar, body.plate ? String(body.plate).trim().toUpperCase() : null)
    .input('photo', sql.NVarChar, photo)
    .query(`
      UPDATE dbo.Drivers
      SET Name=@name, Phone=@phone, Active=@active, VehicleInfo=@vehicle, Plate=@plate, PhotoUrl=@photo, UpdatedAt=SYSUTCDATETIME()
      WHERE Id=@id
    `)
  res.json({ ok: true })
})

driversRouter.delete('/:id', authRequired, requireRoles('admin'), async (req, res) => {
  const pool = await getPool()
  await pool
    .request()
    .input('id', sql.UniqueIdentifier, paramId(req.params.id))
    .query(`UPDATE dbo.Drivers SET Active=0, UpdatedAt=SYSUTCDATETIME() WHERE Id=@id`)
  res.json({ ok: true })
})

/** Staff: asignar conductor a un pedido delivery */
driversRouter.post('/assign', authRequired, requireRoles('admin', 'cajero', 'mozo'), async (req, res) => {
  try {
    const orderId = String(req.body?.orderId || '')
    const driverId = req.body?.driverId ? String(req.body.driverId) : ''
    if (!isGuid(orderId)) return res.status(400).json({ error: 'orderId inválido' })
    if (driverId && !isGuid(driverId)) return res.status(400).json({ error: 'driverId inválido' })

    const pool = await getPool()
    const order = await pool
      .request()
      .input('id', sql.UniqueIdentifier, orderId)
      .query(`SELECT TOP 1 * FROM dbo.Orders WHERE Id=@id`)
    const row = order.recordset[0]
    if (!row) return res.status(404).json({ error: 'Pedido no encontrado' })
    if (row.Type !== 'delivery' && row.Type !== 'web') {
      return res.status(400).json({ error: 'Solo pedidos delivery / web' })
    }
    if (!row.Address) return res.status(400).json({ error: 'El pedido no tiene dirección' })

    if (driverId) {
      const drv = await pool
        .request()
        .input('id', sql.UniqueIdentifier, driverId)
        .query(`SELECT TOP 1 Id, Name, Active FROM dbo.Drivers WHERE Id=@id`)
      if (!drv.recordset[0]?.Active) return res.status(400).json({ error: 'Conductor inactivo' })
    }

    await pool
      .request()
      .input('id', sql.UniqueIdentifier, orderId)
      .input('driverId', sql.UniqueIdentifier, driverId || null)
      .query(`
        UPDATE dbo.Orders
        SET DriverId=@driverId,
            DriverAssignedAt=CASE WHEN @driverId IS NULL THEN NULL ELSE SYSUTCDATETIME() END,
            UpdatedAt=SYSUTCDATETIME()
        WHERE Id=@id
      `)

    const updated = await pool
      .request()
      .input('id', sql.UniqueIdentifier, orderId)
      .query(`SELECT * FROM dbo.Orders WHERE Id=@id`)
    const mapped = mapDeliveryOrder(updated.recordset[0])
    emitEvent('order:driver', mapped, ['ops', 'caja', 'delivery'])
    res.json({ ok: true, order: mapped })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

async function computeDriverEarnings(pool: Awaited<ReturnType<typeof getPool>>, driverId: string) {
  const rateRow = await pool.request().query(`
    SELECT TOP 1 ISNULL(DeliveryFee, 5) AS Rate FROM dbo.Settings
  `)
  const rate = Number(rateRow.recordset[0]?.Rate || 5)
  const r = await pool.request().input('driverId', sql.UniqueIdentifier, driverId).input('rate', sql.Decimal(10, 2), rate)
    .query(`
      SELECT
        SUM(CASE WHEN CAST(COALESCE(DriverSettledAt, UpdatedAt, CreatedAt) AS DATE) = CAST(SYSUTCDATETIME() AS DATE) THEN 1 ELSE 0 END) AS todayTrips,
        SUM(CASE WHEN CAST(COALESCE(DriverSettledAt, UpdatedAt, CreatedAt) AS DATE) = CAST(SYSUTCDATETIME() AS DATE) THEN CASE WHEN ISNULL(DeliveryFee,0) > 0 THEN DeliveryFee ELSE @rate END ELSE 0 END) AS todayTotal,
        SUM(CASE WHEN COALESCE(DriverSettledAt, UpdatedAt, CreatedAt) >= DATEADD(day, -7, SYSUTCDATETIME()) THEN 1 ELSE 0 END) AS weekTrips,
        SUM(CASE WHEN COALESCE(DriverSettledAt, UpdatedAt, CreatedAt) >= DATEADD(day, -7, SYSUTCDATETIME()) THEN CASE WHEN ISNULL(DeliveryFee,0) > 0 THEN DeliveryFee ELSE @rate END ELSE 0 END) AS weekTotal,
        COUNT(*) AS monthTrips,
        SUM(CASE WHEN ISNULL(DeliveryFee,0) > 0 THEN DeliveryFee ELSE @rate END) AS monthTotal
      FROM dbo.Orders
      WHERE DriverId = @driverId
        AND Status = N'entregado'
        AND COALESCE(DriverSettledAt, UpdatedAt, CreatedAt) >= DATEADD(day, -30, SYSUTCDATETIME())
    `)
  const row = r.recordset[0] || {}
  return {
    rate,
    today: { trips: Number(row.todayTrips || 0), total: Number(row.todayTotal || 0) },
    week: { trips: Number(row.weekTrips || 0), total: Number(row.weekTotal || 0) },
    month: { trips: Number(row.monthTrips || 0), total: Number(row.monthTotal || 0) },
  }
}

/** Conductor: mis entregas activas + pendientes de liquidar en base */
driversRouter.get('/me/orders', authRequired, async (req, res) => {
  if (!isDriver(req)) return res.status(403).json({ error: 'Solo conductores' })
  try {
    const pool = await getPool()
    await ensureDriverFlowColumns(pool)
    const driverId = req.user!.id
    const r = await pool
      .request()
      .input('driverId', sql.UniqueIdentifier, driverId)
      .query(`
        SELECT TOP 80 Id, Number, Type, Status, CustomerName, CustomerPhone, Address,
               AddressLat, AddressLng, Total, Paid, DeliveryFee, DeliveryDistanceKm,
               DriverId, DriverLat, DriverLng, DriverAssignedAt, CreatedAt, UpdatedAt, Notes, CodPaymentMethod,
               DriverArrivedAt, DeliveryPhotoUrl, DriverCollectedMethod, DriverCollectedAmount, DriverSettledAt
        FROM dbo.Orders
        WHERE Type IN (N'delivery', N'web')
          AND DriverId = @driverId
          AND (
            Status IN (N'en_cocina', N'listo')
            OR (Status = N'entregado' AND Paid = 0 AND DriverSettledAt IS NULL)
          )
        ORDER BY
          CASE Status WHEN N'listo' THEN 0 WHEN N'en_cocina' THEN 1 WHEN N'entregado' THEN 2 ELSE 3 END,
          DriverAssignedAt ASC, CreatedAt ASC
      `)

    const mine = r.recordset.map(mapDeliveryOrder)
    const origin = await getStoreOrigin()
    const earnings = await computeDriverEarnings(pool, driverId)

    res.json({ mine, available: [], orders: mine, origin, earnings })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

/** Conductor: ya no se auto-asigna. Solo mozo/caja con POST /assign. */
driversRouter.post('/me/claim', authRequired, async (_req, res) => {
  return res.status(403).json({
    error: 'El repartidor no puede tomar pedidos. El mozo o caja debe asignarlo.',
  })
})

/** Conductor: ya no suelta solo. Reasignación desde caja/mozo. */
driversRouter.post('/me/release', authRequired, async (_req, res) => {
  return res.status(403).json({
    error: 'Para quitar o cambiar repartidor, hazlo desde Ver pedidos (mozo/caja).',
  })
})

/** 1) Ubicado en el domicilio del cliente */
driversRouter.post('/me/arrived', authRequired, async (req, res) => {
  if (!isDriver(req)) return res.status(403).json({ error: 'Solo conductores' })
  try {
    const orderId = String(req.body?.orderId || '')
    if (!isGuid(orderId)) return res.status(400).json({ error: 'orderId inválido' })
    const pool = await getPool()
    await ensureDriverFlowColumns(pool)
    const existing = await pool
      .request()
      .input('id', sql.UniqueIdentifier, orderId)
      .input('driverId', sql.UniqueIdentifier, req.user!.id)
      .query(`SELECT TOP 1 * FROM dbo.Orders WHERE Id=@id AND DriverId=@driverId`)
    const row = existing.recordset[0]
    if (!row) return res.status(404).json({ error: 'Pedido no asignado a ti' })
    if (row.Status === 'cancelado') return res.status(400).json({ error: 'Pedido cancelado' })
    if (row.Status === 'entregado') return res.json({ ok: true, order: mapDeliveryOrder(row) })

    await pool
      .request()
      .input('id', sql.UniqueIdentifier, orderId)
      .query(`
        UPDATE dbo.Orders
        SET DriverArrivedAt = ISNULL(DriverArrivedAt, SYSUTCDATETIME()),
            UpdatedAt = SYSUTCDATETIME()
        WHERE Id=@id
      `)

    const updated = await pool
      .request()
      .input('id', sql.UniqueIdentifier, orderId)
      .query(`SELECT TOP 1 * FROM dbo.Orders WHERE Id=@id`)
    const mapped = mapDeliveryOrder(updated.recordset[0])
    emitEvent('order:updated', mapped, ['ops', 'caja', 'delivery', 'cocina'])
    res.json({ ok: true, order: mapped })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

/** 2) Entregado — requiere haber marcado ubicado + foto de entrega */
driversRouter.post('/me/delivered', authRequired, async (req, res) => {
  if (!isDriver(req)) return res.status(403).json({ error: 'Solo conductores' })
  try {
    const orderId = String(req.body?.orderId || '')
    const photoUrl = String(req.body?.photoUrl || '').trim()
    if (!isGuid(orderId)) return res.status(400).json({ error: 'orderId inválido' })
    if (!photoUrl || photoUrl.length < 8) {
      return res.status(400).json({ error: 'Debes tomar/subir la foto de entrega' })
    }
    const pool = await getPool()
    await ensureDriverFlowColumns(pool)
    const existing = await pool
      .request()
      .input('id', sql.UniqueIdentifier, orderId)
      .input('driverId', sql.UniqueIdentifier, req.user!.id)
      .query(`SELECT TOP 1 * FROM dbo.Orders WHERE Id=@id AND DriverId=@driverId`)
    const row = existing.recordset[0]
    if (!row) return res.status(404).json({ error: 'Pedido no asignado a ti' })
    if (row.Status === 'entregado') {
      return res.json({ ok: true, order: mapDeliveryOrder(row) })
    }
    if (row.Status === 'cancelado') return res.status(400).json({ error: 'Pedido cancelado' })
    if (!row.DriverArrivedAt) {
      return res.status(400).json({ error: 'Primero marca Ubicado en el domicilio' })
    }

    await pool
      .request()
      .input('id', sql.UniqueIdentifier, orderId)
      .input('photo', sql.NVarChar, photoUrl.slice(0, 500))
      .query(`
        UPDATE dbo.Orders
        SET Status = N'entregado',
            DeliveryPhotoUrl = @photo,
            UpdatedAt = SYSUTCDATETIME()
        WHERE Id = @id
      `)

    const updated = await pool
      .request()
      .input('id', sql.UniqueIdentifier, orderId)
      .query(`SELECT TOP 1 * FROM dbo.Orders WHERE Id=@id`)
    const order = updated.recordset[0]
    const mapped = mapDeliveryOrder(order)
    emitEvent('order:status', mapped, roomsForOrderStatus('entregado'))
    notifyOrderStatusServer(
      {
        Id: order.Id,
        Number: order.Number,
        CustomerName: order.CustomerName,
        CustomerPhone: order.CustomerPhone,
        Total: order.Total,
        Type: order.Type,
        Address: order.Address,
        Status: 'entregado',
      },
      'entregado',
    ).catch((e) => console.warn('[whatsapp] driver delivered', (e as Error).message))

    res.json({ ok: true, order: mapped })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

/**
 * 3) En base: reportar cobro del cliente (liquidación).
 * Si ya estaba pagado online, solo confirma liquidación.
 */
driversRouter.post('/me/settle', authRequired, async (req, res) => {
  if (!isDriver(req)) return res.status(403).json({ error: 'Solo conductores' })
  try {
    const orderId = String(req.body?.orderId || '')
    const method = String(req.body?.method || '').toLowerCase()
    const amount = Number(req.body?.amount)
    if (!isGuid(orderId)) return res.status(400).json({ error: 'orderId inválido' })
    if (!['efectivo', 'yape', 'plin', 'ya_pagado'].includes(method)) {
      return res.status(400).json({ error: 'method: efectivo | yape | plin | ya_pagado' })
    }
    const pool = await getPool()
    await ensureDriverFlowColumns(pool)
    const existing = await pool
      .request()
      .input('id', sql.UniqueIdentifier, orderId)
      .input('driverId', sql.UniqueIdentifier, req.user!.id)
      .query(`SELECT TOP 1 * FROM dbo.Orders WHERE Id=@id AND DriverId=@driverId`)
    const row = existing.recordset[0]
    if (!row) return res.status(404).json({ error: 'Pedido no asignado a ti' })
    if (row.Status !== 'entregado') {
      return res.status(400).json({ error: 'Solo se liquida después de Entregado' })
    }
    if (row.DriverSettledAt) {
      return res.json({ ok: true, order: mapDeliveryOrder(row) })
    }

    const paidAlready = Boolean(row.Paid)
    const finalMethod = paidAlready ? 'ya_pagado' : method
    const finalAmount =
      paidAlready || method === 'ya_pagado'
        ? Number(row.Total)
        : Number.isFinite(amount) && amount > 0
          ? amount
          : Number(row.Total)

    if (!paidAlready && method === 'ya_pagado') {
      return res.status(400).json({ error: 'Este pedido no figuraba pagado: indica efectivo/yape/plin' })
    }

    await pool
      .request()
      .input('id', sql.UniqueIdentifier, orderId)
      .input('method', sql.NVarChar, finalMethod)
      .input('amount', sql.Decimal(10, 2), finalAmount)
      .input('markPaid', sql.Bit, paidAlready ? 1 : 1)
      .query(`
        UPDATE dbo.Orders
        SET DriverCollectedMethod = @method,
            DriverCollectedAmount = @amount,
            DriverSettledAt = SYSUTCDATETIME(),
            Paid = CASE WHEN @markPaid = 1 THEN 1 ELSE Paid END,
            UpdatedAt = SYSUTCDATETIME()
        WHERE Id = @id
      `)

    // Registrar pago en caja si cobró en puerta
    if (!paidAlready && finalMethod !== 'ya_pagado') {
      try {
        const { v4: uuid } = await import('uuid')
        await pool
          .request()
          .input('id', sql.UniqueIdentifier, uuid())
          .input('orderId', sql.UniqueIdentifier, orderId)
          .input('method', sql.NVarChar, finalMethod === 'plin' ? 'yape' : finalMethod)
          .input('amount', sql.Decimal(10, 2), finalAmount)
          .input('userId', sql.UniqueIdentifier, req.user!.id)
          .query(`
            IF OBJECT_ID(N'dbo.OrderPayments', N'U') IS NOT NULL
            INSERT INTO dbo.OrderPayments (Id, OrderId, Method, Amount, CreatedByUserId)
            VALUES (@id, @orderId, @method, @amount, @userId)
          `)
      } catch {
        /* ignore if payments schema differs */
      }
    }

    const updated = await pool
      .request()
      .input('id', sql.UniqueIdentifier, orderId)
      .query(`SELECT TOP 1 * FROM dbo.Orders WHERE Id=@id`)
    const mapped = mapDeliveryOrder(updated.recordset[0])
    emitEvent('order:paid', mapped, ['ops', 'caja', 'delivery'])
    emitEvent('order:updated', mapped, ['ops', 'caja', 'delivery'])
    res.json({ ok: true, order: mapped })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

/** Conductor: ruta optimizada de sus entregas */
driversRouter.get('/me/route', authRequired, async (req, res) => {
  if (!isDriver(req)) return res.status(403).json({ error: 'Solo conductores' })
  try {
    const pool = await getPool()
    const driverId = req.user!.id
    const [ordersRes, driverRes, origin] = await Promise.all([
      pool
        .request()
        .input('driverId', sql.UniqueIdentifier, driverId)
        .query(`
          SELECT Id, Number, Type, Status, CustomerName, CustomerPhone, Address,
                 AddressLat, AddressLng, Total, Paid, DeliveryFee, DeliveryDistanceKm,
                 DriverId, DriverLat, DriverLng, DriverAssignedAt, CreatedAt, UpdatedAt, Notes, CodPaymentMethod
          FROM dbo.Orders
          WHERE DriverId=@driverId
            AND Type IN (N'delivery', N'web')
            AND Status IN (N'en_cocina', N'listo')
            AND Address IS NOT NULL AND Address <> N''
          ORDER BY DriverAssignedAt ASC, CreatedAt ASC
        `),
      pool
        .request()
        .input('id', sql.UniqueIdentifier, driverId)
        .query(`SELECT Lat, Lng FROM dbo.Drivers WHERE Id=@id`),
      getStoreOrigin(),
    ])

    const stopsRaw = ordersRes.recordset.map(mapDeliveryOrder)
    const drv = driverRes.recordset[0]
    const start =
      drv?.Lat != null && drv?.Lng != null
        ? { lat: Number(drv.Lat), lng: Number(drv.Lng) }
        : origin.lat != null && origin.lng != null
          ? { lat: origin.lat, lng: origin.lng }
          : null

    const stops = start ? orderStopsNearest(start, stopsRaw) : stopsRaw
    const mapsOrigin = start
      ? { lat: start.lat, lng: start.lng, address: origin.address }
      : { address: origin.address }
    const googleMapsUrl = buildGoogleMapsUrl(mapsOrigin, stops)

    res.json({
      origin: {
        ...origin,
        lat: start?.lat ?? origin.lat,
        lng: start?.lng ?? origin.lng,
      },
      stops: stops.map((s, idx) => ({ ...s, sequence: idx + 1 })),
      googleMapsUrl,
      count: stops.length,
    })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

/** Conductor: actualizar ubicación (y propagar a pedidos activos) */
driversRouter.post('/me/location', authRequired, async (req, res) => {
  if (!isDriver(req)) return res.status(403).json({ error: 'Solo conductores' })
  const lat = Number(req.body?.lat)
  const lng = Number(req.body?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'lat/lng requeridos' })
  }
  const pool = await getPool()
  const driverId = req.user!.id
  await pool
    .request()
    .input('id', sql.UniqueIdentifier, driverId)
    .input('lat', sql.Decimal(10, 7), lat)
    .input('lng', sql.Decimal(10, 7), lng)
    .query(`
      UPDATE dbo.Drivers SET Lat=@lat, Lng=@lng, UpdatedAt=SYSUTCDATETIME() WHERE Id=@id
    `)

  const orderId = req.body?.orderId as string | undefined
  if (orderId && isGuid(orderId)) {
    await pool
      .request()
      .input('orderId', sql.UniqueIdentifier, orderId)
      .input('driverId', sql.UniqueIdentifier, driverId)
      .input('lat', sql.Decimal(10, 7), lat)
      .input('lng', sql.Decimal(10, 7), lng)
      .query(`
        UPDATE dbo.Orders
        SET DriverLat=@lat, DriverLng=@lng, UpdatedAt=SYSUTCDATETIME()
        WHERE Id=@orderId AND DriverId=@driverId
      `)
  } else {
    // Sin orderId: actualizar todos los pedidos activos del conductor
    // para que el mapa del cliente vea la posición en vivo.
    await pool
      .request()
      .input('driverId', sql.UniqueIdentifier, driverId)
      .input('lat', sql.Decimal(10, 7), lat)
      .input('lng', sql.Decimal(10, 7), lng)
      .query(`
        UPDATE dbo.Orders
        SET DriverLat=@lat, DriverLng=@lng, UpdatedAt=SYSUTCDATETIME()
        WHERE DriverId=@driverId
          AND Status IN (N'nuevo', N'en_cocina', N'listo')
      `)
  }

  const active = await pool
    .request()
    .input('driverId', sql.UniqueIdentifier, driverId)
    .query(`
      SELECT Id FROM dbo.Orders
      WHERE DriverId=@driverId AND Status IN (N'nuevo', N'en_cocina', N'listo')
    `)

  const rooms = ['delivery', ...active.recordset.map((r: { Id: string }) => `track:${String(r.Id)}`)]
  emitEvent(
    'driver:location',
    { driverId, lat, lng, orderIds: active.recordset.map((r: { Id: string }) => String(r.Id)) },
    rooms,
  )

  res.json({ ok: true })
})

/** Conductor: actualizar su perfil (nombre, foto) */
driversRouter.patch('/me', authRequired, async (req, res) => {
  if (!isDriver(req)) return res.status(403).json({ error: 'Solo conductores' })
  try {
    const driverId = req.user!.id
    const { name, photoUrl } = req.body as { name?: string; photoUrl?: string }
    const pool = await getPool()
    const sets: string[] = []
    const rq = pool.request().input('id', sql.UniqueIdentifier, driverId)
    if (name && name.trim()) {
      sets.push('Name = @name')
      rq.input('name', sql.NVarChar, name.trim().slice(0, 120))
    }
    if (photoUrl !== undefined) {
      sets.push('PhotoUrl = @photo')
      rq.input('photo', sql.NVarChar, photoUrl || null)
    }
    if (sets.length === 0) {
      return res.status(400).json({ error: 'Nada que actualizar' })
    }
    sets.push('UpdatedAt = SYSUTCDATETIME()')
    await rq.query(`UPDATE dbo.Drivers SET ${sets.join(', ')} WHERE Id = @id`)
    const r = await pool.request().input('id', sql.UniqueIdentifier, driverId).query(`SELECT * FROM dbo.Drivers WHERE Id = @id`)
    const row = r.recordset[0]
    if (!row) return res.status(404).json({ error: 'Conductor no encontrado' })
    res.json({ driver: mapDriver(row) })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

/** Conductor: ver sus ganancias (entregas y totales por día/semana/mes) */
driversRouter.get('/me/earnings', authRequired, async (req, res) => {
  if (!isDriver(req)) return res.status(403).json({ error: 'Solo conductores' })
  try {
    const pool = await getPool()
    const earnings = await computeDriverEarnings(pool, req.user!.id)
    res.json(earnings)
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})
