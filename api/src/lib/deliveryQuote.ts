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

async function getOrigin() {
  const pool = await getPool()
  const r = await pool.request().query(`
    SELECT TOP 1 OriginLat, OriginLng, GeoRouteToken, DeliveryFee
    FROM dbo.Settings WHERE Id = 1
  `)
  const s = r.recordset[0]
  if (!s?.OriginLat || !s?.OriginLng) {
    const err = new Error('Configura la ubicación del local en Sistema → Configuración') as Error & {
      status: number
    }
    err.status = 400
    throw err
  }
  return {
    lat: Number(s.OriginLat),
    lng: Number(s.OriginLng),
    token: (s.GeoRouteToken as string) || process.env.GEO_ROUTE_TOKEN || 'demo',
    fallbackFee: Number(s.DeliveryFee || 5),
  }
}

async function feeForDistance(km: number, fallbackFee: number) {
  const pool = await getPool()
  const r = await pool.request().input('km', sql.Decimal(8, 2), km).query(`
    SELECT TOP 1 Name, Fee
    FROM dbo.DeliveryRanges
    WHERE Active = 1
      AND DistanceKmFrom <= @km
      AND (DistanceKmTo IS NULL OR @km < DistanceKmTo)
    ORDER BY SortOrder ASC, DistanceKmFrom ASC
  `)
  const row = r.recordset[0] as { Name?: string; Fee?: number } | undefined
  if (row && Number(row.Fee) > 0) {
    return { fee: Number(row.Fee), rangeName: String(row.Name || '') }
  }
  return { fee: fallbackFee, rangeName: 'Tarifa local' }
}

export async function quoteDeliveryPoint(lat: number, lng: number): Promise<DeliveryQuote> {
  const origin = await getOrigin()
  const geo = await geoRoute({ lat: origin.lat, lng: origin.lng }, { lat, lng }, origin.token)
  const priced = await feeForDistance(geo.distanceKm, origin.fallbackFee)
  return {
    lat,
    lng,
    distanceKm: geo.distanceKm,
    timeMin: geo.timeMin,
    fee: priced.fee,
    rangeName: priced.rangeName,
  }
}

export async function quoteDeliveryAddress(address: string): Promise<DeliveryQuote> {
  const matches = await geoPlaceSearch(address)
  const first = matches[0]
  if (!first) {
    const err = new Error('No se encontró esa dirección. Elige una del mapa o GPS.') as Error & {
      status: number
    }
    err.status = 422
    throw err
  }
  return quoteDeliveryPoint(first.lat, first.lng)
}
