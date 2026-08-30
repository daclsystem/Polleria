import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { v4 as uuid } from 'uuid'
import { getPool, sql } from '../db.js'
import { signToken, type AuthUser } from '../auth.js'
import { rotateSession } from '../session.js'

export const otpAuthRouter = Router()

const WSP_BASE = process.env.WSPGO_BASE_URL || 'https://iwspgo.indevsoft.com'
const WSP_KEY = process.env.WSPGO_API_KEY || '753ce43470bc2ad5b72bce84a7080d7ec92f77a6690bff51e5e03a5cd14eb6e0'
const WSP_SESSION = process.env.WSPGO_SESSION || 'PolleriaLopez'
const OTP_TTL_MIN = 10
/** Código de respaldo si WhatsApp / iwspgo está caído */
const OTP_FALLBACK = String(process.env.OTP_FALLBACK_CODE || '123456').trim()

type AccountType = 'staff' | 'customer' | 'driver'
type Purpose = 'login' | 'register'

function normalizePhone(phone: string) {
  let digits = phone.replace(/\D/g, '')
  if (digits.length === 9 && digits.startsWith('9')) digits = `51${digits}`
  return digits
}

function toChatId(phone: string) {
  const d = normalizePhone(phone)
  return d.includes('@') ? d : `${d}@c.us`
}

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

function isFallbackCode(code: string) {
  return Boolean(OTP_FALLBACK) && code === OTP_FALLBACK
}

async function sendWhatsAppCode(phone: string, code: string, name: string, purpose: Purpose) {
  const action = purpose === 'register' ? 'crear tu cuenta' : 'ingresar / recuperar sesión'
  const text =
    `🔐 *Chifa-Pollería Lopez*\n\n` +
    `Hola ${name || ''}, tu código para ${action} es:\n\n` +
    `*${code}*\n\n` +
    `Válido por ${OTP_TTL_MIN} minutos.`

  const res = await fetch(`${WSP_BASE.replace(/\/$/, '')}/api/sendText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': WSP_KEY,
    },
    body: JSON.stringify({
      session: WSP_SESSION,
      chatId: toChatId(phone),
      text,
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(body || `WhatsApp HTTP ${res.status}`)
  }
}

async function findStaffByPhone(phone: string) {
  const pool = await getPool()
  const r = await pool
    .request()
    .input('phone', sql.NVarChar, phone)
    .query(`
      SELECT TOP 1 Id, Name, Email, Role, Active, Phone, Pin, PhotoUrl, ISNULL(IsSystem,0) AS IsSystem
      FROM dbo.Users
      WHERE Active = 1
        AND Phone IS NOT NULL
        AND REPLACE(REPLACE(REPLACE(Phone,' ',''),'-',''),'+','') LIKE '%' + RIGHT(@phone, 9)
      ORDER BY CASE Role
        WHEN N'admin' THEN 0
        WHEN N'cajero' THEN 1
        WHEN N'mozo' THEN 2
        ELSE 3
      END
    `)
  return r.recordset[0] as
    | {
        Id: string
        Name: string
        Email: string
        Role: AuthUser['role']
        Active: boolean
        Phone: string
        Pin?: string
        PhotoUrl?: string
        IsSystem?: boolean | number
      }
    | undefined
}

async function findCustomerByPhone(phone: string) {
  const pool = await getPool()
  const r = await pool
    .request()
    .input('phone', sql.NVarChar, phone)
    .query(`
      SELECT TOP 1 Id, Name, Phone, Email, Address, PhotoUrl, CreatedAt
      FROM dbo.Customers
      WHERE REPLACE(REPLACE(REPLACE(Phone,' ',''),'-',''),'+','') LIKE '%' + RIGHT(@phone, 9)
    `)
  return r.recordset[0] as
    | {
        Id: string
        Name: string
        Phone: string
        Email?: string
        Address?: string
        PhotoUrl?: string
        CreatedAt: Date
      }
    | undefined
}

async function findDriverByPhone(phone: string) {
  const pool = await getPool()
  const r = await pool
    .request()
    .input('phone', sql.NVarChar, phone)
    .query(`
      SELECT TOP 1 Id, Name, Phone, Active, VehicleInfo, PhotoUrl, Lat, Lng
      FROM dbo.Drivers
      WHERE Active = 1
        AND REPLACE(REPLACE(REPLACE(Phone,' ',''),'-',''),'+','') LIKE '%' + RIGHT(@phone, 9)
    `)
  return r.recordset[0] as
    | {
        Id: string
        Name: string
        Phone: string
        Active: boolean
        VehicleInfo?: string
        PhotoUrl?: string
        Lat?: number
        Lng?: number
      }
    | undefined
}

function staffPhoto(name: string, photo?: string | null) {
  return (
    photo ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'Usuario')}&background=e11d2e&color=ffffff&size=128&bold=true`
  )
}

function customerPhoto(name: string, photo?: string | null) {
  return (
    photo ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'Cliente')}&background=1a3d1a&color=ffd700&size=128&bold=true`
  )
}

function driverPhoto(name: string, photo?: string | null) {
  return (
    photo ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'Conductor')}&background=0f766e&color=ffffff&size=128&bold=true`
  )
}

async function issueSession(accountType: AccountType, phone: string, res: import('express').Response) {
  if (accountType === 'staff') {
    const user = await findStaffByPhone(phone)
    if (!user || !user.Active) {
      return res.status(403).json({ error: 'Cuenta de personal inactiva o no encontrada' })
    }
    const sessionId = await rotateSession('staff', String(user.Id))
    const authUser: AuthUser = {
      id: String(user.Id),
      name: user.Name,
      email: user.Email,
      role: user.Role,
      accountType: 'staff',
      sessionId,
      pin: user.Pin || '0000',
      phone: user.Phone || undefined,
      photoUrl: staffPhoto(user.Name, user.PhotoUrl),
      isSystem: Number(user.IsSystem) === 1,
    }
    return res.json({ ok: true, token: signToken(authUser), user: authUser })
  }

  if (accountType === 'driver') {
    const drv = await findDriverByPhone(phone)
    if (!drv || !drv.Active) {
      return res.status(403).json({ error: 'Conductor inactivo o no encontrado' })
    }
    const sessionId = await rotateSession('driver', String(drv.Id))
    const driver = {
      id: String(drv.Id),
      name: drv.Name,
      phone: normalizePhone(String(drv.Phone)),
      vehicleInfo: drv.VehicleInfo || undefined,
      active: true,
      photoUrl: driverPhoto(drv.Name, drv.PhotoUrl),
    }
    const authUser: AuthUser = {
      id: driver.id,
      name: driver.name,
      email: driver.phone,
      role: 'driver',
      accountType: 'driver',
      sessionId,
      photoUrl: driver.photoUrl,
    }
    return res.json({
      ok: true,
      token: signToken(authUser),
      driver,
      user: authUser,
    })
  }

  const cust = await findCustomerByPhone(phone)
  if (!cust) return res.status(404).json({ error: 'Cliente no encontrado' })

  const sessionId = await rotateSession('customer', String(cust.Id))
  const customer = {
    id: String(cust.Id),
    name: cust.Name,
    phone: normalizePhone(String(cust.Phone)),
    email: cust.Email || undefined,
    password: '',
    address: cust.Address || undefined,
    photoUrl: customerPhoto(cust.Name, cust.PhotoUrl),
    createdAt: new Date(cust.CreatedAt).toISOString(),
  }

  const authUser: AuthUser = {
    id: customer.id,
    name: customer.name,
    email: customer.phone,
    role: 'customer',
    accountType: 'customer',
    sessionId,
    photoUrl: customer.photoUrl,
  }

  return res.json({
    ok: true,
    token: signToken(authUser),
    customer,
    user: authUser,
  })
}

/**
 * POST /api/auth/otp/request
 * { accountType: staff|customer|driver, phone, purpose?: login|register, name? }
 */
otpAuthRouter.post('/request', async (req, res) => {
  try {
    const accountType = req.body?.accountType as AccountType
    const purpose = (req.body?.purpose as Purpose) || 'login'
    const phone = normalizePhone(String(req.body?.phone || ''))
    const nameIn = String(req.body?.name || '').trim()

    if (accountType !== 'staff' && accountType !== 'customer' && accountType !== 'driver') {
      return res.status(400).json({ error: 'accountType debe ser staff, customer o driver' })
    }
    if (accountType === 'driver') {
      if (!phone || phone.length < 5) {
        return res.status(400).json({ error: 'Ingresa el celular del conductor' })
      }
    } else if (!phone || phone.length < 11) {
      return res.status(400).json({ error: 'Ingresa un celular válido (9 dígitos Perú)' })
    }

    const pool = await getPool()
    let name = 'usuario'
    const identifier = phone

    if (accountType === 'staff') {
      const row = await findStaffByPhone(phone)
      if (!row || !row.Active) {
        return res.status(404).json({
          error: 'No hay personal activo con ese número. Pide al admin que registre tu celular.',
        })
      }
      name = row.Name
    } else if (accountType === 'driver') {
      const row = await findDriverByPhone(phone)
      if (!row || !row.Active) {
        return res.status(404).json({
          error: 'No hay conductor activo con ese número. Contacta al administrador.',
        })
      }
      name = row.Name
    } else if (purpose === 'register') {
      const existing = await findCustomerByPhone(phone)
      if (existing) {
        name = existing.Name
      } else {
        if (!nameIn || nameIn.length < 2) {
          return res.status(400).json({ error: 'Nombre requerido para registrarte' })
        }
        const id = uuid()
        const hash = await bcrypt.hash(uuid(), 8)
        await pool
          .request()
          .input('id', sql.UniqueIdentifier, id)
          .input('name', sql.NVarChar, nameIn)
          .input('phone', sql.NVarChar, phone)
          .input('hash', sql.NVarChar, hash)
          .query(`
            INSERT INTO dbo.Customers (Id, Name, Phone, PasswordHash)
            VALUES (@id, @name, @phone, @hash)
          `)
        name = nameIn
      }
    } else {
      const row = await findCustomerByPhone(phone)
      if (!row) {
        return res.status(404).json({
          error: 'No hay cuenta activa con ese número. Regístrate primero.',
        })
      }
      name = row.Name
    }

    const code = genCode()
    const codeHash = await bcrypt.hash(code, 8)
    const expires = new Date(Date.now() + OTP_TTL_MIN * 60_000)

    await pool
      .request()
      .input('type', sql.NVarChar, accountType)
      .input('identifier', sql.NVarChar, identifier)
      .query(`
        UPDATE dbo.AuthOtpCodes SET UsedAt = SYSUTCDATETIME()
        WHERE AccountType = @type AND Identifier = @identifier AND UsedAt IS NULL
      `)

    await pool
      .request()
      .input('type', sql.NVarChar, accountType)
      .input('identifier', sql.NVarChar, identifier)
      .input('phone', sql.NVarChar, phone)
      .input('hash', sql.NVarChar, codeHash)
      .input('expires', sql.DateTime2, expires)
      .query(`
        INSERT INTO dbo.AuthOtpCodes (AccountType, Identifier, Phone, CodeHash, ExpiresAt)
        VALUES (@type, @identifier, @phone, @hash, @expires)
      `)

    let whatsappSent = true
    try {
      await sendWhatsAppCode(phone, code, name, purpose)
    } catch (e) {
      whatsappSent = false
      console.warn('[otp] WhatsApp falló, usar código de respaldo:', (e as Error).message)
    }

    const masked = `***${phone.slice(-4)}`
    if (whatsappSent) {
      return res.json({
        ok: true,
        message: `Código enviado por WhatsApp al ${masked}`,
        phoneMasked: masked,
        expiresInMinutes: OTP_TTL_MIN,
        whatsappSent: true,
        fallbackCode: OTP_FALLBACK || undefined,
      })
    }

    return res.json({
      ok: true,
      message: `WhatsApp no disponible. Usa el código de respaldo ${OTP_FALLBACK}`,
      phoneMasked: masked,
      expiresInMinutes: OTP_TTL_MIN,
      whatsappSent: false,
      fallbackUsed: true,
      fallbackCode: OTP_FALLBACK,
    })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

/**
 * POST /api/auth/otp/verify
 * { accountType, phone, code }
 * Acepta el código de WhatsApp O el código de respaldo (OTP_FALLBACK_CODE, default 123456).
 */
otpAuthRouter.post('/verify', async (req, res) => {
  try {
    const accountType = req.body?.accountType as AccountType
    const phone = normalizePhone(String(req.body?.phone || ''))
    const code = String(req.body?.code || '').trim()

    if (accountType !== 'staff' && accountType !== 'customer' && accountType !== 'driver') {
      return res.status(400).json({ error: 'accountType inválido' })
    }
    if (!phone) return res.status(400).json({ error: 'phone requerido' })
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Código de 6 dígitos requerido' })

    // Código de respaldo (WhatsApp caído / pruebas)
    if (isFallbackCode(code)) {
      return issueSession(accountType, phone, res)
    }

    const pool = await getPool()
    const identifier = phone

    const otps = await pool
      .request()
      .input('type', sql.NVarChar, accountType)
      .input('identifier', sql.NVarChar, identifier)
      .query(`
        SELECT TOP 5 Id, CodeHash, ExpiresAt, UsedAt
        FROM dbo.AuthOtpCodes
        WHERE AccountType = @type AND Identifier = @identifier
        ORDER BY CreatedAt DESC
      `)

    const row = otps.recordset.find(
      (o: { UsedAt: unknown; ExpiresAt: Date }) => !o.UsedAt && new Date(o.ExpiresAt) > new Date(),
    )
    if (!row) {
      return res.status(400).json({
        error: `Código inválido o vencido. Usa el de WhatsApp o el de respaldo ${OTP_FALLBACK}.`,
      })
    }

    const match = await bcrypt.compare(code, String(row.CodeHash))
    if (!match) {
      return res.status(400).json({
        error: `Código incorrecto. Si WhatsApp falló, usa ${OTP_FALLBACK}.`,
      })
    }

    await pool
      .request()
      .input('id', sql.UniqueIdentifier, row.Id)
      .query(`UPDATE dbo.AuthOtpCodes SET UsedAt = SYSUTCDATETIME() WHERE Id = @id`)

    return issueSession(accountType, phone, res)
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})
