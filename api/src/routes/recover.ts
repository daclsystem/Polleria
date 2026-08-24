import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { getPool, sql } from '../db.js'

export const recoverRouter = Router()

const WSP_BASE = process.env.WSPGO_BASE_URL || 'https://iwspgo.indevsoft.com'
const WSP_KEY = process.env.WSPGO_API_KEY || '753ce43470bc2ad5b72bce84a7080d7ec92f77a6690bff51e5e03a5cd14eb6e0'
const WSP_SESSION = process.env.WSPGO_SESSION || 'PolleriaLopez'
const OTP_TTL_MIN = 10

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

async function sendWhatsAppCode(phone: string, code: string, name: string) {
  const text =
    `🔐 *Chifa-Pollería Lopez*\n\n` +
    `Hola ${name}, tu código para recuperar la cuenta es:\n\n` +
    `*${code}*\n\n` +
    `Válido por ${OTP_TTL_MIN} minutos. Si no pediste esto, ignora el mensaje.`

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

type AccountType = 'staff' | 'customer'

/** POST /api/auth/recover/request { accountType, email?, phone? } */
recoverRouter.post('/request', async (req, res) => {
  try {
    const accountType = req.body?.accountType as AccountType
    if (accountType !== 'staff' && accountType !== 'customer') {
      return res.status(400).json({ error: 'accountType debe ser staff o customer' })
    }

    const pool = await getPool()
    let identifier = ''
    let phone = ''
    let name = 'usuario'

    if (accountType === 'staff') {
      const email = String(req.body?.email || '').trim().toLowerCase()
      if (!email) return res.status(400).json({ error: 'email requerido' })
      const r = await pool
        .request()
        .input('email', sql.NVarChar, email)
        .query(`SELECT TOP 1 Id, Name, Email, Phone, Active FROM dbo.Users WHERE Email = @email`)
      const row = r.recordset[0]
      if (!row || !row.Active) {
        // misma respuesta para no filtrar cuentas
        return res.json({ ok: true, message: 'Si la cuenta existe, enviamos un código por WhatsApp' })
      }
      phone = normalizePhone(String(row.Phone || req.body?.phone || ''))
      if (!phone || phone.length < 11) {
        return res.status(400).json({ error: 'Esta cuenta no tiene celular registrado. Contacta al administrador.' })
      }
      identifier = email
      name = row.Name
    } else {
      phone = normalizePhone(String(req.body?.phone || ''))
      if (!phone || phone.length < 11) return res.status(400).json({ error: 'phone requerido' })
      const r = await pool
        .request()
        .input('phone', sql.NVarChar, phone)
        .query(`
          SELECT TOP 1 Id, Name, Phone FROM dbo.Customers
          WHERE REPLACE(REPLACE(REPLACE(Phone,' ',''),'-',''),'+','') LIKE '%' + RIGHT(@phone, 9)
        `)
      const row = r.recordset[0]
      if (!row) {
        return res.json({ ok: true, message: 'Si la cuenta existe, enviamos un código por WhatsApp' })
      }
      identifier = normalizePhone(String(row.Phone))
      phone = identifier
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

    try {
      await sendWhatsAppCode(phone, code, name)
    } catch (e) {
      return res.status(502).json({
        error: 'No se pudo enviar el WhatsApp. Revisa la sesión PolleriaLopez en iwspgo.',
        detail: (e as Error).message,
      })
    }

    const masked = phone.length >= 4 ? `***${phone.slice(-4)}` : '****'
    res.json({
      ok: true,
      message: `Código enviado por WhatsApp al ${masked}`,
      phoneMasked: masked,
      expiresInMinutes: OTP_TTL_MIN,
    })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

/** POST /api/auth/recover/confirm { accountType, email?, phone?, code, newPassword } */
recoverRouter.post('/confirm', async (req, res) => {
  try {
    const accountType = req.body?.accountType as AccountType
    const code = String(req.body?.code || '').trim()
    const newPassword = String(req.body?.newPassword || '')
    if (accountType !== 'staff' && accountType !== 'customer') {
      return res.status(400).json({ error: 'accountType inválido' })
    }
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Código de 6 dígitos requerido' })
    if (newPassword.length < 6) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' })

    const pool = await getPool()
    let identifier = ''

    if (accountType === 'staff') {
      identifier = String(req.body?.email || '').trim().toLowerCase()
      if (!identifier) return res.status(400).json({ error: 'email requerido' })
    } else {
      identifier = normalizePhone(String(req.body?.phone || ''))
      if (!identifier) return res.status(400).json({ error: 'phone requerido' })
    }

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

    const row = otps.recordset.find((o: { UsedAt: unknown; ExpiresAt: Date }) => !o.UsedAt && new Date(o.ExpiresAt) > new Date())
    if (!row) return res.status(400).json({ error: 'Código inválido o vencido. Solicita uno nuevo.' })

    const match = await bcrypt.compare(code, String(row.CodeHash))
    if (!match) return res.status(400).json({ error: 'Código incorrecto' })

    const hash = await bcrypt.hash(newPassword, 10)

    if (accountType === 'staff') {
      await pool
        .request()
        .input('email', sql.NVarChar, identifier)
        .input('hash', sql.NVarChar, hash)
        .query(`UPDATE dbo.Users SET PasswordHash = @hash, UpdatedAt = SYSUTCDATETIME() WHERE Email = @email`)
    } else {
      await pool
        .request()
        .input('phone', sql.NVarChar, identifier)
        .input('hash', sql.NVarChar, hash)
        .input('plain', sql.NVarChar, newPassword)
        .query(`
          UPDATE dbo.Customers
          SET PasswordHash = @hash
          WHERE REPLACE(REPLACE(REPLACE(Phone,' ',''),'-',''),'+','') LIKE '%' + RIGHT(@phone, 9)
        `)
      // Si la columna aún se llama Password (seed antiguo), intenta también
      try {
        await pool
          .request()
          .input('phone', sql.NVarChar, identifier)
          .input('plain', sql.NVarChar, newPassword)
          .query(`
            IF COL_LENGTH('dbo.Customers', 'Password') IS NOT NULL
              UPDATE dbo.Customers SET Password = @plain
              WHERE REPLACE(REPLACE(REPLACE(Phone,' ',''),'-',''),'+','') LIKE '%' + RIGHT(@phone, 9)
          `)
      } catch {
        /* ignore */
      }
    }

    await pool
      .request()
      .input('id', sql.UniqueIdentifier, row.Id)
      .query(`UPDATE dbo.AuthOtpCodes SET UsedAt = SYSUTCDATETIME() WHERE Id = @id`)

    res.json({ ok: true, message: 'Contraseña actualizada. Ya puedes iniciar sesión.' })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})
