import { Router } from 'express'
import { v4 as uuid } from 'uuid'
import { getPool, sql } from '../db.js'
import { authRequired, requireRoles } from '../auth.js'

export const driversRouter = Router()

function paramId(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value
}

function isGuid(id?: string) {
  return Boolean(id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
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

/** Admin: listar conductores */
driversRouter.get('/', authRequired, requireRoles('admin', 'cajero'), async (_req, res) => {
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

/** Conductor: pedidos delivery activos */
driversRouter.get('/me/orders', authRequired, async (req, res) => {
  if (req.user?.accountType !== 'driver' && req.user?.role !== 'driver') {
    return res.status(403).json({ error: 'Solo conductores' })
  }
  const pool = await getPool()
  const r = await pool.request().query(`
    SELECT TOP 50 Id, Number, Status, CustomerName, CustomerPhone, Address, Total, Paid,
           DeliveryFee, DeliveryDistanceKm, DriverLat, DriverLng, CreatedAt, UpdatedAt, Notes
    FROM dbo.Orders
    WHERE Type IN (N'delivery', N'web')
      AND Status IN (N'nuevo', N'en_cocina', N'listo')
      AND (Address IS NOT NULL AND Address <> N'')
    ORDER BY CreatedAt ASC
  `)
  res.json({
    orders: r.recordset.map((o: Record<string, unknown>) => ({
      id: String(o.Id),
      number: Number(o.Number),
      status: o.Status,
      customerName: o.CustomerName,
      customerPhone: o.CustomerPhone || undefined,
      address: o.Address || undefined,
      total: Number(o.Total),
      paid: Boolean(o.Paid),
      deliveryFee: Number(o.DeliveryFee || 0),
      deliveryDistanceKm: o.DeliveryDistanceKm != null ? Number(o.DeliveryDistanceKm) : undefined,
      driverLat: o.DriverLat != null ? Number(o.DriverLat) : undefined,
      driverLng: o.DriverLng != null ? Number(o.DriverLng) : undefined,
      createdAt: new Date(o.CreatedAt as string).toISOString(),
      notes: o.Notes || undefined,
    })),
  })
})

/** Conductor: actualizar ubicación */
driversRouter.post('/me/location', authRequired, async (req, res) => {
  if (req.user?.accountType !== 'driver' && req.user?.role !== 'driver') {
    return res.status(403).json({ error: 'Solo conductores' })
  }
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
      .input('lat', sql.Decimal(10, 7), lat)
      .input('lng', sql.Decimal(10, 7), lng)
      .query(`UPDATE dbo.Orders SET DriverLat=@lat, DriverLng=@lng, UpdatedAt=SYSUTCDATETIME() WHERE Id=@orderId`)
  }

  res.json({ ok: true })
})
