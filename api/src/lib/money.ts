import { getPool, sql } from '../db.js'

export function round2(n: number) {
  return Math.round(n * 100) / 100
}

/** DECIMAL/mssql a número finito. Evita Number(objeto) → NaN y vacíos → 0 silencioso. */
export function num(value: unknown, fallback = 0): number {
  if (value == null || value === '') return fallback
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'string') {
    const n = Number(value.replace(',', '.').trim())
    return Number.isFinite(n) ? n : fallback
  }
  if (typeof value === 'object') {
    const rec = value as { valueOf?: () => unknown; toString?: () => string }
    if (typeof rec.valueOf === 'function') {
      const v = rec.valueOf()
      if (v !== value) return num(v, fallback)
    }
    if (typeof rec.toString === 'function') {
      const s = rec.toString()
      if (s && s !== '[object Object]') return num(s, fallback)
    }
  }
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function moneyFromItemLines(
  items: Array<{ qty?: unknown; Qty?: unknown; price?: unknown; Price?: unknown }>,
  discount = 0,
  igvRate = 0.18,
) {
  const rate = igvRate > 0 ? igvRate : 0.18
  const gross = items.reduce((s, i) => s + num(i.qty ?? i.Qty) * num(i.price ?? i.Price), 0)
  const total = Math.max(0, round2(gross - num(discount)))
  const subtotal = round2(total / (1 + rate))
  const igv = round2(total - subtotal)
  return { subtotal, igv, total, gross: round2(gross) }
}

/** Si el total persistido no cuadra con ítems, ganan los ítems (descuento incluido). */
export function pickOrderMoney(
  stored: {
    total?: unknown
    Total?: unknown
    subtotal?: unknown
    Subtotal?: unknown
    igv?: unknown
    Igv?: unknown
    discount?: unknown
    Discount?: unknown
  },
  items: Array<{ qty?: unknown; Qty?: unknown; price?: unknown; Price?: unknown }>,
  igvRate = 0.18,
) {
  const discount = num(stored.discount ?? stored.Discount)
  const computed = moneyFromItemLines(items, discount, igvRate)
  const storedTotal = num(stored.total ?? stored.Total)
  if (items.length > 0 && Math.abs(storedTotal - computed.total) > 0.01) {
    return { ...computed, discount }
  }
  return {
    subtotal: round2(num(stored.subtotal ?? stored.Subtotal, computed.subtotal)),
    igv: round2(num(stored.igv ?? stored.Igv, computed.igv)),
    total: round2(storedTotal),
    discount,
    gross: computed.gross,
  }
}

export async function loadIgvRate(tx?: sql.Transaction): Promise<number> {
  try {
    const req = tx ? new sql.Request(tx) : (await getPool()).request()
    const r = await req.query(`SELECT TOP 1 IgvRate FROM dbo.Settings WHERE Id = 1`)
    const v = num(r.recordset[0]?.IgvRate, 0.18)
    return v > 0 ? v : 0.18
  } catch {
    return 0.18
  }
}

/** Recalcula Subtotal/Igv/Total desde OrderItems. Fuente de verdad en servidor. */
export async function persistOrderTotals(
  tx: sql.Transaction,
  orderId: string,
  discount?: number,
) {
  const igvRate = await loadIgvRate(tx)
  let disc = discount
  if (disc == null) {
    const d = await new sql.Request(tx)
      .input('id', sql.UniqueIdentifier, orderId)
      .query(`SELECT Discount FROM dbo.Orders WHERE Id=@id`)
    disc = num(d.recordset[0]?.Discount)
  }
  disc = round2(num(disc))
  const r = await new sql.Request(tx).input('id', sql.UniqueIdentifier, orderId).query(`
    SELECT ISNULL(SUM(CAST(Qty AS DECIMAL(12, 4)) * Price), 0) AS Gross
    FROM dbo.OrderItems
    WHERE OrderId=@id
  `)
  const gross = round2(num(r.recordset[0]?.Gross))
  const total = Math.max(0, round2(gross - disc))
  const subtotal = round2(total / (1 + igvRate))
  const igv = round2(total - subtotal)
  await new sql.Request(tx)
    .input('id', sql.UniqueIdentifier, orderId)
    .input('discount', sql.Decimal(10, 2), disc)
    .input('subtotal', sql.Decimal(10, 2), subtotal)
    .input('igv', sql.Decimal(10, 2), igv)
    .input('total', sql.Decimal(10, 2), total)
    .query(`
      UPDATE dbo.Orders
      SET Discount=@discount, Subtotal=@subtotal, Igv=@igv, Total=@total, UpdatedAt=SYSUTCDATETIME()
      WHERE Id=@id
    `)
  return { subtotal, igv, total, discount: disc }
}
