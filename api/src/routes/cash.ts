import { Router } from 'express'
import { v4 as uuid } from 'uuid'
import { getPool, sql } from '../db.js'
import { authRequired, requireRoles } from '../auth.js'

export const cashRouter = Router()

function isGuid(id?: string) {
  return Boolean(id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
}

async function ensureCashCloses() {
  const pool = await getPool()
  await pool.request().query(`
    IF OBJECT_ID(N'dbo.CashCloses', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.CashCloses (
        Id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_CashCloses PRIMARY KEY DEFAULT NEWID(),
        FromAt DATETIME2(0) NOT NULL,
        ClosedAt DATETIME2(0) NOT NULL CONSTRAINT DF_CashCloses_ClosedAt DEFAULT SYSUTCDATETIME(),
        UserId UNIQUEIDENTIFIER NULL,
        OrdersCount INT NOT NULL CONSTRAINT DF_CashCloses_Orders DEFAULT (0),
        SalesTotal DECIMAL(12,2) NOT NULL CONSTRAINT DF_CashCloses_Sales DEFAULT (0),
        Efectivo DECIMAL(12,2) NOT NULL CONSTRAINT DF_CashCloses_Ef DEFAULT (0),
        Yape DECIMAL(12,2) NOT NULL CONSTRAINT DF_CashCloses_Yp DEFAULT (0),
        Tarjeta DECIMAL(12,2) NOT NULL CONSTRAINT DF_CashCloses_Tj DEFAULT (0),
        CountedCash DECIMAL(12,2) NOT NULL CONSTRAINT DF_CashCloses_Cnt DEFAULT (0),
        Difference DECIMAL(12,2) NOT NULL CONSTRAINT DF_CashCloses_Diff DEFAULT (0),
        Notes NVARCHAR(255) NULL
      );
    END
    IF COL_LENGTH(N'dbo.CashCloses', N'Signature') IS NULL
      ALTER TABLE dbo.CashCloses ADD Signature NVARCHAR(MAX) NULL;
  `)
}

function startOfLimaTodayUtc() {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  return new Date(`${day}T05:00:00.000Z`)
}

async function shiftBounds() {
  const pool = await getPool()
  await ensureCashCloses()
  const last = await pool.request().query(`
    SELECT TOP 1 ClosedAt FROM dbo.CashCloses ORDER BY ClosedAt DESC
  `)
  const lastClose = last.recordset[0]?.ClosedAt as Date | undefined
  const fromAt = lastClose ? new Date(lastClose) : startOfLimaTodayUtc()
  return { fromAt, lastCloseAt: lastClose ? new Date(lastClose).toISOString() : null }
}

export type CashStockLine = {
  id: string
  name: string
  unit: string
  had: number
  out: number
  left: number
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000
}

async function loadShiftStock(fromAt: Date): Promise<CashStockLine[]> {
  const pool = await getPool()
  try {
    const exists = await pool.request().query(`
      SELECT CASE WHEN OBJECT_ID(N'dbo.InventoryMovements', N'U') IS NULL THEN 0 ELSE 1 END AS Ok
    `)
    const hasMov = Number(exists.recordset[0]?.Ok) === 1
    const q = hasMov
      ? `
        SELECT
          i.Id, i.Name, i.Unit,
          CAST(i.Stock AS DECIMAL(12,3)) AS Stock,
          ISNULL((
            SELECT SUM(CASE WHEN m.Delta < 0 THEN -m.Delta ELSE 0 END)
            FROM dbo.InventoryMovements m
            WHERE m.InventoryId = i.Id AND m.CreatedAt >= @from
          ), 0) AS Salio,
          ISNULL((
            SELECT SUM(m.Delta)
            FROM dbo.InventoryMovements m
            WHERE m.InventoryId = i.Id AND m.CreatedAt >= @from
          ), 0) AS DeltaNeto
        FROM dbo.Inventory i
        ORDER BY i.Name
      `
      : `
        SELECT Id, Name, Unit,
          CAST(Stock AS DECIMAL(12,3)) AS Stock,
          CAST(0 AS DECIMAL(12,3)) AS Salio,
          CAST(0 AS DECIMAL(12,3)) AS DeltaNeto
        FROM dbo.Inventory
        ORDER BY Name
      `
    const r = await pool.request().input('from', sql.DateTime2, fromAt).query(q)
    return (r.recordset as Array<Record<string, unknown>>).map((row) => {
      const left = Number(row.Stock || 0)
      const out = Number(row.Salio || 0)
      const delta = Number(row.DeltaNeto || 0)
      return {
        id: String(row.Id),
        name: String(row.Name || ''),
        unit: String(row.Unit || ''),
        had: round3(left - delta),
        out: round3(out),
        left: round3(left),
      }
    })
  } catch {
    return []
  }
}

async function loadShiftTotals(fromAt: Date) {
  const pool = await getPool()
  const payR = await pool
    .request()
    .input('from', sql.DateTime2, fromAt)
    .query(`
      SELECT
        LOWER(p.Method) AS Method,
        SUM(CAST(p.Amount AS DECIMAL(12,2))) AS Total,
        COUNT(DISTINCT p.OrderId) AS Cnt
      FROM dbo.OrderPayments p
      INNER JOIN dbo.Orders o ON o.Id = p.OrderId
      WHERE o.Paid = 1 AND o.Status <> 'cancelado' AND p.CreatedAt >= @from
      GROUP BY LOWER(p.Method)
    `)

  let efectivo = 0
  let yape = 0
  let tarjeta = 0
  for (const row of payR.recordset as Array<{ Method: string; Total: number }>) {
    const m = String(row.Method || '')
    const t = Number(row.Total || 0)
    if (m === 'efectivo') efectivo += t
    else if (m === 'yape' || m === 'plin') yape += t
    else if (m === 'tarjeta') tarjeta += t
  }

  const ordR = await pool
    .request()
    .input('from', sql.DateTime2, fromAt)
    .query(`
      SELECT COUNT(*) AS Cnt, ISNULL(SUM(Total), 0) AS Sales
      FROM dbo.Orders
      WHERE Paid = 1 AND Status <> 'cancelado' AND UpdatedAt >= @from
    `)
  const pendingR = await pool.request().query(`
    SELECT COUNT(*) AS Cnt FROM dbo.Orders WHERE Paid = 0 AND Status <> 'cancelado'
  `)

  const ordersCount = Number(ordR.recordset[0]?.Cnt || 0)
  const salesTotal = Number(ordR.recordset[0]?.Sales || 0)
  if (efectivo + yape + tarjeta < 0.01 && salesTotal > 0) {
    efectivo = salesTotal
  }

  return {
    ordersCount,
    salesTotal,
    efectivo,
    yape,
    tarjeta,
    pendingUnpaid: Number(pendingR.recordset[0]?.Cnt || 0),
  }
}

cashRouter.get('/shift', authRequired, requireRoles('admin', 'cajero'), async (_req, res) => {
  try {
    const { fromAt, lastCloseAt } = await shiftBounds()
    const totals = await loadShiftTotals(fromAt)
    const stock = await loadShiftStock(fromAt)
    res.json({
      fromAt: fromAt.toISOString(),
      lastCloseAt,
      ...totals,
      stock,
    })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

cashRouter.get('/history', authRequired, requireRoles('admin', 'cajero'), async (_req, res) => {
  try {
    await ensureCashCloses()
    const pool = await getPool()
    const r = await pool.request().query(`
      SELECT TOP 20 Id, FromAt, ClosedAt, OrdersCount, SalesTotal, Efectivo, Yape, Tarjeta, CountedCash, Difference, Notes
      FROM dbo.CashCloses
      ORDER BY ClosedAt DESC
    `)
    res.json(
      r.recordset.map((row: Record<string, unknown>) => ({
        id: String(row.Id),
        fromAt: new Date(row.FromAt as string).toISOString(),
        closedAt: new Date(row.ClosedAt as string).toISOString(),
        ordersCount: Number(row.OrdersCount),
        salesTotal: Number(row.SalesTotal),
        efectivo: Number(row.Efectivo),
        yape: Number(row.Yape),
        tarjeta: Number(row.Tarjeta),
        countedCash: Number(row.CountedCash),
        difference: Number(row.Difference),
        notes: row.Notes ? String(row.Notes) : '',
      })),
    )
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

cashRouter.post('/close', authRequired, requireRoles('admin', 'cajero'), async (req, res) => {
  try {
    const countedCash = Math.max(0, Number(req.body?.countedCash ?? 0))
    const notes = String(req.body?.notes || '').trim().slice(0, 255)
    const signature = String(req.body?.signature || '').trim()
    const { fromAt } = await shiftBounds()
    const totals = await loadShiftTotals(fromAt)
    const difference = Math.round((countedCash - totals.efectivo) * 100) / 100
    const pool = await getPool()
    const id = uuid()
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, id)
      .input('from', sql.DateTime2, fromAt)
      .input('uid', sql.UniqueIdentifier, isGuid(req.user?.id) ? req.user!.id : null)
      .input('cnt', sql.Int, totals.ordersCount)
      .input('sales', sql.Decimal(12, 2), totals.salesTotal)
      .input('ef', sql.Decimal(12, 2), totals.efectivo)
      .input('yp', sql.Decimal(12, 2), totals.yape)
      .input('tj', sql.Decimal(12, 2), totals.tarjeta)
      .input('counted', sql.Decimal(12, 2), countedCash)
      .input('diff', sql.Decimal(12, 2), difference)
      .input('notes', sql.NVarChar, notes || null)
      .input('sig', sql.NVarChar(sql.MAX), signature || null)
      .query(`
        INSERT INTO dbo.CashCloses
          (Id, FromAt, ClosedAt, UserId, OrdersCount, SalesTotal, Efectivo, Yape, Tarjeta, CountedCash, Difference, Notes, Signature)
        VALUES
          (@id, @from, SYSUTCDATETIME(), @uid, @cnt, @sales, @ef, @yp, @tj, @counted, @diff, @notes, @sig)
      `)
    res.json({
      ok: true,
      id,
      fromAt: fromAt.toISOString(),
      closedAt: new Date().toISOString(),
      ...totals,
      countedCash,
      difference,
      notes,
    })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})
