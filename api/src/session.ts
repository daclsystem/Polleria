import { v4 as uuid } from 'uuid'
import { getPool, sql } from './db.js'
import type { AuthUser } from './auth.js'

export type AccountScope = 'staff' | 'customer' | 'driver'

function tableFor(scope: AccountScope) {
  if (scope === 'staff') return 'dbo.Users'
  if (scope === 'driver') return 'dbo.Drivers'
  return 'dbo.Customers'
}

/** Genera nueva sesión y cierra la anterior en BD (una sola sesión activa). */
export async function rotateSession(scope: AccountScope, userId: string): Promise<string> {
  const sessionId = uuid()
  const pool = await getPool()
  const table = tableFor(scope)
  await pool
    .request()
    .input('id', sql.UniqueIdentifier, userId)
    .input('sid', sql.UniqueIdentifier, sessionId)
    .query(`UPDATE ${table} SET ActiveSessionId = @sid WHERE Id = @id`)
  return sessionId
}

/** true si el JWT sigue siendo la sesión activa de esa cuenta */
export async function sessionIsActive(user: AuthUser): Promise<boolean> {
  if (!user?.id) return false
  // Token viejo sin sessionId: no echar. Solo se cierra al login en otro equipo o al republicar.
  if (!user.sessionId) return true
  const scope: AccountScope =
    user.accountType === 'driver' || user.role === 'driver'
      ? 'driver'
      : user.accountType === 'customer' || user.role === 'customer'
        ? 'customer'
        : 'staff'

  const pool = await getPool()
  const table = tableFor(scope)
  const r = await pool
    .request()
    .input('id', sql.UniqueIdentifier, user.id)
    .query(`SELECT ActiveSessionId FROM ${table} WHERE Id = @id`)

  const current = r.recordset[0]?.ActiveSessionId
  // NULL = se cerraron todas (republicar / logout). El token con sessionId ya no vale.
  if (!current) return false
  return String(current).toLowerCase() === String(user.sessionId).toLowerCase()
}
