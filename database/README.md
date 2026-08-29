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

## Seed de cuentas demo

Tras crear la BD, los usuarios de prueba quedan así (también documentados en el README raíz):

| Rol | Id (seed front) | Email | Password | PIN | Phone |
|-----|------------------|-------|----------|-----|-------|
| admin | u1 | admin@lopez.pe | admin123 | 1234 | 9999999 |
| cajero (pago) | u2 | cajero@lopez.pe | cajero123 | 2222 | 88888 |
| cocina | u3 | cocina@lopez.pe | cocina123 | 3333 | 77777 |
| mozo | u4 | mozo@lopez.pe | mozo123 | 4444 | 66666 |
| mozo 2 | u5 | mozo2@lopez.pe | mozo123 | 4444 | 55555 |
| cliente | — | María López | (OTP / pedido) | — | 51937493214 |
| conductor | — | Carlos Repartidor | (OTP app) | — | 11111 |

Scripts útiles: `09_Seed_Cliente_Conductor.sql`.
