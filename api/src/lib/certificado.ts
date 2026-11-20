import fs from 'fs/promises'
import path from 'path'
import { pkcs12SigningKeys } from './sunat.js'

/** El .pfx queda en el servidor, fuera de la web y fuera de la configuración que ve el navegador. */
export function certificadoDir() {
  if (process.env.CERTIFICADO_DIR) return process.env.CERTIFICADO_DIR
  if (process.env.COMPROBANTES_DIR) return path.resolve(process.env.COMPROBANTES_DIR, '..', 'sunat')
  return path.resolve(process.cwd(), 'storage', 'sunat')
}

function paths() {
  const dir = certificadoDir()
  return {
    dir,
    pfx: path.join(dir, 'certificado.pfx'),
    pass: path.join(dir, 'certificado.pass'),
    meta: path.join(dir, 'certificado.json'),
  }
}

export async function certificadoInfo() {
  const { pfx, meta } = paths()
  let nombre = ''
  let tieneClave = false
  try {
    const raw = JSON.parse(await fs.readFile(meta, 'utf8')) as { nombre?: string; tieneClave?: boolean }
    nombre = String(raw.nombre || '')
    tieneClave = Boolean(raw.tieneClave)
  } catch {
    nombre = ''
  }
  let cargado = false
  try {
    const stat = await fs.stat(pfx)
    cargado = stat.isFile() && stat.size > 0
  } catch {
    cargado = false
  }
  return { cargado, nombre: cargado ? nombre || 'certificado.pfx' : '', tieneClave: cargado && tieneClave }
}

export async function leerCertificado() {
  const { pfx, pass } = paths()
  try {
    const [archivo, clave] = await Promise.all([fs.readFile(pfx), fs.readFile(pass, 'utf8')])
    return { archivo, clave }
  } catch {
    throw Object.assign(new Error('Carga el certificado .p12 o .pfx y su clave en Configurar SUNAT.'), { status: 400 })
  }
}

export async function saveCertificado(body: Buffer, nombreOriginal: string, clave: string) {
  if (!Buffer.isBuffer(body) || body.length < 32 || body.length > 1024 * 1024) {
    throw new Error('El certificado no es válido')
  }
  if (body[0] !== 0x30) throw new Error('El archivo tiene que ser el .pfx o .p12, no el .cer')
  const claveLimpia = clave.trim()
  if (claveLimpia.length < 8) throw new Error('La clave del certificado tiene al menos 8 caracteres')
  pkcs12SigningKeys(body, claveLimpia)
  const nombre = path.basename(nombreOriginal).replace(/[^\w.\- ]+/g, '_') || 'certificado.pfx'
  const { dir, pfx, pass, meta } = paths()
  await fs.mkdir(dir, { recursive: true, mode: 0o700 })
  await fs.writeFile(pfx, body, { mode: 0o600 })
  await fs.writeFile(pass, claveLimpia, { mode: 0o600 })
  await fs.writeFile(meta, JSON.stringify({ nombre, tieneClave: true }))
  return certificadoInfo()
}
