import { getPool, sql } from '../db.js'

const FACTILIZA = 'https://api.factiliza.com/v1'

export async function factilizaToken() {
  const fromEnv = String(process.env.FACTILIZA_TOKEN || '').trim()
  try {
    const pool = await getPool()
    const r = await pool
      .request()
      .input('key', sql.NVarChar, 'sunat')
      .query(`SELECT ConfigValue FROM dbo.AppConfig WHERE ConfigKey=@key`)
    const raw = r.recordset[0]?.ConfigValue
    if (raw) {
      const config = JSON.parse(String(raw)) as { factilizaToken?: string }
      const saved = String(config.factilizaToken || '').trim()
      if (saved) return saved
    }
  } catch {
    /* la configuración todavía no existe */
  }
  return fromEnv
}

export async function lookupFactiliza(kind: 'dni' | 'ruc', numero: string) {
  const token = await factilizaToken()
  if (!token) {
    const err = new Error('Falta el token de Factiliza en la configuración')
    ;(err as Error & { status?: number }).status = 400
    throw err
  }
  const res = await fetch(`${FACTILIZA}/${kind}/info/${encodeURIComponent(numero)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  const body = (await res.json().catch(() => null)) as {
    success?: boolean
    message?: string
    data?: {
      nombre_completo?: string
      nombres?: string
      apellido_paterno?: string
      apellido_materno?: string
      nombre_o_razon_social?: string
      direccion_completa?: string
      direccion?: string
    }
  } | null
  if (!res.ok || body?.success === false) {
    throw new Error(body?.message || `Factiliza respondió ${res.status}`)
  }
  const data = body?.data
  const nombre = kind === 'ruc'
    ? String(data?.nombre_o_razon_social || '').trim()
    : String(
        data?.nombre_completo
          || [data?.nombres, data?.apellido_paterno, data?.apellido_materno].filter(Boolean).join(' '),
      ).trim()
  const direccion = String(data?.direccion_completa || data?.direccion || '').trim()
  return { nombre, direccion }
}
