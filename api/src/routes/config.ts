import fs from 'fs/promises'
import { Router } from 'express'
import multer from 'multer'
import { getPool, sql } from '../db.js'
import { authRequired, requireRoles } from '../auth.js'
import { sendWhatsAppSoon } from '../lib/wspgo.js'
import { lookupFactiliza, factilizaToken } from '../lib/factiliza.js'
import { certificadoInfo, saveCertificado } from '../lib/certificado.js'
import {
  activarEmision, emitirComprobante, estadoEmision, guardarComprobantes, probarSunat, reintentarSunat,
} from '../lib/emision.js'
import {
  comprobanteContentType,
  comprobanteFilePath,
  isComprobanteKind,
  listComprobanteFiles,
} from '../lib/comprobantes.js'

export const configRouter = Router()

const certUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 },
})

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
    const data = (await getConfig('sunat')) as Record<string, unknown> | null
    const config = data && typeof data === 'object' ? { ...data } : {}
    config.claveSolGuardada = Boolean(config.clave)
    config.factilizaTokenGuardado = Boolean(await factilizaToken())
    delete config.clave
    delete config.factilizaToken
    delete config.certificado
    const cert = await certificadoInfo()
    config.certificadoCargado = cert.cargado
    config.certificadoNombre = cert.nombre
    config.certificadoClave = cert.tieneClave
    res.json({ config })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

configRouter.put('/sunat', authRequired, requireRoles('admin'), async (req, res) => {
  try {
    const incoming = (req.body?.config ?? req.body ?? {}) as Record<string, unknown>
    delete incoming.certificadoCargado
    delete incoming.certificadoNombre
    delete incoming.certificadoClave
    delete incoming.claveSolGuardada
    delete incoming.factilizaTokenGuardado
    delete incoming.certificado
    const prev = (await getConfig('sunat')) as Record<string, unknown> | null
    if (!String(incoming.clave || '').trim() && typeof prev?.clave === 'string') {
      incoming.clave = prev.clave
    }
    if (!String(incoming.factilizaToken || '').trim()) {
      const kept = String(prev?.factilizaToken || '').trim()
      if (kept) incoming.factilizaToken = kept
    }
    await putConfig('sunat', incoming)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

configRouter.post('/sunat/prueba', authRequired, requireRoles('admin'), async (req, res) => {
  const tipo = req.body?.tipo
  if (tipo !== 'factura' && tipo !== 'boleta') return res.status(400).json({ error: 'Elige factura o boleta.' })
  try {
    res.json(await probarSunat(tipo))
  } catch (error) {
    res.status(502).json({ error: (error as Error).message || 'SUNAT Beta no respondió.' })
  }
})

/** Guarda el .pfx en el servidor. La clave no vuelve al navegador. */
configRouter.post('/sunat/certificado', authRequired, requireRoles('admin'), (req, res, next) => {
  certUpload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: 'El certificado debe ser .pfx o .p12 y no pasar de 1 MB' })
    next()
  })
}, async (req, res) => {
  try {
    const file = req.file
    const nombre = String(file?.originalname || '')
    if (!file || !/\.(pfx|p12)$/i.test(nombre)) {
      return res.status(400).json({ error: 'Selecciona el archivo .pfx o .p12' })
    }
    const info = await saveCertificado(file.buffer, nombre, String(req.body?.clave || ''))
    res.json({ ok: true, ...info })
  } catch (e) {
    res.status(400).json({ error: (e as Error).message })
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
    await guardarComprobantes(invoices)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

/** Consulta DNI o RUC en Factiliza. El token no sale del servidor. */
configRouter.get('/factiliza/:kind/:numero', authRequired, requireRoles('admin', 'cajero', 'mozo'), async (req, res) => {
  const kind = req.params.kind === 'ruc' ? 'ruc' : req.params.kind === 'dni' ? 'dni' : ''
  const numero = String(req.params.numero || '').replace(/\D/g, '')
  if (!kind) return res.status(400).json({ error: 'Consulta inválida' })
  if (kind === 'dni' && numero.length !== 8) return res.status(400).json({ error: 'El DNI tiene 8 dígitos' })
  if (kind === 'ruc' && numero.length !== 11) return res.status(400).json({ error: 'El RUC tiene 11 dígitos' })
  try {
    const data = await lookupFactiliza(kind, numero)
    res.json(data)
  } catch (e) {
    const status = (e as Error & { status?: number }).status || 502
    res.status(status).json({ error: (e as Error).message })
  }
})

configRouter.get('/emision', authRequired, requireRoles('admin', 'cajero'), async (_req, res) => {
  try {
    res.json(await estadoEmision())
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

configRouter.post('/emision/activar', authRequired, requireRoles('admin', 'cajero'), async (req, res) => {
  try {
    await activarEmision(String(req.body?.clave || ''))
    res.json(await estadoEmision())
  } catch (e) {
    const status = (e as Error & { status?: number }).status || 500
    res.status(status).json({ error: (e as Error).message })
  }
})

configRouter.post('/comprobantes/emit', authRequired, requireRoles('admin', 'cajero'), async (req, res) => {
  try {
    const result = await emitirComprobante(req.body || {})
    res.json({ ok: true, ...result })
  } catch (e) {
    const status = (e as Error & { status?: number }).status || 500
    res.status(status).json({ error: (e as Error).message })
  }
})

configRouter.get('/comprobantes/files', authRequired, requireRoles('admin', 'cajero'), async (_req, res) => {
  try {
    res.json({ files: await listComprobanteFiles() })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

configRouter.post('/comprobantes/:orderId/reintentar', authRequired, requireRoles('admin', 'cajero'), async (req, res) => {
  try {
    res.json({ ok: true, invoice: await reintentarSunat(String(req.params.orderId)) })
  } catch (error) {
    const err = error as Error & { status?: number }
    res.status(err.status || 500).json({ error: err.message })
  }
})

configRouter.get('/comprobantes/:orderId/:kind', authRequired, requireRoles('admin', 'cajero'), async (req, res) => {
  const kind = String(req.params.kind || '')
  if (!isComprobanteKind(kind)) return res.status(400).json({ error: 'Archivo inválido' })
  try {
    const file = comprobanteFilePath(String(req.params.orderId), kind)
    const body = await fs.readFile(file)
    res.setHeader('Content-Type', comprobanteContentType(kind))
    res.setHeader('Content-Disposition', `attachment; filename="${kind}-${req.params.orderId}.${kind === 'cdr' ? 'zip' : kind}"`)
    res.send(body)
  } catch {
    res.status(404).json({ error: 'Todavía no hay archivo en el servidor' })
  }
})
