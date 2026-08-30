import { Router, type Request, type Response, type NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { getPool, sql } from './db.js'
import { rotateSession, sessionIsActive } from './session.js'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret'

export interface AuthUser {
  id: string
  name: string
  email: string
  role: 'admin' | 'cajero' | 'cocina' | 'mozo' | 'driver' | 'customer'
  accountType?: 'staff' | 'customer' | 'driver'
  /** Sesión activa: si inicia en otro dispositivo, esta queda inválida */
  sessionId?: string
  pin?: string
  phone?: string
  photoUrl?: string
  /** Admin oculto de sistema (IsSystem=1) */
  isSystem?: boolean
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

export function signToken(user: AuthUser) {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '30d' })
}

export async function authRequired(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado', code: 'NO_TOKEN' })
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET) as AuthUser
    const active = await sessionIsActive(payload)
    if (!active) {
      return res.status(401).json({
        error: 'Sesión cerrada: iniciaste sesión en otro dispositivo',
        code: 'SESSION_REPLACED',
      })
    }
    req.user = payload
    next()
  } catch {
    return res.status(401).json({ error: 'Token inválido', code: 'BAD_TOKEN' })
  }
}

export function requireRoles(...roles: AuthUser['role'][]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Sin permiso' })
    }
    next()
  }
}

export const authRouter = Router()

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string }
  if (!email || !password) return res.status(400).json({ error: 'Email y password requeridos' })

  const pool = await getPool()
  const result = await pool
    .request()
    .input('email', sql.NVarChar, email)
    .query(`SELECT TOP 1 Id, Name, Email, PasswordHash, Role, Active, Pin, Phone, PhotoUrl, ISNULL(IsSystem,0) AS IsSystem FROM dbo.Users WHERE Email = @email`)

  const row = result.recordset[0]
  if (!row || !row.Active) return res.status(401).json({ error: 'Credenciales inválidas' })

  const hash = String(row.PasswordHash)
  let ok = false
  if (hash.startsWith('$2')) {
    ok = await bcrypt.compare(password, hash)
  } else {
    ok = hash === password
    if (ok) {
      const newHash = await bcrypt.hash(password, 10)
      await pool
        .request()
        .input('id', sql.UniqueIdentifier, row.Id)
        .input('hash', sql.NVarChar, newHash)
        .query(`UPDATE dbo.Users SET PasswordHash = @hash, UpdatedAt = SYSUTCDATETIME() WHERE Id = @id`)
    }
  }

  if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' })

  const sessionId = await rotateSession('staff', String(row.Id))
  const photoUrl =
    row.PhotoUrl ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(String(row.Name || 'Usuario'))}&background=e11d2e&color=ffffff&size=128&bold=true`
  const user: AuthUser = {
    id: String(row.Id),
    name: row.Name,
    email: row.Email,
    role: row.Role,
    accountType: 'staff',
    sessionId,
    pin: row.Pin || '0000',
    phone: row.Phone || undefined,
    photoUrl,
    isSystem: Number(row.IsSystem) === 1,
  }

  return res.json({ token: signToken(user), user })
})

authRouter.get('/me', authRequired, (req, res) => {
  res.json({ user: req.user })
})

/** Comprueba si la sesión sigue vigente (para el front) */
authRouter.get('/session', authRequired, (req, res) => {
  res.json({ ok: true, user: req.user })
})

/** Cierra solo esta sesión (este dispositivo). */
authRouter.post('/logout', authRequired, async (req, res) => {
  try {
    const u = req.user
    if (u?.id && u.sessionId) {
      const scope =
        u.accountType === 'driver' || u.role === 'driver'
          ? 'driver'
          : u.accountType === 'customer' || u.role === 'customer'
            ? 'customer'
            : 'staff'
      const table =
        scope === 'driver' ? 'dbo.Drivers' : scope === 'customer' ? 'dbo.Customers' : 'dbo.Users'
      const pool = await getPool()
      await pool
        .request()
        .input('id', sql.UniqueIdentifier, u.id)
        .input('sid', sql.UniqueIdentifier, u.sessionId)
        .query(`UPDATE ${table} SET ActiveSessionId = NULL WHERE Id=@id AND ActiveSessionId=@sid`)
    }
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})
