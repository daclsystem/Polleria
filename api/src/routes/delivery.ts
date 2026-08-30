import { Router } from 'express'
import { getPool, sql } from '../db.js'
import { authRequired, requireRoles } from '../auth.js'
import { quoteDeliveryAddress, quoteDeliveryPoint } from '../lib/deliveryQuote.js'

export const deliveryRouter = Router()

function asGuid(id?: string | null) {
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return null
  }
  return id
}

/** Calcula distancia/tiempo (origen de la sede) + tarifa de rangos */
deliveryRouter.post('/quote', async (req, res) => {
  try {
    const { lat, lng, address, branchId } = req.body as {
      lat?: number
      lng?: number
      address?: string
      branchId?: string
    }
    const quoted =
      typeof lat === 'number' && typeof lng === 'number'
        ? await quoteDeliveryPoint(lat, lng, branchId)
        : String(address || '').trim()
          ? await quoteDeliveryAddress(String(address), branchId)
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

deliveryRouter.get('/ranges', async (req, res) => {
  const branchId = asGuid(String(req.query.branchId || ''))
  const pool = await getPool()
  const reqSql = pool.request()
  if (branchId) reqSql.input('bid', sql.UniqueIdentifier, branchId)
  const r = await reqSql.query(`
    SELECT Id, BranchId, Name, DistanceKmFrom, DistanceKmTo, Fee, SortOrder, Active
    FROM dbo.DeliveryRanges
    ${branchId ? 'WHERE BranchId = @bid' : 'WHERE BranchId IS NULL'}
    ORDER BY SortOrder, DistanceKmFrom
  `)

  let rows = r.recordset
  if (branchId && rows.length === 0) {
    const global = await pool.request().query(`
      SELECT Id, BranchId, Name, DistanceKmFrom, DistanceKmTo, Fee, SortOrder, Active
      FROM dbo.DeliveryRanges
      WHERE BranchId IS NULL
      ORDER BY SortOrder, DistanceKmFrom
    `)
    rows = global.recordset
  }

  res.json({
    ranges: rows.map((row: Record<string, unknown>) => ({
      id: String(row.Id),
      branchId: row.BranchId ? String(row.BranchId) : undefined,
      name: row.Name,
      distanceKmFrom: Number(row.DistanceKmFrom),
      distanceKmTo: row.DistanceKmTo != null ? Number(row.DistanceKmTo) : null,
      fee: Number(row.Fee),
      sortOrder: Number(row.SortOrder),
      active: Boolean(row.Active),
    })),
  })
})

deliveryRouter.put('/ranges', authRequired, requireRoles('admin'), async (req, res) => {
  const branchId = asGuid(String(req.body?.branchId || ''))
  const ranges = req.body?.ranges as Array<{
    id?: string
    name: string
    distanceKmFrom: number
    distanceKmTo: number | null
    fee: number
    sortOrder: number
    active: boolean
  }>

  if (!Array.isArray(ranges) || ranges.length === 0) {
    return res.status(400).json({ error: 'ranges[] requerido' })
  }

  const pool = await getPool()
  const tx = new sql.Transaction(pool)
  await tx.begin()
  try {
    const wipe = new sql.Request(tx)
    if (branchId) {
      await wipe
        .input('bid', sql.UniqueIdentifier, branchId)
        .query(`DELETE FROM dbo.DeliveryRanges WHERE BranchId = @bid`)
    } else {
      await wipe.query(`DELETE FROM dbo.DeliveryRanges WHERE BranchId IS NULL`)
    }

    const insertRows = async (forBranch: string | null) => {
      for (const row of ranges) {
        const name = String(row.name || '').trim()
        if (!name) continue
        const q = new sql.Request(tx)
          .input('name', sql.NVarChar, name)
          .input('from', sql.Decimal(8, 2), Number(row.distanceKmFrom || 0))
          .input('to', sql.Decimal(8, 2), row.distanceKmTo == null ? null : Number(row.distanceKmTo))
          .input('fee', sql.Decimal(10, 2), Math.max(0, Number(row.fee || 0)))
          .input('sort', sql.Int, Number(row.sortOrder || 0))
          .input('active', sql.Bit, row.active !== false)
        if (forBranch) {
          q.input('bid', sql.UniqueIdentifier, forBranch)
          await q.query(`
            INSERT INTO dbo.DeliveryRanges (BranchId, Name, DistanceKmFrom, DistanceKmTo, Fee, SortOrder, Active)
            VALUES (@bid, @name, @from, @to, @fee, @sort, @active)
          `)
        } else {
          await q.query(`
            INSERT INTO dbo.DeliveryRanges (Name, DistanceKmFrom, DistanceKmTo, Fee, SortOrder, Active)
            VALUES (@name, @from, @to, @fee, @sort, @active)
          `)
        }
      }
    }

    await insertRows(branchId)

    if (branchId) {
      const primary = await new sql.Request(tx)
        .input('bid', sql.UniqueIdentifier, branchId)
        .query(`
          SELECT TOP 1 Id, Lat, Lng
          FROM dbo.Branches
          WHERE Id = @bid AND Active = 1
        `)
      const first = await new sql.Request(tx).query(`
        SELECT TOP 1 Id FROM dbo.Branches WHERE Active = 1 ORDER BY CreatedAt
      `)
      const isPrimary = String(first.recordset[0]?.Id || '') === branchId
      if (isPrimary) {
        await new sql.Request(tx).query(`DELETE FROM dbo.DeliveryRanges WHERE BranchId IS NULL`)
        await insertRows(null)
        const loc = primary.recordset[0]
        if (loc?.Lat != null && loc?.Lng != null) {
          await new sql.Request(tx)
            .input('lat', sql.Decimal(10, 7), Number(loc.Lat))
            .input('lng', sql.Decimal(10, 7), Number(loc.Lng))
            .query(`
              UPDATE dbo.Settings
              SET OriginLat=@lat, OriginLng=@lng, DeliveryFee=3, UpdatedAt=SYSUTCDATETIME()
              WHERE Id=1
            `)
        }
      }
    }

    await tx.commit()
    res.json({ ok: true })
  } catch (e) {
    await tx.rollback()
    res.status(500).json({ error: (e as Error).message })
  }
})
