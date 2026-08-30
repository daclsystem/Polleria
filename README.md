# Chifa-Pollería Lopez — POS + Delivery

## Dominios

| Qué | URL |
|-----|-----|
| **Web pública** | https://chifapollerialopez.com/ |
| **Sistema (POS)** | https://chifapollerialopez.com/system/ |
| **Repartidor** | https://chifapollerialopez.com/driver/ |
| **Cliente (login/pedido)** | https://chifapollerialopez.com/cliente/ |
| **API** | https://apipchifapollerialopez.indevsoft.com |

`.env.production`:

```
VITE_API_URL=https://apipchifapollerialopez.indevsoft.com
```

## Compilar fronts (4 carpetas)

```bash
npm run build:all
```

O por app:

```bash
npm run build:web      # → dist/web/
npm run build:system   # → dist/system/
npm run build:driver   # → dist/driver/
npm run build:cliente  # → dist/cliente/
```

### Subir al hosting

| Carpeta local | Subir a |
|---------------|---------|
| `dist/web/*` | `chifapollerialopez.com/` (raíz) |
| `dist/system/*` | `chifapollerialopez.com/system/` |
| `dist/driver/*` | `chifapollerialopez.com/driver/` |
| `dist/cliente/*` | `chifapollerialopez.com/cliente/` |

Cada `dist/*/ ` ya incluye `.htaccess` (SPA Apache).

## Dev local

```bash
npm run dev:web       # :5174
npm run dev:system    # :5175
npm run dev:driver    # :5176
npm run dev:cliente   # :5177
```

## Login

Celular + código WhatsApp (respaldo `123456` si WhatsApp falla).
