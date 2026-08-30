import { Router } from 'express'
import { randomUUID } from 'crypto'
import { getPool, sql } from '../db.js'
import { authRequired, requireRoles } from '../auth.js'

export const couponsRouter = Router()

export type CouponRow = {
  Id: string
  Code: string
  Title: string
  Description: string | null
  DiscountType: string
  DiscountValue: number
  MinSubtotal: number
  MaxDiscount: number | null
  StartsAt: Date | null
  EndsAt: Date | null
  MaxUsesTotal: number | null
  MaxUsesPerCustomer: number
  UsedCount: number
  Active: boolean
  CreatedAt: Date
}

export function mapCoupon(r: CouponRow) {
  return {
    id: String(r.Id),
    code: String(r.Code),
    title: String(r.Title),
    description: r.Description || '',
    discountType: r.DiscountType === 'percent' ? ('percent' as const) : ('fixed' as const),
    discountValue: Number(r.DiscountValue),
    minSubtotal: Number(r.MinSubtotal || 0),
    maxDiscount: r.MaxDiscount != null ? Number(r.MaxDiscount) : null,
    startsAt: r.StartsAt ? new Date(r.StartsAt).toISOString() : null,
    endsAt: r.EndsAt ? new Date(r.EndsAt).toISOString() : null,
    maxUsesTotal: r.MaxUsesTotal != null ? Number(r.MaxUsesTotal) : null,
    maxUsesPerCustomer: Number(r.MaxUsesPerCustomer ?? 1),
    usedCount: Number(r.UsedCount || 0),
    active: Boolean(r.Active),
    createdAt: r.CreatedAt ? new Date(r.CreatedAt).toISOString() : new Date().toISOString(),
  }
}

export type Coupon = ReturnType<typeof mapCoupon>

export function computeCouponDiscount(
  coupon: Coupon,
  subtotal: number,
): { ok: true; discount: number } | { ok: false; error: string } {
  if (!coupon.active) return { ok: false, error: 'Cupón no disponible' }
  const now = Date.now()
  if (coupon.startsAt && new Date(coupon.startsAt).getTime() > now) {
    return { ok: false, error: 'Cupón aún no vigente' }
  }
  if (coupon.endsAt && new Date(coupon.endsAt).getTime() < now) {
    return { ok: false, error: 'Cupón vencido' }
  }
  if (coupon.maxUsesTotal != null && coupon.usedCount >= coupon.maxUsesTotal) {
    return { ok: false, error: 'Cupón agotado' }
  }
  if (subtotal < coupon.minSubtotal) {
    return { ok: false, error: `Pedido mínimo S/ ${coupon.minSubtotal.toFixed(2)}` }
  }
  let discount =
    coupon.discountType === 'percent'
      ? Math.round(((subtotal * coupon.discountValue) / 100) * 100) / 100
      : coupon.discountValue
  if (coupon.maxDiscount != null) discount = Math.min(discount, coupon.maxDiscount)
  discount = Math.max(0, Math.min(discount, subtotal))
  discount = Math.round(discount * 100) / 100
  if (discount <= 0) return { ok: false, error: 'Cupón sin descuento aplicable' }
  return { ok: true, discount }
}

export async function loadCouponByCode(code: string) {
  const pool = await getPool()
  const r = await pool
    .request()
    .input('code', sql.NVarChar, code.trim().toUpperCase())
    .query(`SELECT TOP 1 * FROM dbo.Coupons WHERE UPPER(Code) = @code`)
  const row = r.recordset[0] as CouponRow | undefined
  return row ? mapCoupon(row) : null
}

export async function customerCouponUses(couponId: string, customerId: string) {
  const pool = await getPool()
  const r = await pool
    .request()
    .input('couponId', sql.UniqueIdentifier, couponId)
    .input('customerId', sql.UniqueIdentifier, customerId)
    .query(
      `SELECT COUNT(*) AS n FROM dbo.CouponRedemptions WHERE CouponId=@couponId AND CustomerId=@customerId`,
    )
  return Number(r.recordset[0]?.n || 0)
}

couponsRouter.get('/public', async (_req, res) => {
  try {
    const pool = await getPool()
    const r = await pool.request().query(`
      SELECT * FROM dbo.Coupons
      WHERE Active = 1
        AND (StartsAt IS NULL OR StartsAt <= SYSUTCDATETIME())
        AND (EndsAt IS NULL OR EndsAt >= SYSUTCDATETIME())
        AND (MaxUsesTotal IS NULL OR UsedCount < MaxUsesTotal)
      ORDER BY CreatedAt DESC
    `)
    res.json({ coupons: (r.recordset as CouponRow[]).map(mapCoupon) })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

couponsRouter.post('/validate', authRequired, async (req, res) => {
  try {
    const code = String(req.body?.code || '').trim()
    const subtotal = Number(req.body?.subtotal || 0)
    if (!code) return res.status(400).json({ error: 'Código requerido' })
    const coupon = await loadCouponByCode(code)
    if (!coupon) return res.status(404).json({ error: 'Cupón no encontrado' })
    if (req.user?.role === 'customer' && req.user.id) {
      const uses = await customerCouponUses(coupon.id, req.user.id)
      if (uses >= coupon.maxUsesPerCustomer) {
        return res.status(400).json({ error: 'Ya usaste este cupón el máximo de veces' })
      }
    }
    const calc = computeCouponDiscount(coupon, subtotal)
    if (!calc.ok) return res.status(400).json({ error: calc.error })
    res.json({ coupon, discount: calc.discount })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

couponsRouter.get('/', authRequired, requireRoles('admin'), async (_req, res) => {
  try {
    const pool = await getPool()
    const r = await pool.request().query(`SELECT * FROM dbo.Coupons ORDER BY CreatedAt DESC`)
    res.json({ coupons: (r.recordset as CouponRow[]).map(mapCoupon) })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

couponsRouter.post('/', authRequired, requireRoles('admin'), async (req, res) => {
  try {
    const b = req.body as Record<string, unknown>
    const code = String(b.code || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '')
    const title = String(b.title || '').trim()
    const discountType = b.discountType === 'percent' ? 'percent' : 'fixed'
    const discountValue = Number(b.discountValue)
    if (!code || !title || !(discountValue > 0)) {
      return res.status(400).json({ error: 'Código, título y valor requeridos' })
    }
    const id = randomUUID()
    const pool = await getPool()
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, id)
      .input('code', sql.NVarChar, code)
      .input('title', sql.NVarChar, title)
      .input('description', sql.NVarChar, String(b.description || '').trim() || null)
      .input('discountType', sql.NVarChar, discountType)
      .input('discountValue', sql.Decimal(10, 2), discountValue)
      .input('minSubtotal', sql.Decimal(10, 2), Number(b.minSubtotal || 0))
      .input(
        'maxDiscount',
        sql.Decimal(10, 2),
        b.maxDiscount != null && b.maxDiscount !== '' ? Number(b.maxDiscount) : null,
      )
      .input('startsAt', sql.DateTime2, b.startsAt ? new Date(String(b.startsAt)) : null)
      .input('endsAt', sql.DateTime2, b.endsAt ? new Date(String(b.endsAt)) : null)
      .input(
        'maxUsesTotal',
        sql.Int,
        b.maxUsesTotal != null && b.maxUsesTotal !== '' ? Number(b.maxUsesTotal) : null,
      )
      .input('maxUsesPerCustomer', sql.Int, Number(b.maxUsesPerCustomer ?? 1))
      .input('active', sql.Bit, b.active === false ? 0 : 1)
      .query(`
        INSERT INTO dbo.Coupons (
          Id, Code, Title, Description, DiscountType, DiscountValue, MinSubtotal, MaxDiscount,
          StartsAt, EndsAt, MaxUsesTotal, MaxUsesPerCustomer, Active
        ) VALUES (
          @id, @code, @title, @description, @discountType, @discountValue, @minSubtotal, @maxDiscount,
          @startsAt, @endsAt, @maxUsesTotal, @maxUsesPerCustomer, @active
        )
      `)
    res.json({ coupon: await loadCouponByCode(code) })
  } catch (e) {
    const msg = (e as Error).message
    if (/UNIQUE|UQ_Coupons/i.test(msg)) return res.status(409).json({ error: 'Ese código ya existe' })
    res.status(500).json({ error: msg })
  }
})

couponsRouter.put('/:id', authRequired, requireRoles('admin'), async (req, res) => {
  try {
    const b = req.body as Record<string, unknown>
    const code = String(b.code || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '')
    const title = String(b.title || '').trim()
    const discountType = b.discountType === 'percent' ? 'percent' : 'fixed'
    const discountValue = Number(b.discountValue)
    if (!code || !title || !(discountValue > 0)) {
      return res.status(400).json({ error: 'Código, título y valor requeridos' })
    }
    const pool = await getPool()
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, req.params.id)
      .input('code', sql.NVarChar, code)
      .input('title', sql.NVarChar, title)
      .input('description', sql.NVarChar, String(b.description || '').trim() || null)
      .input('discountType', sql.NVarChar, discountType)
      .input('discountValue', sql.Decimal(10, 2), discountValue)
      .input('minSubtotal', sql.Decimal(10, 2), Number(b.minSubtotal || 0))
      .input(
        'maxDiscount',
        sql.Decimal(10, 2),
        b.maxDiscount != null && b.maxDiscount !== '' ? Number(b.maxDiscount) : null,
      )
      .input('startsAt', sql.DateTime2, b.startsAt ? new Date(String(b.startsAt)) : null)
      .input('endsAt', sql.DateTime2, b.endsAt ? new Date(String(b.endsAt)) : null)
      .input(
        'maxUsesTotal',
        sql.Int,
        b.maxUsesTotal != null && b.maxUsesTotal !== '' ? Number(b.maxUsesTotal) : null,
      )
      .input('maxUsesPerCustomer', sql.Int, Number(b.maxUsesPerCustomer ?? 1))
      .input('active', sql.Bit, b.active === false ? 0 : 1)
      .query(`
        UPDATE dbo.Coupons SET
          Code=@code, Title=@title, Description=@description, DiscountType=@discountType,
          DiscountValue=@discountValue, MinSubtotal=@minSubtotal, MaxDiscount=@maxDiscount,
          StartsAt=@startsAt, EndsAt=@endsAt, MaxUsesTotal=@maxUsesTotal,
          MaxUsesPerCustomer=@maxUsesPerCustomer, Active=@active
        WHERE Id=@id
      `)
    res.json({ coupon: await loadCouponByCode(code) })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

couponsRouter.delete('/:id', authRequired, requireRoles('admin'), async (req, res) => {
  try {
    const pool = await getPool()
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, req.params.id)
      .query(`UPDATE dbo.Coupons SET Active=0 WHERE Id=@id`)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})
