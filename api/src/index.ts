import express from 'express'
import cors from 'cors'
import http from 'http'
import dotenv from 'dotenv'
import { getPool } from './db.js'
import { initRealtime } from './realtime.js'
import { authRouter } from './auth.js'
import { recoverRouter } from './routes/recover.js'
import { catalogRouter } from './routes/catalog.js'
import { deliveryRouter } from './routes/delivery.js'
import { geoRouter } from './routes/geo.js'
import { systemRouter } from './routes/system.js'
import { ordersRouter } from './routes/orders.js'
import { mediaRouter } from './routes/media.js'
import { crudRouter } from './routes/crud.js'
import { configRouter } from './routes/config.js'
import { otpAuthRouter } from './routes/otpAuth.js'
import { driversRouter } from './routes/drivers.js'
import { couponsRouter } from './routes/coupons.js'
import { customerAddressesRouter } from './routes/customerAddresses.js'
import { reviewsRouter } from './routes/reviews.js'

dotenv.config()

const PORT = Number(process.env.PORT || 3080)
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5174')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

function allowOrigin(origin?: string) {
  if (!origin) return true
  if (corsOrigins.includes(origin)) return true
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true
  return false
}

const app = express()
app.use(
  cors({
    origin: (origin, cb) => cb(null, allowOrigin(origin)),
    credentials: true,
  }),
)
app.use(express.json({ limit: '2mb' }))

app.get('/health', async (_req, res) => {
  try {
    const pool = await getPool()
    await pool.request().query('SELECT 1 AS ok')
    res.json({ ok: true, db: true, realtime: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: (e as Error).message })
  }
})

app.use('/api/auth', authRouter)
app.use('/api/auth/recover', recoverRouter)
app.use('/api/auth/otp', otpAuthRouter)
app.use('/api/drivers', driversRouter)
app.use('/api/catalog', catalogRouter)
app.use('/api/delivery', deliveryRouter)
app.use('/api/geo', geoRouter)
app.use('/api/system', systemRouter)
app.use('/api/orders', ordersRouter)
app.use('/api/media', mediaRouter)
app.use('/api/config', configRouter)
app.use('/api/coupons', couponsRouter)
app.use('/api/customer/addresses', customerAddressesRouter)
app.use('/api/reviews', reviewsRouter)
app.use('/api', crudRouter)

app.use((_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' })
})

const server = http.createServer(app)
initRealtime(server, corsOrigins)

server.listen(PORT, async () => {
  try {
    await getPool()
    console.log(`[polleria-api] http://localhost:${PORT}`)
    console.log(`[polleria-api] realtime path: /realtime`)
    console.log(`[polleria-api] DB conectada`)
  } catch (e) {
    console.error('[polleria-api] No se pudo conectar a SQL Server:', (e as Error).message)
    console.error('Revisa api/.env (DB_SERVER, DB_USER, DB_PASSWORD, DB_NAME)')
  }
})
