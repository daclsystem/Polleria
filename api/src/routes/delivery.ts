import { Router } from 'express'
import { getPool, sql } from '../db.js'
import { authRequired, requireRoles } from '../auth.js'

export const deliveryRouter = Router()

type GeoRouteResponse = {
  time: number
  distance: number
  route?: { lat: number; lng: number }[]
  status?: number
}

function buildGeoUrl(fromLat: number, fromLng: number, toLat: number, toLng: number) {
  const template =
    process.env.GEO_ROUTE_URL ||
    'https://geo.taximonterrico.com/api/v3/route/{fromLat},{fromLng}/{toLat},{toLng}/-1/{token}'
  const token = process.env.GEO_ROUTE_TOKEN || 'demo'
  return template
    .replace('{fromLat}', String(fromLat))
    .replace('{fromLng}', String(fromLng))
    .replace('{toLat}', String(toLat))
    .replace('{toLng}', String(toLng))
    .replace('{token}', token)
}

async function getOrigin() {
  const pool = await getPool()
  const r = await pool.request().query(`
    SELECT TOP 1 OriginLat, OriginLng, GeoRouteApiUrl, GeoRouteToken
    FROM dbo.Settings WHERE Id = 1
  `)
  const s = r.recordset[0]
  if (!s?.OriginLat || !s?.OriginLng) {
    const err = new Error('Configura OriginLat/OriginLng en Settings') as Error & { status: number }
    err.status = 400
    throw err
  }
  return {
    lat: Number(s.OriginLat),
    lng: Number(s.OriginLng),
    template: s.GeoRouteApiUrl as string | null,
    token: (s.GeoRouteToken as string) || process.env.GEO_ROUTE_TOKEN || 'demo',
  }
}

async function feeForDistance(km: number) {
  const pool = await getPool()
  const r = await pool.request().input('km', sql.Decimal(8, 2), km).query(`
    SELECT TOP 1 Id, Name, DistanceKmFrom, DistanceKmTo, Fee
    FROM dbo.DeliveryRanges
    WHERE Active = 1
      AND DistanceKmFrom <= @km
      AND (DistanceKmTo IS NULL OR @km < DistanceKmTo)
    ORDER BY SortOrder ASC, DistanceKmFrom ASC
  `)
  return r.recordset[0] as
    | { Id: string; Name: string; DistanceKmFrom: number; DistanceKmTo: number | null; Fee: number }
    | undefined
}

/** Calcula distancia real (ruta) + fee por rango administrable */
deliveryRouter.post('/quote', async (req, res) => {
  try {
    const { lat, lng } = req.body as { lat?: number; lng?: number }
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ error: 'lat y lng requeridos' })
    }

    const origin = await getOrigin()
    const template =
      origin.template ||
      process.env.GEO_ROUTE_URL ||
      'https://geo.taximonterrico.com/api/v3/route/{fromLat},{fromLng}/{toLat},{toLng}/-1/{token}'

    const url = template
      .replace('{fromLat}', String(origin.lat))
      .replace('{fromLng}', String(origin.lng))
      .replace('{toLat}', String(lat))
      .replace('{toLng}', String(lng))
      .replace('{token}', origin.token)

    const geoRes = await fetch(url)
    if (!geoRes.ok) {
      return res.status(502).json({ error: 'No se pudo calcular la ruta', detail: geoRes.status })
    }
    const geo = (await geoRes.json()) as GeoRouteResponse
    const distanceKm = Number(geo.distance)
    const timeMin = Number(geo.time)

    const range = await feeForDistance(distanceKm)
    if (!range || Number(range.Fee) <= 0) {
      return res.status(422).json({
        error: 'Fuera de cobertura de delivery',
        distanceKm,
        timeMin,
      })
    }

    return res.json({
      distanceKm,
      timeMin,
      fee: Number(range.Fee),
      range: {
        id: range.Id,
        name: range.Name,
        fromKm: Number(range.DistanceKmFrom),
        toKm: range.DistanceKmTo == null ? null : Number(range.DistanceKmTo),
      },
      route: geo.route ?? [],
      geoUrlUsed: buildGeoUrl(origin.lat, origin.lng, lat, lng),
    })
  } catch (err) {
    const e = err as Error & { status?: number }
    return res.status(e.status || 500).json({ error: e.message || 'Error calculando delivery' })
  }
})

deliveryRouter.get('/ranges', async (_req, res) => {
  const pool = await getPool()
  const r = await pool.request().query(`
    SELECT Id, Name, DistanceKmFrom, DistanceKmTo, Fee, SortOrder, Active
    FROM dbo.DeliveryRanges
    ORDER BY SortOrder, DistanceKmFrom
  `)
  res.json({ ranges: r.recordset })
})

deliveryRouter.put('/ranges', authRequired, requireRoles('admin'), async (req, res) => {
  const ranges = req.body?.ranges as Array<{
    id?: string
    name: string
    distanceKmFrom: number
    distanceKmTo: number | null
    fee: number
    sortOrder: number
    active: boolean
  }>

  if (!Array.isArray(ranges)) return res.status(400).json({ error: 'ranges[] requerido' })

  const pool = await getPool()
  const tx = new sql.Transaction(pool)
  await tx.begin()
  try {
    await new sql.Request(tx).query(`DELETE FROM dbo.DeliveryRanges`)
    for (const row of ranges) {
      await new sql.Request(tx)
        .input('name', sql.NVarChar, row.name)
        .input('from', sql.Decimal(8, 2), row.distanceKmFrom)
        .input('to', sql.Decimal(8, 2), row.distanceKmTo)
        .input('fee', sql.Decimal(10, 2), row.fee)
        .input('sort', sql.Int, row.sortOrder)
        .input('active', sql.Bit, row.active)
        .query(`
          INSERT INTO dbo.DeliveryRanges (Name, DistanceKmFrom, DistanceKmTo, Fee, SortOrder, Active)
          VALUES (@name, @from, @to, @fee, @sort, @active)
        `)
    }
    await tx.commit()
    res.json({ ok: true })
  } catch (e) {
    await tx.rollback()
    res.status(500).json({ error: (e as Error).message })
  }
})
