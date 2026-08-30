# Servidor Polleria — acceso y API

## VPS (Hetzner)

| Dato | Valor |
|------|--------|
| Proveedor | Hetzner Cloud · CX23 |
| SO | Ubuntu |
| IP IPv4 | `116.203.70.104` |
| Usuario | `root` |
| Clave | `PolleriaLopez2026Api` |
| Specs | 2 vCPU · 4 GB RAM · 40 GB SSD |
| Ubicación | Nuremberg |

### Conexión SSH

```bash
ssh root@116.203.70.104
```

## Front (dominio del negocio)

| Dato | Valor |
|------|--------|
| Dominio | `chifapollerialopez.com` (+ `www`) |
| Qué sirve | Web pública + sistema (POS, login, cocina, etc.) |
| DNS | Registros **A** `@` y `www` → `116.203.70.104` |
| Root nginx | `/opt/polleria/web` |
| Conf | `deploy/nginx-chifapollerialopez.conf` |

La API **no** va en este dominio; solo el front.

## API (subdominio IndevSoft) — YA EN PRODUCCIÓN

| Dato | Valor |
|------|--------|
| Dominio | `apipchifapollerialopez.indevsoft.com` |
| DNS | Registro **A** → `116.203.70.104` |
| URL API | `https://apipchifapollerialopez.indevsoft.com` |
| Health | `https://apipchifapollerialopez.indevsoft.com/health` |
| Realtime | path `/realtime` (Socket.IO) |
| HTTPS | Let's Encrypt activo |
| CORS / FRONT | Debe incluir `https://chifapollerialopez.com` |

### SQL Server (Docker en el mismo VPS)

| Dato | Valor |
|------|--------|
| Contenedor | `polleria-sql` |
| Puerto | `1433` |
| BD | `Polleria` |
| Usuario | `sa` |
| Password | `PolleriaSql2026Strong` |

App en el server: `/opt/polleria/api` (PM2: `polleria-api`)

Front local: crea `.env.local` con:

```
VITE_API_URL=https://apipchifapollerialopez.indevsoft.com
```

---

## WhatsApp Gateway (iwspgo)

| Dato | Valor |
|------|--------|
| URL | `https://iwspgo.indevsoft.com` |
| Dashboard | `https://iwspgo.indevsoft.com/dashboard` |
| Usuario dashboard | `admin` |
| Password dashboard | `cfecb561019f291d8a64c771` |
| Header | `X-Api-Key` |
| API Key | `753ce43470bc2ad5b72bce84a7080d7ec92f77a6690bff51e5e03a5cd14eb6e0` |
| Sesión | `PolleriaLopez` (**WORKING** — número `51967304444`) |
| Endpoint envío | `POST /api/sendText` |

**Importante:** el password del dashboard/swagger (`cfecb561019f291d8a64c771`) **no** es el `X-Api-Key`. Para la API usa la API Key de la tabla de arriba.

Body ejemplo:

```json
{
  "session": "PolleriaLopez",
  "chatId": "51999999999@c.us",
  "text": "Hola"
}
```

### Conectar el dashboard (importante)

En la pantalla ves **Workers: not connected** y **No sessions found**. Eso es solo la UI: la sesión `PolleriaLopez` **sí existe** en la API.

1. En **Workers**, pulsa el botón verde **Connect**
2. Completa:
   - **Name:** `WAHA` (o deja el que salga)
   - **API:** `https://iwspgo.indevsoft.com`
   - **API Key / X-Api-Key:** `753ce43470bc2ad5b72bce84a7080d7ec92f77a6690bff51e5e03a5cd14eb6e0`
3. Guarda / Connect
4. En **Sessions** debería aparecer **`PolleriaLopez`** (estado `SCAN_QR_CODE`)
5. Ábrela y **escanea el QR** con el WhatsApp del local
6. Cuando diga **WORKING**, ya salen los mensajes del sistema

QR de respaldo (si lo necesitas): `docs/qr-pollerialopez.png`

### Audios cocina

- `public/sounds/nuevopedido.mp3` — pedido nuevo (local)
- `public/sounds/ordenlista.mp3` — pedido listo (local)
- También se pueden subir a MinIO en carpeta `audio/`

---

## MinIO (multimedia) — sesión independiente

| Dato | Valor |
|------|--------|
| Instancia | `igestor.indevsoft.com:9000` |
| **Bucket** | `pollerialopez` (NO `chaskidriver`) |
| Access / Secret | `minioadmin` / `minioadmin123!` |
| Upload API | `POST https://apipchifapollerialopez.indevsoft.com/api/media/upload-public` |
| Lectura pública | `https://apipchifapollerialopez.indevsoft.com/s3/pollerialopez/{carpeta}/{archivo}` |

Carpetas: `products/`, `audio/`, `media/`, `branding/`, `docs/`

Front: `src/lib/minio.ts` → sube por la API Polleria.  
SQL: `Products.ImageUrl` (script `database/03_Products_ImageUrl.sql`).

---

## Logins independientes + recuperación WhatsApp

| Cuenta | Entrada | Sesión localStorage | Recuperación |
|--------|---------|---------------------|--------------|
| **Staff** | `/login` | `polleria-staff-session` | Código OTP por WSP (correo + celular) |
| **Cliente** | `/web/cuenta` | `polleria-customer-session` | Código OTP por WSP (celular) |

API:

- `POST /api/auth/recover/request` `{ accountType: "staff"|"customer", email?, phone? }`
- `POST /api/auth/recover/confirm` `{ accountType, email?, phone?, code, newPassword }`

Requiere sesión WhatsApp `PolleriaLopez` en estado **WORKING**.
