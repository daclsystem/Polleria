# Chifa-Pollería Lopez — POS + Delivery

Sistema tipo **PedidosYa**: pedidos en local/web, cocina, cobro, clientes, conductores y tracking por WhatsApp.

## URLs

| Qué | URL |
|-----|-----|
| Front local | http://127.0.0.1:5174/polleria/ |
| Front producción | https://apipchifapollerialopez.indevsoft.com/polleria/ |
| Login personal | `/polleria/login` |
| App conductor | `/polleria/conductor` |
| Carta / cliente | `/polleria/web` · `/polleria/pedir` |
| Seguimiento | `/polleria/web/seguimiento/:id?tel=...` |
| API | https://apipchifapollerialopez.indevsoft.com |
| Health API | https://apipchifapollerialopez.indevsoft.com/health |

Front: crear `.env.local` con:

```
VITE_API_URL=https://apipchifapollerialopez.indevsoft.com
```

## Sesiones independientes (1 por cuenta)

Admin, cajero, cocina, mozo, cliente y conductor tienen **sesión propia**.

Si la misma cuenta inicia en **otra PC / celular**, la sesión anterior se **cierra sola** (`SESSION_REPLACED`).

Tokens separados en el navegador: staff / driver / customer (no se pisan entre sí).

Login principal: **celular + código**.

| Dato | Valor |
|------|--------|
| Celular por defecto | `937493214` |
| Código de respaldo (si WhatsApp cae) | `123456` |

1. Abres `/login` (o conductor / cliente) → el número ya viene cargado.  
2. Continuar → intenta WhatsApp.  
3. Si WhatsApp falla: usa **`123456`** (viene precargado) y entras igual.

Env API opcional: `OTP_FALLBACK_CODE=123456`

### Personal del local — login en `/login`

Cada rol tiene su celular registrado. Demo:

| Rol | Celular | Correo (referencia) |
|-----|---------|---------------------|
| **Admin** | `937493214` | admin@lopez.pe |
| **Cajero** (pago) | `911111111` | cajero@lopez.pe |
| **Cocina** | `922222222` | cocina@lopez.pe |
| **Mozo** | `933333333` | mozo@lopez.pe |
| **Mozo 2** | `944444444` | mozo2@lopez.pe |

> Con el número default `937493214` + código `123456` entras como **Administrador**.

### Cliente — `/web/cuenta` o al tomar pedido

| Nombre | Teléfono | Notas |
|--------|----------|-------|
| María López | `937493214` | Cliente demo en sección **Clientes**. Foto por defecto. |

### Conductor (delivery) — `/conductor`

| Nombre | Teléfono | Vehículo |
|--------|----------|----------|
| Carlos Repartidor | `962797752` | Moto · ABC-123 |

Login conductor: celular + código WhatsApp (debe estar registrado en **Conductores**).

> **Nota WhatsApp:** el OTP real llega al celular configurado en la sesión `PolleriaLopez` (iwspgo). Para probar OTP en vivo, usa un número que tenga WhatsApp y esté bien cargado en ese usuario. Para probar **cada rol del local** sin pelear el mismo WhatsApp, usa **correo + contraseña**.

## Notificaciones en tiempo real

El API emite eventos **Socket.IO** (`path: /realtime`). Al iniciar sesión el front se conecta y:

| Evento | Qué pasa |
|--------|----------|
| `order:created` / `kitchen:new` | Toast + sonido nuevo pedido + refresco inmediato |
| `order:status` | Toast (listo / entregado / cancelado) + sonido si es listo |
| `order:paid` | Toast “cobrado” |
| `order:driver` | Toast “asignado a conductor” + app conductor refresca |

Badge **En vivo** (punto verde) = websocket conectado.  
Cliente: WhatsApp (recibido / listo / entregado).  
Respaldo: sync cada ~25 s si cae el socket.  
Audio: el navegador pide un clic primero (cualquier toque en la app desbloquea sonidos).

## Flujo tipo PedidosYa

1. Cliente / POS crea pedido **delivery** (nombre + teléfono + dirección).
2. Cocina prepara → marca **listo**.
3. En **Ver pedidos** se asigna conductor, o el conductor **toma** el pedido en `/conductor`.
4. Conductor abre **ruta en Google Maps** y marca **Entregado**.
5. Cliente recibe tracking por WhatsApp (`/web/seguimiento/:id`).

## Módulos del menú

| Grupo | Módulos |
|-------|---------|
| Trabajar | Inicio, Tomar pedido, Ver pedidos, Cocina, Mesas, Reservas, Pedidos online |
| Administrar | Carta, Inventario, Equipo, **Clientes**, **Conductores**, Reportes, Sucursales, Facturación, WhatsApp, Página Web, Ajustes |

## Arranque local

```bash
# Front
npm install
npm run dev

# API (carpeta api/)
cd api && npm install && npm run build && npm start
```

## Base de datos

Scripts en `database/` (ver `database/README.md`). Seed de pruebas:

- `09_Seed_Cliente_Conductor.sql` — 1 cliente + 1 conductor demo
- Usuarios staff: `02_Polleria_Seed.sql`

## Servidor

Detalle de VPS, SQL, WhatsApp y MinIO: [`docs/SERVER.md`](./docs/SERVER.md).
