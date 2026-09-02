import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Lee versión desde src/lib/version.ts sin import ESM (evita node16 extension). */
function readAppVersion() {
  const raw = fs.readFileSync(path.resolve(__dirname, 'src/lib/version.ts'), 'utf8')
  const version = raw.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1] || '0.0.0'
  const build = raw.match(/APP_BUILD\s*=\s*['"]([^'"]+)['"]/)?.[1] || ''
  return { version, build }
}

type AppName = 'web' | 'system' | 'driver' | 'cliente'

const APP = (process.env.VITE_APP || 'web') as AppName

const APP_CFG: Record<AppName, { base: string; outDir: string; port: number }> = {
  web: { base: '/', outDir: 'dist/web', port: 5174 },
  system: { base: '/system/', outDir: 'dist/system', port: 5175 },
  driver: { base: '/driver/', outDir: 'dist/driver', port: 5176 },
  cliente: { base: '/cliente/', outDir: 'dist/cliente', port: 5177 },
}

const cfg = APP_CFG[APP]
const appRoot = path.resolve(__dirname, `apps/${APP}`)
const outDirAbs = path.resolve(__dirname, cfg.outDir)
const API_TARGET = (process.env.VITE_API_URL || 'https://apipchifapollerialopez.indevsoft.com').replace(
  /\/$/,
  '',
)

/** Escribe version.json en cada build para que el cliente detecte actualizaciones. */
function emitVersionJson(): Plugin {
  const payload = () => {
    const { version, build } = readAppVersion()
    return JSON.stringify(
      {
        version,
        build,
        app: APP,
        builtAt: new Date().toISOString(),
      },
      null,
      2,
    )
  }
  return {
    name: 'emit-version-json',
    writeBundle() {
      fs.mkdirSync(outDirAbs, { recursive: true })
      fs.writeFileSync(path.join(outDirAbs, 'version.json'), `${payload()}\n`, 'utf8')
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] || ''
        if (url === '/version.json' || url.endsWith('/version.json')) {
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          res.end(payload())
          return
        }
        next()
      })
    },
  }
}

export default defineConfig({
  root: appRoot,
  base: cfg.base,
  cacheDir: path.resolve(__dirname, `node_modules/.vite/${APP}`),
  publicDir: path.resolve(__dirname, 'public'),
  plugins: [react(), tailwindcss(), emitVersionJson()],
  define: {
    'import.meta.env.VITE_APP': JSON.stringify(APP),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: cfg.port,
    /** La web se queda en 5174. Si ese puerto está ocupado, falla en vez de robar el 5175 del POS. */
    strictPort: APP === 'web',
    host: true,
    fs: {
      allow: [__dirname],
    },
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true, secure: true },
      '/health': { target: API_TARGET, changeOrigin: true, secure: true },
      '/realtime': { target: API_TARGET, changeOrigin: true, ws: true, secure: true },
    },
  },
  build: {
    outDir: outDirAbs,
    emptyOutDir: true,
  },
})
