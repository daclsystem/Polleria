# Base de datos SQL Server — Polleria

## Cómo crear la BD

1. Instala o usa tu instancia de **SQL Server** (local, VPS o Azure SQL).
2. Abre **SQL Server Management Studio** o **Azure Data Studio**.
3. Ejecuta en este orden:
   - [`01_Polleria_Create.sql`](./01_Polleria_Create.sql) — crea la base `Polleria` y todas las tablas
   - [`02_Polleria_Seed.sql`](./02_Polleria_Seed.sql) — datos iniciales (rangos delivery, usuarios, mesas, settings)

## Tablas clave para lo pedido

| Tabla | Para qué |
|-------|----------|
| `DeliveryRanges` | Rangos km → fee (administrable) |
| `Settings` | Origen lat/lng + URL API de ruta |
| `Orders` | Pedidos + COD (yape/plin/efectivo + monto) + distancia |
| `OrderPayments` | Pagos múltiples (tarjeta, efectivo, yape, plin) |
| `OrderItems` / `OrderItemOptions` | Comanda |

El API en `/api` se conecta a esta BD y emite eventos realtime (Socket.IO).
