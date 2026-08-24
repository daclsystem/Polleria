import { Router } from 'express'
import { v4 as uuid } from 'uuid'
import { getPool, sql } from '../db.js'
import { authRequired, requireRoles } from '../auth.js'
import { emitEvent } from '../realtime.js'
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
    photoUrl:
      r.PhotoUrl ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0f766e&color=ffffff&size=128&bold=true`,
    lat: r.Lat != null ? Number(r.Lat) : undefined,
    lng: r.Lng != null ? Number(r.Lng) : undefined,
  }
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
    createdAt: new Date(o.CreatedAt as string).toISOString(),
    notes: o.Notes ? String(o.Notes) : undefined,
    codPaymentMethod: o.CodPaymentMethod ? String(o.CodPaymentMethod) : undefined,
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
  await pool
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .input('name', sql.NVarChar, body.name)
    .input('phone', sql.NVarChar, phone)
    .input('active', sql.Bit, body.active !== false)
    .input('vehicle', sql.NVarChar, body.vehicleInfo || null)
    .input('photo', sql.NVarChar, photo)
    .query(`
      INSERT INTO dbo.Drivers (Id, Name, Phone, Active, VehicleInfo, PhotoUrl)
      VALUES (@id, @name, @phone, @active, @vehicle, @photo)
    `)
  res.status(201).json({ id, photoUrl: photo })
})

driversRouter.put('/:id', authRequired, requireRoles('admin'), async (req, res) => {
  const body = req.body as {
    name: string
    phone: string
    active?: boolean
    vehicleInfo?: string
    photoUrl?: string
  }
  let phone = String(body.phone || '').replace(/\D/g, '')
  if (phone.length === 9 && phone.startsWith('9')) phone = `51${phone}`
  const photo =
    body.photoUrl ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(body.name || 'Conductor')}&background=0f766e&color=ffffff&size=128&bold=true`
  const pool = await getPool()
  await pool
    .request()
    .input('id', sql.UniqueIdentifier, paramId(req.params.id))
    .input('name', sql.NVarChar, body.name)
    .input('phone', sql.NVarChar, phone)
    .input('active', sql.Bit, body.active !== false)
    .input('vehicle', sql.NVarChar, body.vehicleInfo || null)
    .input('photo', sql.NVarChar, photo)
    .query(`
      UPDATE dbo.Drivers
      SET Name=@name, Phone=@phone, Active=@active, VehicleInfo=@vehicle, PhotoUrl=@photo, UpdatedAt=SYSUTCDATETIME()
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

/** Conductor: mis pedidos + disponibles para tomar */
driversRouter.get('/me/orders', authRequired, async (req, res) => {
  if (!isDriver(req)) return res.status(403).json({ error: 'Solo conductores' })
  try {
    const pool = await getPool()
    const driverId = req.user!.id
    const r = await pool
      .request()
      .input('driverId', sql.UniqueIdentifier, driverId)
      .query(`
        SELECT TOP 80 Id, Number, Type, Status, CustomerName, CustomerPhone, Address,
               AddressLat, AddressLng, Total, Paid, DeliveryFee, DeliveryDistanceKm,
               DriverId, DriverLat, DriverLng, DriverAssignedAt, CreatedAt, UpdatedAt, Notes, CodPaymentMethod
        FROM dbo.Orders
        WHERE Type IN (N'delivery', N'web')
          AND Status IN (N'nuevo', N'en_cocina', N'listo')
          AND (Address IS NOT NULL AND Address <> N'')
          AND (
            DriverId = @driverId
            OR DriverId IS NULL
          )
        ORDER BY
          CASE WHEN DriverId = @driverId THEN 0 ELSE 1 END,
          CASE Status WHEN N'listo' THEN 0 WHEN N'en_cocina' THEN 1 ELSE 2 END,
          CreatedAt ASC
      `)

    const all = r.recordset.map(mapDeliveryOrder)
    const mine = all.filter((o) => o.driverId === driverId)
    const available = all.filter((o) => !o.driverId && (o.status === 'listo' || o.status === 'en_cocina'))
    const origin = await getStoreOrigin()

    res.json({ mine, available, orders: [...mine, ...available], origin })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

/** Conductor: tomar / reclamar un pedido libre */
driversRouter.post('/me/claim', authRequired, async (req, res) => {
  if (!isDriver(req)) return res.status(403).json({ error: 'Solo conductores' })
  try {
    const orderId = String(req.body?.orderId || '')
    if (!isGuid(orderId)) return res.status(400).json({ error: 'orderId inválido' })
    const pool = await getPool()
    const driverId = req.user!.id

    const result = await pool
      .request()
      .input('id', sql.UniqueIdentifier, orderId)
      .input('driverId', sql.UniqueIdentifier, driverId)
      .query(`
        UPDATE dbo.Orders
        SET DriverId=@driverId, DriverAssignedAt=SYSUTCDATETIME(), UpdatedAt=SYSUTCDATETIME()
        WHERE Id=@id
          AND Type IN (N'delivery', N'web')
          AND Status IN (N'en_cocina', N'listo')
          AND DriverId IS NULL
          AND Address IS NOT NULL AND Address <> N''
      `)

    if (!result.rowsAffected[0]) {
      return res.status(409).json({ error: 'Pedido no disponible (ya asignado o no listo)' })
    }

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

/** Conductor: soltar pedido */
driversRouter.post('/me/release', authRequired, async (req, res) => {
  if (!isDriver(req)) return res.status(403).json({ error: 'Solo conductores' })
  try {
    const orderId = String(req.body?.orderId || '')
    if (!isGuid(orderId)) return res.status(400).json({ error: 'orderId inválido' })
    const pool = await getPool()
    const result = await pool
      .request()
      .input('id', sql.UniqueIdentifier, orderId)
      .input('driverId', sql.UniqueIdentifier, req.user!.id)
      .query(`
        UPDATE dbo.Orders
        SET DriverId=NULL, DriverAssignedAt=NULL, UpdatedAt=SYSUTCDATETIME()
        WHERE Id=@id AND DriverId=@driverId AND Status <> N'entregado'
      `)
    if (!result.rowsAffected[0]) return res.status(409).json({ error: 'No puedes soltar este pedido' })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

/** Conductor: marcar entregado */
driversRouter.post('/me/delivered', authRequired, async (req, res) => {
  if (!isDriver(req)) return res.status(403).json({ error: 'Solo conductores' })
  try {
    const orderId = String(req.body?.orderId || '')
    if (!isGuid(orderId)) return res.status(400).json({ error: 'orderId inválido' })
    const pool = await getPool()
    const existing = await pool
      .request()
      .input('id', sql.UniqueIdentifier, orderId)
      .input('driverId', sql.UniqueIdentifier, req.user!.id)
      .query(`SELECT TOP 1 * FROM dbo.Orders WHERE Id=@id AND DriverId=@driverId`)
    const row = existing.recordset[0]
    if (!row) return res.status(404).json({ error: 'Pedido no asignado a ti' })
    if (row.Status === 'entregado') return res.json({ ok: true })
    if (row.Status === 'cancelado') return res.status(400).json({ error: 'Pedido cancelado' })

    await pool
      .request()
      .input('id', sql.UniqueIdentifier, orderId)
      .query(`UPDATE dbo.Orders SET Status=N'entregado', UpdatedAt=SYSUTCDATETIME() WHERE Id=@id`)

    const order = { ...row, Status: 'entregado' }
    emitEvent('order:status', order, ['ops', 'cocina', 'caja', 'mesas', 'delivery'])
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

    res.json({ ok: true })
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

/** Conductor: actualizar ubicación */
driversRouter.post('/me/location', authRequired, async (req, res) => {
  if (!isDriver(req)) return res.status(403).json({ error: 'Solo conductores' })
  const lat = Number(req.body?.lat)
  const lng = Number(req.body?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'lat/lng requeridos' })
  }
  const pool = await getPool()
  await pool
    .request()
    .input('id', sql.UniqueIdentifier, req.user!.id)
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
      .input('driverId', sql.UniqueIdentifier, req.user!.id)
      .input('lat', sql.Decimal(10, 7), lat)
      .input('lng', sql.Decimal(10, 7), lng)
      .query(`
        UPDATE dbo.Orders
        SET DriverLat=@lat, DriverLng=@lng, UpdatedAt=SYSUTCDATETIME()
        WHERE Id=@orderId AND DriverId=@driverId
      `)
  }

  res.json({ ok: true })
})
