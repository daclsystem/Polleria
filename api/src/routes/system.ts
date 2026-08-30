import { Router } from 'express'
import { getPool, sql } from '../db.js'
import { authRequired, type AuthUser } from '../auth.js'

export const systemRouter = Router()

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
 * Limpia datos operativos de la BD (pedidos, reservas, movimientos, OTP, sesiones).
 * Conserva: catálogo, usuarios, sucursales, settings, rangos delivery, inventarios base.
 * Body: { confirm: "LIMPIAR" }
 */
systemRouter.post('/purge', authRequired, requireSystemAdmin, async (req, res) => {
  const confirm = String(req.body?.confirm || '').trim().toUpperCase()
  if (confirm !== 'LIMPIAR') {
    return res.status(400).json({
      error: 'Debes enviar confirm: "LIMPIAR" para ejecutar la limpieza',
    })
  }

  const pool = await getPool()
  const tx = new sql.Transaction(pool)
  await tx.begin()
  try {
    const run = async (q: string) => {
      await new sql.Request(tx).query(q)
    }

    // Pedidos y derivados (cascada donde exista FK)
    if (await tableExists(tx, 'InventoryMovements')) await run(`DELETE FROM dbo.InventoryMovements`)
    if (await tableExists(tx, 'OrderPayments')) await run(`DELETE FROM dbo.OrderPayments`)
    if (await tableExists(tx, 'OrderItemOptions')) await run(`DELETE FROM dbo.OrderItemOptions`)
    if (await tableExists(tx, 'OrderItems')) await run(`DELETE FROM dbo.OrderItems`)
    if (await tableExists(tx, 'Orders')) await run(`DELETE FROM dbo.Orders`)

    if (await tableExists(tx, 'Reservations')) await run(`DELETE FROM dbo.Reservations`)
    if (await tableExists(tx, 'AuthOtpCodes')) await run(`DELETE FROM dbo.AuthOtpCodes`)

    if (await tableExists(tx, 'Tables')) {
      await run(`
        UPDATE dbo.Tables
        SET Status = N'libre', CurrentOrderId = NULL
        WHERE CurrentOrderId IS NOT NULL OR Status <> N'libre'
      `)
    }

    // Sesiones activas (fuerza re-login)
    if (await colExists(tx, 'Users', 'ActiveSessionId')) {
      await run(`UPDATE dbo.Users SET ActiveSessionId = NULL`)
    }
    if (await colExists(tx, 'Customers', 'ActiveSessionId')) {
      await run(`UPDATE dbo.Customers SET ActiveSessionId = NULL`)
    }
    if (await colExists(tx, 'Drivers', 'ActiveSessionId')) {
      await run(`UPDATE dbo.Drivers SET ActiveSessionId = NULL`)
    }

    if (await colExists(tx, 'Settings', 'NextOrderNumber')) {
      await run(`UPDATE dbo.Settings SET NextOrderNumber = 1001 WHERE Id = 1`)
    }

    await tx.commit()
    res.json({
      ok: true,
      message:
        'BD operativa limpiada: pedidos, reservas, OTP y sesiones. Catálogo y usuarios intactos.',
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
