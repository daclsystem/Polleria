import { Router } from 'express'
import { getPool, sql } from '../db.js'
import { authRequired, requireRoles } from '../auth.js'
import { quoteDeliveryAddress, quoteDeliveryPoint } from '../lib/deliveryQuote.js'

export const deliveryRouter = Router()

/** Calcula distancia/tiempo (origen del local) + tarifa de rangos o Settings.DeliveryFee */
deliveryRouter.post('/quote', async (req, res) => {
  try {
    const { lat, lng, address } = req.body as { lat?: number; lng?: number; address?: string }
    const quoted =
      typeof lat === 'number' && typeof lng === 'number'
        ? await quoteDeliveryPoint(lat, lng)
        : String(address || '').trim()
          ? await quoteDeliveryAddress(String(address))
          : null
    if (!quoted) return res.status(400).json({ error: 'lat/lng o address requeridos' })

    return res.json({
      distanceKm: quoted.distanceKm,
      timeMin: quoted.timeMin,
      fee: quoted.fee,
      lat: quoted.lat,
      lng: quoted.lng,
      range: quoted.rangeName ? { name: quoted.rangeName } : undefined,
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
