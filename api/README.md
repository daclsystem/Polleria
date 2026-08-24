# API Polleria — SQL Server + Realtime

Backend para Chifa-Pollería Lopez. Guarda en **SQL Server** y emite eventos en vivo con **Socket.IO** (`/realtime`).

## Dónde crear la base de datos

| Opción | Cuándo usarla |
|--------|----------------|
| **SQL Server local / SSMS** | Desarrollo en tu PC |
| **VPS Windows + SQL Server** | Producción propia |
| **Azure SQL** | Cloud administrado |
| **Hosting con SQL Server** | Si tu proveedor (ej. VPS/indevsoft) te da instancia SQL |

### Pasos (SSMS o Azure Data Studio)

1. Conéctate a la instancia SQL Server.
2. Abre y ejecuta en orden:
   - `../database/01_Polleria_Create.sql` → crea BD `Polleria` + tablas
   - `../database/02_Polleria_Seed.sql` → settings, rangos delivery, usuarios, mesas
3. Verifica:

```sql
USE Polleria;
SELECT name FROM sys.tables ORDER BY name;
SELECT * FROM dbo.DeliveryRanges;
```

4. Anota: servidor, puerto (`1433`), usuario, password, BD `Polleria`.

---

## Dónde vive / publica el API

Carpeta del proyecto:

```
Polleria/
  database/          ← scripts SQL
  api/               ← ESTE backend (publicar aquí)
  src/               ← frontend React (ya existe)
```

URL sugerida de producción (ejemplo):

- Frontend: `https://indevsoft.com/polleria`
- API: `https://api.indevsoft.com` o `https://indevsoft.com:3080` o `https://indevsoft.com/polleria-api`

Realtime (Socket.IO): mismo host del API, path `/realtime`.

### Publicar en un VPS (Node)

```bash
cd api
cp .env.example .env
# edita DB_* JWT_SECRET CORS_ORIGIN

npm install
npm run build
npm start
# o con PM2:
# pm2 start dist/index.js --name polleria-api
```

Abre el puerto `3080` (o el de `PORT`) en el firewall / reverse proxy (Nginx / IIS ARR).

### Variables `.env`

Copia `.env.example` → `.env` y completa conexión SQL Server.

---

## Endpoints principales

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Salud + DB |
| POST | `/api/auth/login` | Login staff |
| POST | `/api/delivery/quote` | Distancia ruta + fee por rango |
| GET | `/api/delivery/ranges` | Listar rangos |
| PUT | `/api/delivery/ranges` | Admin: guardar rangos |
| POST | `/api/orders` | Crear pedido (POS/web) → emite `order:created` / `kitchen:new` |
| PATCH | `/api/orders/:id/status` | Cocina cambia estado → realtime |
| POST | `/api/orders/:id/payments` | Pago simple o múltiple |
| GET | `/api/orders/kitchen` | Comandas activas |

### Delivery quote (API geo)

Usa la ruta tipo:

`https://geo.taximonterrico.com/api/v3/route/{fromLat},{fromLng}/{toLat},{toLng}/-1/{token}`

Respuesta: `distance` (km), `time` (min). El fee sale de `DeliveryRanges` en SQL.

### Realtime (Socket.IO)

```js
import { io } from 'socket.io-client'
const socket = io('https://TU-API', { path: '/realtime' })
socket.emit('join', 'cocina')
socket.on('kitchen:new', (order) => { /* sonido + UI */ })
socket.on('order:status', (order) => { /* actualizar */ })
socket.on('order:paid', (order) => { /* caja/mesas */ })
```

Salas útiles: `cocina`, `caja`, `ops`, `mesas`.

---

## Flujo realtime que cubre

1. Mozo/cliente crea pedido → SQL + evento `kitchen:new` (cocina suena).
2. Cocinero cambia estado → `order:status` a todos.
3. Caja cobra (Yape/Plin/efectivo/tarjeta o mixto) → `order:paid`.
4. Delivery: `POST /api/delivery/quote` antes de confirmar pedido web.

WhatsApp al crear pedido: el create responde `whatsappPending: true`; el siguiente paso es cablear el módulo WhatsApp del front/API para enviar plantilla al local y al cliente.

---

## Desarrollo local

```bash
# 1) BD creada con los .sql
# 2) api/.env configurado
cd api
npm install
npm run dev
# http://localhost:3080/health
```

Usuarios seed: `admin@lopez.pe` / `admin123` (y roles del README del front). Al primer login el API migra el password a bcrypt.
