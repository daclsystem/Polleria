import { getPool, sql } from '../db.js'
import { geoPlaceSearch, geoRoute } from './geo.js'

export type DeliveryQuote = {
  lat: number
  lng: number
  distanceKm: number
  timeMin: number
  fee: number
  rangeName?: string
}

function asGuid(id?: string | null) {
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return null
  }
  return id
}

function fail(message: string, status: number) {
  const err = new Error(message) as Error & { status: number }
  err.status = status
  return err
}

async function getOrigin(branchId?: string | null) {
  const pool = await getPool()
  const guid = asGuid(branchId)

  const settings = await pool.request().query(`
    SELECT TOP 1 OriginLat, OriginLng, GeoRouteToken, DeliveryFee
    FROM dbo.Settings WHERE Id = 1
  `)
  const s = settings.recordset[0]
  const token = (s?.GeoRouteToken as string) || process.env.GEO_ROUTE_TOKEN || 'demo'
  const fallbackFee = Number(s?.DeliveryFee || 3)

  if (guid) {
    const b = await pool
      .request()
      .input('id', sql.UniqueIdentifier, guid)
      .query(`SELECT TOP 1 Lat, Lng FROM dbo.Branches WHERE Id = @id AND Active = 1`)
    const row = b.recordset[0]
    if (row?.Lat != null && row?.Lng != null) {
      return { lat: Number(row.Lat), lng: Number(row.Lng), token, fallbackFee, branchId: guid }
    }
  }

  const first = await pool.request().query(`
    SELECT TOP 1 Id, Lat, Lng
    FROM dbo.Branches
    WHERE Active = 1 AND Lat IS NOT NULL AND Lng IS NOT NULL
    ORDER BY CreatedAt
  `)
  const br = first.recordset[0]
  if (br?.Lat != null && br?.Lng != null) {
    return {
      lat: Number(br.Lat),
      lng: Number(br.Lng),
      token,
      fallbackFee,
      branchId: String(br.Id),
    }
  }

  if (!s?.OriginLat || !s?.OriginLng) {
    throw fail('Configura la ubicación del local en Sistema → Sucursales', 400)
  }
  return {
    lat: Number(s.OriginLat),
    lng: Number(s.OriginLng),
    token,
    fallbackFee,
    branchId: null as string | null,
  }
}

async function feeForDistance(km: number, fallbackFee: number, branchId?: string | null) {
  const pool = await getPool()
  const guid = asGuid(branchId)

  const pick = async (forBranch: string | null) => {
    const req = pool.request().input('km', sql.Decimal(8, 2), km)
    if (forBranch) {
      req.input('bid', sql.UniqueIdentifier, forBranch)
      return req.query(`
        SELECT TOP 1 Name, Fee
        FROM dbo.DeliveryRanges
        WHERE Active = 1
          AND BranchId = @bid
          AND DistanceKmFrom <= @km
          AND (DistanceKmTo IS NULL OR @km < DistanceKmTo)
        ORDER BY SortOrder ASC, DistanceKmFrom ASC
      `)
    }
    return req.query(`
      SELECT TOP 1 Name, Fee
      FROM dbo.DeliveryRanges
      WHERE Active = 1
        AND BranchId IS NULL
        AND DistanceKmFrom <= @km
        AND (DistanceKmTo IS NULL OR @km < DistanceKmTo)
      ORDER BY SortOrder ASC, DistanceKmFrom ASC
    `)
  }

  const countFor = async (forBranch: string | null) => {
    if (forBranch) {
      const r = await pool
        .request()
        .input('bid', sql.UniqueIdentifier, forBranch)
        .query(`SELECT COUNT(*) AS c FROM dbo.DeliveryRanges WHERE BranchId = @bid`)
      return Number(r.recordset[0].c || 0)
    }
    const r = await pool.request().query(`SELECT COUNT(*) AS c FROM dbo.DeliveryRanges WHERE BranchId IS NULL`)
    return Number(r.recordset[0].c || 0)
  }

  const scoped = guid && (await countFor(guid)) > 0
  const r = await pick(scoped ? guid : null)
  const row = r.recordset[0] as { Name?: string; Fee?: number } | undefined

  if (row) {
    if (Number(row.Fee) <= 0) {
      throw fail('Fuera de cobertura de delivery', 422)
    }
    return { fee: Number(row.Fee), rangeName: String(row.Name || '') }
  }

  const total = (guid ? await countFor(guid) : 0) + (await countFor(null))
  if (total === 0) {
    return { fee: fallbackFee, rangeName: 'Tarifa local' }
  }
  throw fail('Fuera de cobertura de delivery', 422)
}

export async function quoteDeliveryPoint(
  lat: number,
  lng: number,
  branchId?: string | null,
): Promise<DeliveryQuote> {
  const origin = await getOrigin(branchId)
  const geo = await geoRoute({ lat: origin.lat, lng: origin.lng }, { lat, lng }, origin.token)
  const priced = await feeForDistance(geo.distanceKm, origin.fallbackFee, origin.branchId || branchId)
  return {
    lat,
    lng,
    distanceKm: geo.distanceKm,
    timeMin: geo.timeMin,
    fee: priced.fee,
    rangeName: priced.rangeName,
  }
}

export async function quoteDeliveryAddress(
  address: string,
  branchId?: string | null,
): Promise<DeliveryQuote> {
  const matches = await geoPlaceSearch(address)
  const first = matches[0]
  if (!first) {
    throw fail('No se encontró esa dirección. Elige una del mapa o GPS.', 422)
  }
  return quoteDeliveryPoint(first.lat, first.lng, branchId)
}
