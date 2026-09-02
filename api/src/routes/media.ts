import { Router } from 'express'
import multer from 'multer'
import * as Minio from 'minio'
import { authRequired } from '../auth.js'

export const mediaRouter = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
})

const endpoint = process.env.MINIO_ENDPOINT || 'igestor.indevsoft.com'
const port = Number(process.env.MINIO_PORT || 9000)
const useSSL = process.env.MINIO_SSL === 'true'
const accessKey = process.env.MINIO_ACCESS_KEY || 'minioadmin'
const secretKey = process.env.MINIO_SECRET_KEY || 'minioadmin123!'
const bucket = process.env.MINIO_BUCKET || 'pollerialopez'
/** URL pública para el front (HTTPS vía proxy /s3 o igestor) */
const publicBase =
  process.env.MINIO_PUBLIC_BASE ||
  `https://apipchifapollerialopez.indevsoft.com/s3/${bucket}`

function client() {
  return new Minio.Client({
    endPoint: endpoint,
    port,
    useSSL,
    accessKey,
    secretKey,
  })
}

function sanitize(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').toLowerCase()
}

function typeFromKey(key: string, fallback: string) {
  if (/\.png$/i.test(key)) return 'image/png'
  if (/\.jpe?g$/i.test(key)) return 'image/jpeg'
  if (/\.webp$/i.test(key)) return 'image/webp'
  if (/\.gif$/i.test(key)) return 'image/gif'
  if (/\.svg$/i.test(key)) return 'image/svg+xml'
  if (/\.mp3$/i.test(key)) return 'audio/mpeg'
  return fallback
}

mediaRouter.get('/config', (_req, res) => {
  res.json({
    bucket,
    publicBase,
    folders: ['products', 'audio', 'media', 'branding', 'docs', 'deliveries'],
  })
})

mediaRouter.post('/upload', authRequired, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file requerido' })
    const folder = String(req.body.folder || 'media').replace(/[^a-z]/g, '') || 'media'
    const ext = (req.file.originalname.split('.').pop() || 'bin').toLowerCase()
    const base = sanitize(req.file.originalname.replace(/\.[^.]+$/, '') || 'file')
    const key = `${folder}/${base}_${Date.now()}.${ext}`

    const mc = client()
    const exists = await mc.bucketExists(bucket)
    if (!exists) {
      await mc.makeBucket(bucket, 'us-east-1')
    }

    await mc.putObject(bucket, key, req.file.buffer, req.file.size, {
      'Content-Type': req.file.mimetype || 'application/octet-stream',
    })

    const url = `${publicBase.replace(/\/$/, '')}/${key}`
    res.status(201).json({ url, key, bucket, folder })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

/** Upload de imagen/audio (carta, cocina). Bucket independiente pollerialopez. */
mediaRouter.post('/upload-public', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file requerido' })
    const isImage = req.file.mimetype.startsWith('image/')
    const isAudio = req.file.mimetype.startsWith('audio/')
    if (!isImage && !isAudio) {
      return res.status(400).json({ error: 'Solo imagen o audio' })
    }
    const requested = String(req.body.folder || '').replace(/[^a-z]/g, '')
    const folder =
      requested === 'products' || requested === 'audio' || requested === 'branding' || requested === 'media'
        ? requested
        : isAudio
          ? 'audio'
          : 'products'
    const ext = (req.file.originalname.split('.').pop() || 'bin').toLowerCase()
    const key = `${folder}/pub_${Date.now()}.${ext}`
    const mc = client()
    if (!(await mc.bucketExists(bucket))) await mc.makeBucket(bucket, 'us-east-1')
    await mc.putObject(bucket, key, req.file.buffer, req.file.size, {
      'Content-Type': req.file.mimetype,
    })
    res.status(201).json({ url: `${publicBase.replace(/\/$/, '')}/${key}`, key })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

/** GET /s3/:bucket/... — el front pide la URL pública; nginx manda todo a Express. */
export async function servePublicObject(req: import('express').Request, res: import('express').Response) {
  const b = String(req.params.bucket || '')
  const fromPath = req.path.replace(/^\/s3\/[^/]+\//, '')
  const key = String(req.params[0] || fromPath || '')
    .replace(/^\/+/, '')
    .replace(/\.\./g, '')
  if (b !== bucket || !key) {
    res.status(404).json({ error: 'Archivo no encontrado' })
    return
  }
  try {
    const mc = client()
    const stat = await mc.statObject(bucket, key)
    const type = typeFromKey(
      key,
      (stat.metaData && (stat.metaData['content-type'] || stat.metaData['Content-Type'])) ||
        'application/octet-stream',
    )
    res.setHeader('Content-Type', String(type))
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    if (stat.size) res.setHeader('Content-Length', String(stat.size))
    const stream = await mc.getObject(bucket, key)
    stream.on('error', () => {
      if (!res.headersSent) res.status(500).end()
    })
    stream.pipe(res)
  } catch {
    res.status(404).json({ error: 'Archivo no encontrado' })
  }
}
