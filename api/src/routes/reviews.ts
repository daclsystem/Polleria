import { Router } from 'express'
import { v4 as uuid } from 'uuid'
import { getPool, sql } from '../db.js'
import { authRequired } from '../auth.js'

export const reviewsRouter = Router()

async function ensureReviewsTable() {
  const pool = await getPool()
  await pool.request().query(`
    IF OBJECT_ID(N'dbo.ProductReviews', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.ProductReviews (
        Id          UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_ProductReviews PRIMARY KEY DEFAULT NEWID(),
        ProductId   UNIQUEIDENTIFIER NOT NULL,
        CustomerId  UNIQUEIDENTIFIER NULL,
        CustomerName NVARCHAR(120)   NOT NULL,
        Stars       TINYINT          NOT NULL,
        Comment     NVARCHAR(500)    NULL,
        OrderId     UNIQUEIDENTIFIER NULL,
        CreatedAt   DATETIME2        NOT NULL CONSTRAINT DF_ProductReviews_Created DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_ProductReviews_Stars CHECK (Stars BETWEEN 1 AND 5)
      );
      CREATE INDEX IX_ProductReviews_Product ON dbo.ProductReviews (ProductId, CreatedAt DESC);
    END
  `)
}

reviewsRouter.get('/product/:productId', async (req, res) => {
  try {
    await ensureReviewsTable()
    const pool = await getPool()
    const r = await pool
      .request()
      .input('pid', sql.UniqueIdentifier, req.params.productId)
      .query(`
        SELECT TOP 40 Id, ProductId, CustomerName, Stars, Comment, CreatedAt
        FROM dbo.ProductReviews
        WHERE ProductId = @pid
        ORDER BY CreatedAt DESC
      `)
    const reviews = r.recordset.map((row: Record<string, unknown>) => ({
      id: String(row.Id),
      productId: String(row.ProductId),
      customerName: String(row.CustomerName),
      stars: Number(row.Stars),
      comment: row.Comment ? String(row.Comment) : '',
      createdAt: new Date(row.CreatedAt as string).toISOString(),
    }))
    const avg =
      reviews.length > 0 ? reviews.reduce((s, x) => s + x.stars, 0) / reviews.length : 0
    res.json({ reviews, average: Math.round(avg * 10) / 10, count: reviews.length })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

reviewsRouter.post('/', authRequired, async (req, res) => {
  try {
    const user = req.user
    if (!user || (user.role !== 'customer' && user.accountType !== 'customer')) {
      return res.status(403).json({ error: 'Solo clientes pueden calificar' })
    }
    const { productId, stars, comment, orderId } = req.body as {
      productId?: string
      stars?: number
      comment?: string
      orderId?: string
    }
    const s = Number(stars)
    if (!productId || !Number.isFinite(s) || s < 1 || s > 5) {
      return res.status(400).json({ error: 'Producto y estrellas (1-5) requeridos' })
    }
    await ensureReviewsTable()
    const pool = await getPool()
    const id = uuid()
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, id)
      .input('pid', sql.UniqueIdentifier, productId)
      .input('cid', sql.UniqueIdentifier, user.id)
      .input('name', sql.NVarChar, user.name || 'Cliente')
      .input('stars', sql.TinyInt, Math.round(s))
      .input('comment', sql.NVarChar, (comment || '').trim().slice(0, 500) || null)
      .input('oid', sql.UniqueIdentifier, orderId || null)
      .query(`
        INSERT INTO dbo.ProductReviews (Id, ProductId, CustomerId, CustomerName, Stars, Comment, OrderId)
        VALUES (@id, @pid, @cid, @name, @stars, @comment, @oid)
      `)
    res.status(201).json({
      id,
      productId,
      customerName: user.name || 'Cliente',
      stars: Math.round(s),
      comment: (comment || '').trim().slice(0, 500),
      createdAt: new Date().toISOString(),
    })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})
