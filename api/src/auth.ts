import { Router, type Request, type Response, type NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { getPool, sql } from './db.js'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret'

export interface AuthUser {
  id: string
  name: string
  email: string
  role: 'admin' | 'cajero' | 'cocina' | 'mozo' | 'driver' | 'customer'
  accountType?: 'staff' | 'customer' | 'driver'
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

export function signToken(user: AuthUser) {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '12h' })
}

export function authRequired(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' })
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET) as AuthUser
    next()
  } catch {
    return res.status(401).json({ error: 'Token inválido' })
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
    .query(`SELECT TOP 1 Id, Name, Email, PasswordHash, Role, Active FROM dbo.Users WHERE Email = @email`)

  const row = result.recordset[0]
  if (!row || !row.Active) return res.status(401).json({ error: 'Credenciales inválidas' })

  const hash = String(row.PasswordHash)
  let ok = false
  if (hash.startsWith('$2')) {
    ok = await bcrypt.compare(password, hash)
  } else {
    // seed demo en texto plano → migrar a bcrypt
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

  const user: AuthUser = {
    id: row.Id,
    name: row.Name,
    email: row.Email,
    role: row.Role,
  }

  return res.json({ token: signToken(user), user })
})

authRouter.get('/me', authRequired, (req, res) => {
  res.json({ user: req.user })
})
