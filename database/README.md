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

| Rol | Email | Password | PIN | Phone |
|-----|-------|----------|-----|-------|
| admin | admin@lopez.pe | admin123 | 1234 | 51937493214 |
| cajero (pago) | cajero@lopez.pe | cajero123 | 2222 | 51911111111 |
| cocina | cocina@lopez.pe | cocina123 | 3333 | 51922222222 |
| mozo | mozo@lopez.pe | mozo123 | 4444 | 51933333333 |
| mozo 2 | mozo2@lopez.pe | mozo123 | 4444 | 51944444444 |
| cliente | María López | (OTP / pedido) | — | 51937493214 |
| conductor | Carlos Repartidor | (OTP app) | — | 51962797752 |

Scripts útiles: `09_Seed_Cliente_Conductor.sql`.
