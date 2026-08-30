import { Router } from 'express'
import { randomUUID } from 'crypto'
import { getPool, sql } from '../db.js'
import { authRequired } from '../auth.js'

export const customerAddressesRouter = Router()

type AddrRow = {
  Id: string
  CustomerId: string
  Label: string
  Address: string
  Lat: number | null
  Lng: number | null
  IsDefault: boolean
  CreatedAt: Date
}

function mapAddr(r: AddrRow) {
  return {
    id: String(r.Id),
    customerId: String(r.CustomerId),
    label: String(r.Label),
    address: String(r.Address),
    lat: r.Lat != null ? Number(r.Lat) : null,
    lng: r.Lng != null ? Number(r.Lng) : null,
    isDefault: Boolean(r.IsDefault),
    createdAt: r.CreatedAt ? new Date(r.CreatedAt).toISOString() : new Date().toISOString(),
  }
}

function customerIdOr403(
  req: { user?: { role?: string; id?: string } },
  res: { status: (n: number) => { json: (b: unknown) => unknown } },
) {
  if (!req.user || req.user.role !== 'customer' || !req.user.id) {
    res.status(403).json({ error: 'Solo clientes' })
    return null
  }
  return req.user.id
}

customerAddressesRouter.get('/', authRequired, async (req, res) => {
  try {
    const customerId = customerIdOr403(req, res)
    if (!customerId) return
    const pool = await getPool()
    const r = await pool
      .request()
      .input('customerId', sql.UniqueIdentifier, customerId)
      .query(`
        SELECT * FROM dbo.CustomerAddresses
        WHERE CustomerId=@customerId
        ORDER BY IsDefault DESC, CreatedAt DESC
      `)
    res.json({ addresses: (r.recordset as AddrRow[]).map(mapAddr) })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

customerAddressesRouter.post('/', authRequired, async (req, res) => {
  try {
    const customerId = customerIdOr403(req, res)
    if (!customerId) return
    const label = String(req.body?.label || 'Casa').trim().slice(0, 80) || 'Casa'
    const address = String(req.body?.address || '').trim()
    if (!address) return res.status(400).json({ error: 'Dirección requerida' })
    const lat = req.body?.lat != null && req.body.lat !== '' ? Number(req.body.lat) : null
    const lng = req.body?.lng != null && req.body.lng !== '' ? Number(req.body.lng) : null
    const wantDefault = Boolean(req.body?.isDefault)
    const id = randomUUID()
    const pool = await getPool()
    const tx = new sql.Transaction(pool)
    await tx.begin()
    try {
      const countRes = await new sql.Request(tx)
        .input('customerId', sql.UniqueIdentifier, customerId)
        .query(`SELECT COUNT(*) AS n FROM dbo.CustomerAddresses WHERE CustomerId=@customerId`)
      const makeDefault = wantDefault || Number(countRes.recordset[0]?.n || 0) === 0
      if (makeDefault) {
        await new sql.Request(tx)
          .input('customerId', sql.UniqueIdentifier, customerId)
          .query(`UPDATE dbo.CustomerAddresses SET IsDefault=0 WHERE CustomerId=@customerId`)
      }
      await new sql.Request(tx)
        .input('id', sql.UniqueIdentifier, id)
        .input('customerId', sql.UniqueIdentifier, customerId)
        .input('label', sql.NVarChar, label)
        .input('address', sql.NVarChar, address)
        .input('lat', sql.Decimal(10, 7), lat)
        .input('lng', sql.Decimal(10, 7), lng)
        .input('isDefault', sql.Bit, makeDefault ? 1 : 0)
        .query(`
          INSERT INTO dbo.CustomerAddresses (Id, CustomerId, Label, Address, Lat, Lng, IsDefault)
          VALUES (@id, @customerId, @label, @address, @lat, @lng, @isDefault)
        `)
      if (makeDefault) {
        await new sql.Request(tx)
          .input('customerId', sql.UniqueIdentifier, customerId)
          .input('address', sql.NVarChar, address)
          .query(`UPDATE dbo.Customers SET Address=@address WHERE Id=@customerId`)
      }
      await tx.commit()
    } catch (e) {
      await tx.rollback()
      throw e
    }
    const saved = await pool
      .request()
      .input('id', sql.UniqueIdentifier, id)
      .query(`SELECT TOP 1 * FROM dbo.CustomerAddresses WHERE Id=@id`)
    res.json({ address: mapAddr(saved.recordset[0] as AddrRow) })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

customerAddressesRouter.put('/:id', authRequired, async (req, res) => {
  try {
    const customerId = customerIdOr403(req, res)
    if (!customerId) return
    const label = String(req.body?.label || 'Casa').trim().slice(0, 80) || 'Casa'
    const address = String(req.body?.address || '').trim()
    if (!address) return res.status(400).json({ error: 'Dirección requerida' })
    const lat = req.body?.lat != null && req.body.lat !== '' ? Number(req.body.lat) : null
    const lng = req.body?.lng != null && req.body.lng !== '' ? Number(req.body.lng) : null
    const isDefault = Boolean(req.body?.isDefault)
    const pool = await getPool()
    const own = await pool
      .request()
      .input('id', sql.UniqueIdentifier, req.params.id)
      .input('customerId', sql.UniqueIdentifier, customerId)
      .query(`SELECT TOP 1 Id FROM dbo.CustomerAddresses WHERE Id=@id AND CustomerId=@customerId`)
    if (!own.recordset[0]) return res.status(404).json({ error: 'No encontrada' })
    const tx = new sql.Transaction(pool)
    await tx.begin()
    try {
      if (isDefault) {
        await new sql.Request(tx)
          .input('customerId', sql.UniqueIdentifier, customerId)
          .query(`UPDATE dbo.CustomerAddresses SET IsDefault=0 WHERE CustomerId=@customerId`)
      }
      await new sql.Request(tx)
        .input('id', sql.UniqueIdentifier, req.params.id)
        .input('label', sql.NVarChar, label)
        .input('address', sql.NVarChar, address)
        .input('lat', sql.Decimal(10, 7), lat)
        .input('lng', sql.Decimal(10, 7), lng)
        .input('isDefault', sql.Bit, isDefault ? 1 : 0)
        .query(`
          UPDATE dbo.CustomerAddresses
          SET Label=@label, Address=@address, Lat=@lat, Lng=@lng, IsDefault=@isDefault
          WHERE Id=@id
        `)
      if (isDefault) {
        await new sql.Request(tx)
          .input('customerId', sql.UniqueIdentifier, customerId)
          .input('address', sql.NVarChar, address)
          .query(`UPDATE dbo.Customers SET Address=@address WHERE Id=@customerId`)
      }
      await tx.commit()
    } catch (e) {
      await tx.rollback()
      throw e
    }
    const saved = await pool
      .request()
      .input('id', sql.UniqueIdentifier, req.params.id)
      .query(`SELECT TOP 1 * FROM dbo.CustomerAddresses WHERE Id=@id`)
    res.json({ address: mapAddr(saved.recordset[0] as AddrRow) })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

customerAddressesRouter.delete('/:id', authRequired, async (req, res) => {
  try {
    const customerId = customerIdOr403(req, res)
    if (!customerId) return
    const pool = await getPool()
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, req.params.id)
      .input('customerId', sql.UniqueIdentifier, customerId)
      .query(`DELETE FROM dbo.CustomerAddresses WHERE Id=@id AND CustomerId=@customerId`)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

/** PATCH /api/customer/profile — actualizar nombre y/o foto del cliente */
customerAddressesRouter.patch('/profile', authRequired, async (req, res) => {
  try {
    const customerId = customerIdOr403(req, res)
    if (!customerId) return
    const { name, photoUrl } = req.body as { name?: string; photoUrl?: string }
    const pool = await getPool()
    const sets: string[] = []
    const rq = pool.request().input('id', sql.UniqueIdentifier, customerId)
    if (name && name.trim()) {
      sets.push('Name = @name')
      rq.input('name', sql.NVarChar, name.trim().slice(0, 120))
    }
    if (photoUrl !== undefined) {
      sets.push('PhotoUrl = @photo')
      rq.input('photo', sql.NVarChar, photoUrl || null)
    }
    if (sets.length === 0) {
      return res.status(400).json({ error: 'Nada que actualizar' })
    }
    await rq.query(`UPDATE dbo.Customers SET ${sets.join(', ')} WHERE Id = @id`)
    const r = await pool
      .request()
      .input('id', sql.UniqueIdentifier, customerId)
      .query(`SELECT Id, Name, Phone, Email, Address, PhotoUrl, CreatedAt FROM dbo.Customers WHERE Id = @id`)
    const row = r.recordset[0]
    if (!row) return res.status(404).json({ error: 'Cliente no encontrado' })
    res.json({
      customer: {
        id: String(row.Id),
        name: String(row.Name || ''),
        phone: String(row.Phone || ''),
        email: row.Email ? String(row.Email) : undefined,
        address: row.Address ? String(row.Address) : undefined,
        photoUrl: row.PhotoUrl ? String(row.PhotoUrl) : undefined,
        createdAt: row.CreatedAt ? new Date(row.CreatedAt).toISOString() : new Date().toISOString(),
      },
    })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})
