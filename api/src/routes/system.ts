import { Router } from 'express'
import { getPool, sql } from '../db.js'
import { authRequired, type AuthUser } from '../auth.js'

export const systemRouter = Router()

export type PurgeTarget = 'orders' | 'users' | 'customers' | 'products'
const ALL_TARGETS: PurgeTarget[] = ['orders', 'users', 'customers', 'products']

/** Verifica en BD que el usuario autenticado es admin de sistema (IsSystem=1). */
async function requireSystemAdmin(req: { user?: AuthUser }, res: import('express').Response, next: import('express').NextFunction) {
  try {
    if (!req.user?.id || req.user.accountType === 'customer' || req.user.accountType === 'driver') {
      return res.status(403).json({ error: 'Solo administrador de sistema' })
    }
    const pool = await getPool()
    const r = await pool
      .request()
      .input('id', sql.UniqueIdentifier, req.user.id)
      .query(`
        SELECT TOP 1 ISNULL(IsSystem, 0) AS IsSystem, Role, Active
        FROM dbo.Users WHERE Id = @id
      `)
    const row = r.recordset[0]
    if (!row || !row.Active || Number(row.IsSystem) !== 1 || String(row.Role) !== 'admin') {
      return res.status(403).json({ error: 'Solo administrador de sistema' })
    }
    next()
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
}

/**
 * Limpia datos de la BD. Solo IsSystem=1.
 * Body: { confirm: "PUESTA EN MARCHA" | "LIMPIAR", targets?: [...] }
 * - users: borra el equipo; NUNCA el usuario de sistema
 * - products/customers/users implican borrar pedidos (FK)
 */
systemRouter.post('/purge', authRequired, requireSystemAdmin, async (req, res) => {
  const confirm = String(req.body?.confirm || '').trim().toUpperCase()
  if (confirm !== 'PUESTA EN MARCHA' && confirm !== 'LIMPIAR') {
    return res.status(400).json({
      error: 'Debes confirmar con "PUESTA EN MARCHA"',
    })
  }

  const raw = Array.isArray(req.body?.targets) ? req.body.targets : ALL_TARGETS
  const wanted = new Set<PurgeTarget>(
    raw.filter((t: unknown): t is PurgeTarget => ALL_TARGETS.includes(t as PurgeTarget)),
  )
  if (wanted.size === 0) {
    return res.status(400).json({ error: 'Elige al menos un tipo de dato' })
  }

  if (wanted.has('users') || wanted.has('customers') || wanted.has('products')) {
    wanted.add('orders')
  }

  const pool = await getPool()
  const tx = new sql.Transaction(pool)
  await tx.begin()
  try {
    const run = async (q: string) => {
      await new sql.Request(tx).query(q)
    }
    const done: string[] = []

    if (wanted.has('orders')) {
      if (await tableExists(tx, 'InventoryMovements')) await run(`DELETE FROM dbo.InventoryMovements`)
      if (await tableExists(tx, 'CouponRedemptions')) await run(`DELETE FROM dbo.CouponRedemptions`)
      if (await tableExists(tx, 'OrderPayments')) await run(`DELETE FROM dbo.OrderPayments`)
      if (await tableExists(tx, 'OrderItemOptions')) await run(`DELETE FROM dbo.OrderItemOptions`)
      if (await tableExists(tx, 'OrderItems')) await run(`DELETE FROM dbo.OrderItems`)
      if (await tableExists(tx, 'Orders')) await run(`DELETE FROM dbo.Orders`)
      if (await tableExists(tx, 'Reservations')) await run(`DELETE FROM dbo.Reservations`)
      if (await tableExists(tx, 'Tables')) {
        await run(`
          UPDATE dbo.Tables
          SET Status = N'libre', CurrentOrderId = NULL
          WHERE CurrentOrderId IS NOT NULL OR Status <> N'libre'
        `)
      }
      if (await colExists(tx, 'Settings', 'NextOrderNumber')) {
        await run(`UPDATE dbo.Settings SET NextOrderNumber = 1001 WHERE Id = 1`)
      }
      done.push('pedidos')
    }

    if (wanted.has('products')) {
      if (await tableExists(tx, 'ProductReviews')) await run(`DELETE FROM dbo.ProductReviews`)
      if (await tableExists(tx, 'ProductRecipes')) await run(`DELETE FROM dbo.ProductRecipes`)
      if (await tableExists(tx, 'ProductTags')) await run(`DELETE FROM dbo.ProductTags`)
      if (await tableExists(tx, 'ProductOptions')) await run(`DELETE FROM dbo.ProductOptions`)
      if (await tableExists(tx, 'ProductOptionGroups')) await run(`DELETE FROM dbo.ProductOptionGroups`)
      if (await tableExists(tx, 'Products')) await run(`DELETE FROM dbo.Products`)
      done.push('productos')
    }

    if (wanted.has('customers')) {
      if (await tableExists(tx, 'CustomerAddresses')) await run(`DELETE FROM dbo.CustomerAddresses`)
      if (await tableExists(tx, 'AuthOtpCodes')) {
        await run(`DELETE FROM dbo.AuthOtpCodes WHERE AccountType IN (N'customer', N'cliente')`)
      }
      if (await tableExists(tx, 'Customers')) await run(`DELETE FROM dbo.Customers`)
      if (await colExists(tx, 'Customers', 'ActiveSessionId')) {
        /* already empty */
      }
      done.push('clientes')
    }

    if (wanted.has('users')) {
      if (await tableExists(tx, 'AuthOtpCodes')) {
        await run(`DELETE FROM dbo.AuthOtpCodes WHERE AccountType = N'staff'`)
      }
      if (await colExists(tx, 'Users', 'ActiveSessionId')) {
        await run(`UPDATE dbo.Users SET ActiveSessionId = NULL WHERE ISNULL(IsSystem,0) = 0`)
      }
      await run(`DELETE FROM dbo.Users WHERE ISNULL(IsSystem,0) = 0`)
      done.push('usuarios (excepto sistema)')
    }

    await tx.commit()
    res.json({
      ok: true,
      cleared: done,
      message: `Puesta en marcha lista: ${done.join(', ')}. El usuario de sistema se mantiene.`,
    })
  } catch (e) {
    try {
      await tx.rollback()
    } catch {
      /* ignore */
    }
    res.status(500).json({ error: (e as Error).message })
  }
})

systemRouter.get('/status', authRequired, requireSystemAdmin, async (_req, res) => {
  try {
    const pool = await getPool()
    const r = await pool.request().query(`
      SELECT
        (SELECT COUNT(*) FROM dbo.Orders) AS orders,
        (SELECT COUNT(*) FROM dbo.Customers) AS customers,
        (SELECT COUNT(*) FROM dbo.Products) AS products,
        (SELECT COUNT(*) FROM dbo.Users WHERE ISNULL(IsSystem,0)=0) AS staff
    `)
    res.json({ ok: true, counts: r.recordset[0] })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

async function tableExists(tx: sql.Transaction, name: string) {
  const r = await new sql.Request(tx)
    .input('name', sql.NVarChar, name)
    .query(`SELECT OBJECT_ID(N'dbo.' + @name, N'U') AS oid`)
  return Boolean(r.recordset[0]?.oid)
}

async function colExists(tx: sql.Transaction, table: string, col: string) {
  const r = await new sql.Request(tx)
    .input('table', sql.NVarChar, table)
    .input('col', sql.NVarChar, col)
    .query(`SELECT COL_LENGTH(N'dbo.' + @table, @col) AS len`)
  return r.recordset[0]?.len != null
}
