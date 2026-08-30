import { Router } from 'express'
import { geoGeocode, geoPlaceSearch, geoRoute } from '../lib/geo.js'

export const geoRouter = Router()

/** Distancia + tiempo + polyline entre dos puntos */
geoRouter.get('/route', async (req, res) => {
  try {
    const fromLat = Number(req.query.fromLat)
    const fromLng = Number(req.query.fromLng)
    const toLat = Number(req.query.toLat)
    const toLng = Number(req.query.toLng)
    if (![fromLat, fromLng, toLat, toLng].every(Number.isFinite)) {
      return res.status(400).json({ error: 'fromLat, fromLng, toLat, toLng requeridos' })
    }
    const result = await geoRoute({ lat: fromLat, lng: fromLng }, { lat: toLat, lng: toLng })
    res.json(result)
  } catch (e) {
    res.status(502).json({ error: (e as Error).message || 'Error de ruta' })
  }
})

/** Coordenadas → dirección */
geoRouter.get('/geocode', async (req, res) => {
  try {
    const lat = Number(req.query.lat)
    const lng = Number(req.query.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'lat y lng requeridos' })
    }
    const result = await geoGeocode(lat, lng)
    res.json(result)
  } catch (e) {
    res.status(502).json({ error: (e as Error).message || 'Error de geocoding' })
  }
})

/** Texto → coincidencias de dirección */
geoRouter.get('/place', async (req, res) => {
  try {
    const q = String(req.query.q || req.query.query || '').trim()
    if (q.length < 3) return res.json({ matches: [] })
    const matches = await geoPlaceSearch(q)
    res.json({ matches })
  } catch (e) {
    res.status(502).json({ error: (e as Error).message || 'Error de búsqueda' })
  }
})
