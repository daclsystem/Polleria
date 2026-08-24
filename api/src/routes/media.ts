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

mediaRouter.get('/config', (_req, res) => {
  res.json({
    bucket,
    publicBase,
    folders: ['products', 'audio', 'media', 'branding', 'docs'],
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
