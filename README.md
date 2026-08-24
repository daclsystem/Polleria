# Chifa-Pollería Lopez — POS + Delivery

Sistema tipo **PedidosYa**: pedidos en local/web, cocina, cobro, clientes, conductores y tracking por WhatsApp.

## URLs

| Qué | URL |
|-----|-----|
| Front local | http://127.0.0.1:5174/polleria/ |
| Login personal | `/polleria/login` |
| App conductor | `/polleria/conductor` |
| Carta / cliente | `/polleria/web` · `/polleria/pedir` |
| API | https://apipchifapollerialopez.indevsoft.com |
| Health API | https://apipchifapollerialopez.indevsoft.com/health |

Front: crear `.env.local` con:

```
VITE_API_URL=https://apipchifapollerialopez.indevsoft.com
```

## Cuentas de prueba (una por rol)

Usuarios **demo** para probar. Luego se pueden borrar y dejar solo el administrador.

### Personal del local — login en `/login`

Puedes entrar con **correo + contraseña** (recomendado para pruebas) o con **WhatsApp (OTP)**.

| Rol | Para qué | Correo | Contraseña | PIN | Celular |
|-----|----------|--------|------------|-----|---------|
| **Admin** | Todo el sistema | `admin@lopez.pe` | `admin123` | `1234` | `937493214` |
| **Cajero** (pago) | Cobrar, POS, facturación | `cajero@lopez.pe` | `cajero123` | `2222` | `911111111` |
| **Cocina** | Preparar pedidos | `cocina@lopez.pe` | `cocina123` | `3333` | `922222222` |
| **Mozo** | Mesas, tomar pedido | `mozo@lopez.pe` | `mozo123` | `4444` | `933333333` |

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
