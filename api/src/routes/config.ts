import { Router } from 'express'
import { getPool, sql } from '../db.js'
import { authRequired, requireRoles } from '../auth.js'
import { sendWhatsAppSoon } from '../lib/wspgo.js'

export const configRouter = Router()

async function getConfig(key: string): Promise<unknown | null> {
  const pool = await getPool()
  const r = await pool
    .request()
    .input('key', sql.NVarChar, key)
    .query(`SELECT ConfigValue FROM dbo.AppConfig WHERE ConfigKey=@key`)
  const row = r.recordset[0]
  if (!row) return null
  try {
    return JSON.parse(String(row.ConfigValue))
  } catch {
    return null
  }
}

async function putConfig(key: string, value: unknown) {
  const pool = await getPool()
  const json = JSON.stringify(value ?? {})
  await pool
    .request()
    .input('key', sql.NVarChar, key)
    .input('value', sql.NVarChar(sql.MAX), json)
    .query(`
      MERGE dbo.AppConfig AS t
      USING (SELECT @key AS ConfigKey) AS s
      ON t.ConfigKey = s.ConfigKey
      WHEN MATCHED THEN UPDATE SET ConfigValue=@value, UpdatedAt=SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT (ConfigKey, ConfigValue) VALUES (@key, @value);
    `)
}

/** Público: banners activos de la web */
configRouter.get('/banners', async (_req, res) => {
  try {
    const data = (await getConfig('web_banners')) as Array<{ active?: boolean }> | null
    const list = Array.isArray(data) ? data.filter((b) => b.active !== false) : []
    res.json({ banners: list })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

/** Admin: todos los banners */
configRouter.get('/banners/all', authRequired, requireRoles('admin'), async (_req, res) => {
  try {
    const data = await getConfig('web_banners')
    res.json({ banners: Array.isArray(data) ? data : [] })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

configRouter.put('/banners', authRequired, requireRoles('admin'), async (req, res) => {
  try {
    const banners = req.body?.banners
    if (!Array.isArray(banners)) return res.status(400).json({ error: 'banners[] requerido' })
    await putConfig('web_banners', banners)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

/** Público: contenido de secciones de la web */
configRouter.get('/website', async (_req, res) => {
  try {
    const data = await getConfig('web_site')
    res.json({ site: data && typeof data === 'object' ? data : null })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

/** Admin: leer / guardar contenido web */
configRouter.get('/website/admin', authRequired, requireRoles('admin'), async (_req, res) => {
  try {
    const data = await getConfig('web_site')
    res.json({ site: data && typeof data === 'object' ? data : null })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

configRouter.put('/website', authRequired, requireRoles('admin'), async (req, res) => {
  try {
    const site = req.body?.site ?? req.body
    if (!site || typeof site !== 'object') return res.status(400).json({ error: 'site requerido' })
    await putConfig('web_site', site)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

configRouter.get('/whatsapp', authRequired, async (_req, res) => {
  try {
    const data = await getConfig('whatsapp')
    res.json({ config: data })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

configRouter.put('/whatsapp', authRequired, requireRoles('admin'), async (req, res) => {
  try {
    await putConfig('whatsapp', req.body?.config ?? req.body)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

/** Envío por el API (no desde el navegador). Responde en ~2 s; el gateway sigue si tarda. */
configRouter.post('/whatsapp/send', authRequired, async (req, res) => {
  const phone = String(req.body?.phone || '').trim()
  const text = String(req.body?.text || '').trim()
  if (!phone || !text) return res.status(400).json({ error: 'phone y text requeridos' })
  try {
    const r = await sendWhatsAppSoon(phone, text)
    res.json({ ok: true, pending: r.pending })
  } catch (e) {
    res.status(502).json({ ok: false, error: (e as Error).message })
  }
})

configRouter.get('/sunat', authRequired, requireRoles('admin'), async (_req, res) => {
  try {
    const data = await getConfig('sunat')
    res.json({ config: data })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

configRouter.put('/sunat', authRequired, requireRoles('admin'), async (req, res) => {
  try {
    await putConfig('sunat', req.body?.config ?? req.body)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

configRouter.get('/invoices', authRequired, requireRoles('admin', 'cajero'), async (_req, res) => {
  try {
    const data = await getConfig('invoices')
    res.json({ invoices: Array.isArray(data) ? data : [] })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

configRouter.put('/invoices', authRequired, requireRoles('admin', 'cajero'), async (req, res) => {
  try {
    const invoices = req.body?.invoices
    if (!Array.isArray(invoices)) return res.status(400).json({ error: 'invoices[] requerido' })
    await putConfig('invoices', invoices)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})
