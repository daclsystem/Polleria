import { v4 as uuid } from 'uuid'
import { getPool, sql } from '../db.js'
import { emitEvent } from '../realtime.js'

type DeductResult = {
  deducted: Array<{ inventoryId: string; name: string; delta: number; stockAfter: number }>
  lowStock: Array<{ inventoryId: string; name: string; stock: number; minStock: number }>
  itemIds: string[]
}

type StockOpts = {
  /** Si se indica, solo esos OrderItems */
  itemIds?: string[]
  /**
   * Filtrar por KitchenStatus.
   * - omitido: cualquier ítem del pedido
   * - ['en_cocina']: solo en fuego
   * - [null]: solo barra / venta (KitchenStatus IS NULL)
   */
  kitchenStatuses?: Array<'pendiente' | 'en_cocina' | 'listo' | null>
  reason?: 'cocina' | 'venta' | 'retorno' | 'cancelacion'
  notesPrefix?: string
}

async function ensureStockColumn(tx: InstanceType<typeof sql.Transaction>) {
  try {
    await new sql.Request(tx).query(`
      IF COL_LENGTH('dbo.OrderItems', 'StockDeducted') IS NULL
        ALTER TABLE dbo.OrderItems ADD StockDeducted BIT NOT NULL CONSTRAINT DF_OrderItems_StockDeducted DEFAULT (0);
    `)
  } catch {
    /* ignore */
  }
}

async function hasProductRecipes(tx: InstanceType<typeof sql.Transaction>) {
  const r = await new sql.Request(tx).query(`
    SELECT CASE WHEN OBJECT_ID(N'dbo.ProductRecipes', N'U') IS NULL THEN 0 ELSE 1 END AS ok
  `)
  return Boolean(Number(r.recordset[0]?.ok))
}

function kitchenFilterSql(statuses?: StockOpts['kitchenStatuses']) {
  if (!statuses || statuses.length === 0) return ''
  const parts: string[] = []
  const named = statuses.filter((s): s is 'pendiente' | 'en_cocina' | 'listo' => s != null)
  if (statuses.includes(null)) parts.push('KitchenStatus IS NULL')
  if (named.length) {
    const list = named.map((s) => `N'${s}'`).join(',')
    parts.push(`KitchenStatus IN (${list})`)
  }
  return parts.length ? `AND (${parts.join(' OR ')})` : ''
}

function itemIdsFilterSql(itemIds?: string[]) {
  if (!itemIds?.length) return { sql: '', ids: [] as string[] }
  const ids = itemIds.map(String).filter(Boolean)
  if (!ids.length) return { sql: '', ids: [] }
  const list = ids.map((id) => `'${id.replace(/'/g, '')}'`).join(',')
  return { sql: `AND Id IN (${list})`, ids }
}

type InvLine = { inventoryId: string; qtyPerUnit: number; label: string }

async function loadRecipeLines(
  tx: InstanceType<typeof sql.Transaction>,
  productId: string,
): Promise<InvLine[]> {
  const recipes = await new sql.Request(tx)
    .input('productId', sql.UniqueIdentifier, productId)
    .query(`
      SELECT r.InventoryId, r.QtyPerUnit, i.Name
      FROM dbo.ProductRecipes r
      INNER JOIN dbo.Inventory i ON i.Id = r.InventoryId
      WHERE r.ProductId = @productId
    `)
  return recipes.recordset.map((r: Record<string, unknown>) => ({
    inventoryId: String(r.InventoryId),
    qtyPerUnit: Number(r.QtyPerUnit),
    label: String(r.Name || ''),
  }))
}

async function loadOptionInvLines(
  tx: InstanceType<typeof sql.Transaction>,
  itemId: string,
): Promise<InvLine[]> {
  try {
    const hasCol = await new sql.Request(tx).query(`
      SELECT CASE WHEN COL_LENGTH('dbo.ProductOptions', 'InventoryId') IS NULL THEN 0 ELSE 1 END AS ok
    `)
    if (!Number(hasCol.recordset[0]?.ok)) return []
    const opts = await new sql.Request(tx)
      .input('itemId', sql.UniqueIdentifier, itemId)
      .query(`
        SELECT po.InventoryId, po.QtyPerUnit, i.Name, oio.Name AS OptionName
        FROM dbo.OrderItemOptions oio
        INNER JOIN dbo.ProductOptions po ON po.Id = oio.OptionId
        INNER JOIN dbo.Inventory i ON i.Id = po.InventoryId
        WHERE oio.OrderItemId = @itemId
          AND po.InventoryId IS NOT NULL
          AND ISNULL(po.QtyPerUnit, 0) > 0
      `)
    return opts.recordset.map((r: Record<string, unknown>) => ({
      inventoryId: String(r.InventoryId),
      qtyPerUnit: Number(r.QtyPerUnit),
      label: String(r.OptionName || r.Name || ''),
    }))
  } catch {
    return []
  }
}

async function applyStockDelta(
  tx: InstanceType<typeof sql.Transaction>,
  result: DeductResult,
  opts: {
    inventoryId: string
    delta: number
    orderId: string
    itemId: string
    notes: string
    reason: string
    userId?: string | null
    clampZero?: boolean
  },
) {
  const delta = Math.round(opts.delta * 1000) / 1000
  if (!delta) return
  const upd = await new sql.Request(tx)
    .input('id', sql.UniqueIdentifier, opts.inventoryId)
    .input('delta', sql.Decimal(12, 3), delta)
    .query(
      opts.clampZero
        ? `
          UPDATE dbo.Inventory
          SET Stock = CASE WHEN Stock + @delta < 0 THEN 0 ELSE Stock + @delta END,
              UpdatedAt = SYSUTCDATETIME()
          OUTPUT INSERTED.Stock, INSERTED.MinStock, INSERTED.Name
          WHERE Id = @id
        `
        : `
          UPDATE dbo.Inventory
          SET Stock = Stock + @delta, UpdatedAt = SYSUTCDATETIME()
          OUTPUT INSERTED.Stock, INSERTED.MinStock, INSERTED.Name
          WHERE Id = @id
        `,
    )
  const row = upd.recordset[0]
  const stockAfter = Number(row?.Stock ?? 0)
  const minStock = Number(row?.MinStock ?? 0)
  const name = String(row?.Name || '')
  result.deducted.push({
    inventoryId: opts.inventoryId,
    name,
    delta,
    stockAfter,
  })
  if (delta < 0 && stockAfter <= minStock) {
    result.lowStock.push({ inventoryId: opts.inventoryId, name, stock: stockAfter, minStock })
  }
  try {
    await new sql.Request(tx)
      .input('id', sql.UniqueIdentifier, uuid())
      .input('inventoryId', sql.UniqueIdentifier, opts.inventoryId)
      .input('delta', sql.Decimal(12, 3), delta)
      .input('stockAfter', sql.Decimal(12, 3), stockAfter)
      .input('orderId', sql.UniqueIdentifier, opts.orderId)
      .input('orderItemId', sql.UniqueIdentifier, opts.itemId)
      .input('notes', sql.NVarChar, opts.notes)
      .input('userId', sql.UniqueIdentifier, opts.userId || null)
      .input('reason', sql.NVarChar, opts.reason)
      .query(`
        IF OBJECT_ID(N'dbo.InventoryMovements', N'U') IS NOT NULL
        INSERT INTO dbo.InventoryMovements
          (Id, InventoryId, Delta, StockAfter, Reason, OrderId, OrderItemId, Notes, CreatedByUserId)
        VALUES
          (@id, @inventoryId, @delta, @stockAfter, @reason, @orderId, @orderItemId, @notes, @userId)
      `)
  } catch {
    /* kardex opcional */
  }
}

/**
 * Baja de almacén según receta × qty.
 * Idempotente vía OrderItems.StockDeducted.
 * El cocinero puede sacar antes (pendiente) o al pasar a en_cocina.
 */
export async function deductStockForOrderItems(
  orderId: string,
  tx: InstanceType<typeof sql.Transaction>,
  userId?: string | null,
  opts: StockOpts = {},
): Promise<DeductResult> {
  const result: DeductResult = { deducted: [], lowStock: [], itemIds: [] }
  await ensureStockColumn(tx)
  if (!(await hasProductRecipes(tx))) return result

  const reason = opts.reason || 'cocina'
  const prefix = opts.notesPrefix || (reason === 'venta' ? 'Venta' : 'Sacar')
  const kFilter = kitchenFilterSql(opts.kitchenStatuses)
  const idFilter = itemIdsFilterSql(opts.itemIds)

  const items = await new sql.Request(tx)
    .input('orderId', sql.UniqueIdentifier, orderId)
    .query(`
      SELECT Id, ProductId, Qty, Name, ISNULL(StockDeducted, 0) AS StockDeducted
      FROM dbo.OrderItems
      WHERE OrderId = @orderId
        AND ProductId IS NOT NULL
        AND ISNULL(StockDeducted, 0) = 0
        ${kFilter}
        ${idFilter.sql}
    `)

  if (!items.recordset.length) return result

  for (const it of items.recordset) {
    const itemId = String(it.Id)
    const productId = String(it.ProductId)
    const qty = Number(it.Qty || 0)
    if (!qty) continue

    const lines = [
      ...(await loadRecipeLines(tx, productId)),
      ...(await loadOptionInvLines(tx, itemId)),
    ]
    if (!lines.length) {
      await new sql.Request(tx)
        .input('id', sql.UniqueIdentifier, itemId)
        .query(`UPDATE dbo.OrderItems SET StockDeducted = 1 WHERE Id = @id`)
      result.itemIds.push(itemId)
      continue
    }

    for (const line of lines) {
      const consume = Math.round(line.qtyPerUnit * qty * 1000) / 1000
      if (consume <= 0) continue
      await applyStockDelta(tx, result, {
        inventoryId: line.inventoryId,
        delta: -consume,
        orderId,
        itemId,
        notes: `${prefix} · ${it.Name} ×${qty}${line.label ? ` · ${line.label}` : ''}`,
        reason,
        userId,
        clampZero: true,
      })
    }

    await new sql.Request(tx)
      .input('id', sql.UniqueIdentifier, itemId)
      .query(`UPDATE dbo.OrderItems SET StockDeducted = 1 WHERE Id = @id`)
    result.itemIds.push(itemId)
  }

  return result
}

/** Alias: al pasar a “En fuego” */
export async function deductStockForKitchenItems(
  orderId: string,
  tx: InstanceType<typeof sql.Transaction>,
  userId?: string | null,
) {
  return deductStockForOrderItems(orderId, tx, userId, {
    kitchenStatuses: ['en_cocina'],
    reason: 'cocina',
    notesPrefix: 'Cocina',
  })
}

/** Al cobrar: baja recetas de todos los ítems (pollo 0.5, gaseosa 1, etc.) con mesa y hora. */
export async function deductStockForSaleItems(
  orderId: string,
  tx: InstanceType<typeof sql.Transaction>,
  userId?: string | null,
) {
  let mesa = 'Mostrador'
  try {
    const meta = await new sql.Request(tx)
      .input('orderId', sql.UniqueIdentifier, orderId)
      .query(`
        SELECT t.Number AS TableNumber
        FROM dbo.Orders o
        LEFT JOIN dbo.Tables t ON t.Id = o.TableId
        WHERE o.Id = @orderId
      `)
    const n = meta.recordset[0]?.TableNumber
    if (n != null) mesa = `Mesa ${n}`
  } catch {
    /* ignore */
  }
  const hora = new Date().toLocaleTimeString('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Lima',
  })
  return deductStockForOrderItems(orderId, tx, userId, {
    reason: 'venta',
    notesPrefix: `Salida · ${mesa} · ${hora}`,
  })
}

/**
 * Retorno a almacén (devolución manual o cancelación).
 * Solo ítems con StockDeducted = 1.
 */
export async function restoreStockForOrderItems(
  orderId: string,
  tx: InstanceType<typeof sql.Transaction>,
  userId?: string | null,
  opts: StockOpts = {},
): Promise<DeductResult> {
  const result: DeductResult = { deducted: [], lowStock: [], itemIds: [] }
  await ensureStockColumn(tx)
  if (!(await hasProductRecipes(tx))) return result

  const reason = opts.reason || 'retorno'
  const prefix = opts.notesPrefix || (reason === 'cancelacion' ? 'Cancelación' : 'Retorno')
  const kFilter = kitchenFilterSql(opts.kitchenStatuses)
  const idFilter = itemIdsFilterSql(opts.itemIds)

  const items = await new sql.Request(tx)
    .input('orderId', sql.UniqueIdentifier, orderId)
    .query(`
      SELECT Id, ProductId, Qty, Name
      FROM dbo.OrderItems
      WHERE OrderId = @orderId
        AND ProductId IS NOT NULL
        AND ISNULL(StockDeducted, 0) = 1
        ${kFilter}
        ${idFilter.sql}
    `)

  for (const it of items.recordset) {
    const itemId = String(it.Id)
    const qty = Number(it.Qty || 0)
    const lines = [
      ...(await loadRecipeLines(tx, String(it.ProductId))),
      ...(await loadOptionInvLines(tx, itemId)),
    ]
    for (const line of lines) {
      const restore = Math.round(line.qtyPerUnit * qty * 1000) / 1000
      if (restore <= 0) continue
      await applyStockDelta(tx, result, {
        inventoryId: line.inventoryId,
        delta: restore,
        orderId,
        itemId,
        notes: `${prefix} · ${it.Name}${line.label ? ` · ${line.label}` : ''}`,
        reason,
        userId,
      })
    }
    await new sql.Request(tx)
      .input('id', sql.UniqueIdentifier, itemId)
      .query(`UPDATE dbo.OrderItems SET StockDeducted = 0 WHERE Id = @id`)
    result.itemIds.push(itemId)
  }

  return result
}

export async function restoreStockForCancelledOrder(
  orderId: string,
  tx: InstanceType<typeof sql.Transaction>,
  userId?: string | null,
) {
  await restoreStockForOrderItems(orderId, tx, userId, {
    reason: 'cancelacion',
    notesPrefix: 'Cancelación',
  })
}

export async function publishInventorySnapshot() {
  try {
    const pool = await getPool()
    const r = await pool.request().query(`
      SELECT Id, Name, Unit, Stock, MinStock, Cost FROM dbo.Inventory ORDER BY Name
    `)
    const inventory = r.recordset.map((row: Record<string, unknown>) => ({
      id: String(row.Id),
      name: row.Name,
      unit: row.Unit,
      stock: Number(row.Stock),
      minStock: Number(row.MinStock),
      cost: Number(row.Cost),
    }))
    const lowStock = inventory.filter((i) => i.stock <= i.minStock)
    emitEvent('inventory:updated', { inventory, lowStock }, ['ops', 'cocina', 'caja'])
  } catch (e) {
    console.warn('[inventory] publish', (e as Error).message)
  }
}
