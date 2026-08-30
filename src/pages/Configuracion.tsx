import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, Printer, Usb, Wifi, Monitor, TestTube2, Moon, Sun, Smartphone } from 'lucide-react'
import { useStore } from '../store/StoreContext'
import { useAuth } from '../auth/AuthContext'
import type { PrinterConfig, PrinterDriver, PrinterSetup, Settings } from '../types'
import { DEFAULT_PRINTER } from '../types'
import { isWebUsbSupported, requestUsbPrinter } from '../lib/printer-driver'
import { EscPosBuilder } from '../lib/escpos'
import { sendToPrinter } from '../lib/printer-driver'
import { Field, PageTitle, inputClass } from '../components/ui'
import { useTheme } from '../components/ThemeProvider'
import { apiSystemPurge, apiSystemStatus, type SystemPurgeTarget } from '../lib/apiClient'

function defaultSetup(): PrinterSetup {
  return {
    caja: { ...DEFAULT_PRINTER, id: 'caja', label: 'Impresora Caja', openDrawer: true },
    cocina: { ...DEFAULT_PRINTER, id: 'cocina', label: 'Impresora Cocina', beepOnPrint: true },
  }
}

function PrinterCard({
  config,
  onChange,
}: {
  config: PrinterConfig
  onChange: (c: PrinterConfig) => void
}) {
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

  const set = <K extends keyof PrinterConfig>(k: K, v: PrinterConfig[K]) =>
    onChange({ ...config, [k]: v })

  const handlePairUsb = async () => {
    const info = await requestUsbPrinter()
    if (info) {
      onChange({
        ...config,
        driver: 'usb',
        usbVendorId: info.vendorId,
        usbProductId: info.productId,
        usbDeviceName: info.name,
      })
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const p = new EscPosBuilder(config.cols)
      p.center().bold().double()
      p.line('TEST DE IMPRESION')
      p.double(false).bold(false)
      p.line(config.label)
      p.separator()
      p.left()
      p.line('Si ves este ticket, la')
      p.line('impresora esta configurada')
      p.line('correctamente.')
      p.feed(1)
      p.center().line('Chifa-Polleria Lopez')
      p.feed(2)
      if (config.autoCut) p.cut()
      if (config.openDrawer) p.openDrawer()
      if (config.beepOnPrint) p.beep()

      const result = await sendToPrinter(p.build(), config)
      setTestResult(result.ok ? 'Impreso correctamente' : `Error: ${result.error}`)
    } catch (e: any) {
      setTestResult(`Error: ${e?.message ?? 'Desconocido'}`)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="rounded-2xl border border-ink/10 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Printer size={18} className="text-ember" />
          <h3 className="font-semibold">{config.label}</h3>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => set('enabled', e.target.checked)}
            className="h-4 w-4 rounded"
          />
          Activa
        </label>
      </div>

      {config.enabled && (
        <>
          <div className="grid grid-cols-3 gap-2">
            {(['browser', 'usb', 'network'] as PrinterDriver[]).map((d) => {
              const Icon = d === 'usb' ? Usb : d === 'network' ? Wifi : Monitor
              const label = d === 'browser' ? 'Navegador' : d === 'usb' ? 'USB' : 'Red'
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => set('driver', d)}
                  className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium ${
                    config.driver === d ? 'bg-ink text-cream' : 'bg-cream'
                  }`}
                >
                  <Icon size={14} />
                  {label}
                </button>
              )
            })}
          </div>

          {config.driver === 'usb' && (
            <div className="space-y-2">
              {isWebUsbSupported() ? (
                <button
                  type="button"
                  onClick={handlePairUsb}
                  className="flex items-center gap-2 rounded-xl bg-cream px-3 py-2 text-sm font-medium"
                >
                  <Usb size={14} />
                  {config.usbDeviceName
                    ? `Conectada: ${config.usbDeviceName}`
                    : 'Vincular impresora USB'}
                </button>
              ) : (
                <p className="rounded-xl bg-amber-50 p-2 text-xs text-amber-700">
                  WebUSB no disponible. Usa Chrome/Edge en escritorio.
                </p>
              )}
            </div>
          )}

          {config.driver === 'network' && (
            <Field label="URL del print bridge (ej: http://192.168.1.100:9100)">
              <input
                className={inputClass}
                value={config.networkUrl ?? ''}
                onChange={(e) => set('networkUrl', e.target.value)}
                placeholder="http://localhost:9100"
              />
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Columnas">
              <select
                className={inputClass}
                value={config.cols}
                onChange={(e) => set('cols', Number(e.target.value))}
              >
                <option value={32}>32 (58mm)</option>
                <option value={42}>42 (72mm)</option>
                <option value={48}>48 (80mm)</option>
              </select>
            </Field>
            <div className="space-y-1.5 pt-5">
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={config.autoCut}
                  onChange={(e) => set('autoCut', e.target.checked)}
                  className="h-3.5 w-3.5 rounded"
                />
                Corte automático
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={config.openDrawer}
                  onChange={(e) => set('openDrawer', e.target.checked)}
                  className="h-3.5 w-3.5 rounded"
                />
                Abrir cajón
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={config.beepOnPrint}
                  onChange={(e) => set('beepOnPrint', e.target.checked)}
                  className="h-3.5 w-3.5 rounded"
                />
                Beep al imprimir
              </label>
            </div>
          </div>

          {config.driver !== 'browser' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTest}
                disabled={testing}
                className="flex items-center gap-1.5 rounded-xl bg-ember/10 px-3 py-2 text-sm font-medium text-ember disabled:opacity-50"
              >
                <TestTube2 size={14} />
                {testing ? 'Imprimiendo...' : 'Imprimir prueba'}
              </button>
              {testResult && (
                <span className={`text-xs ${testResult.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
                  {testResult}
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function Configuracion() {
  const { state, saveSettings, resetDemo, reloadFromApi } = useStore()
  const { user: me } = useAuth()
  const { preference, setPreference } = useTheme()
  const [form, setForm] = useState<Settings>(state.settings)
  const [printerSaved, setPrinterSaved] = useState(false)
  const [detectingLoc, setDetectingLoc] = useState(false)

  const printers = form.printers ?? defaultSetup()

  const set = (k: keyof Settings, v: string | number | undefined) => setForm({ ...form, [k]: v })

  const detectLocation = () => {
    if (!navigator.geolocation) {
      alert('Tu navegador no soporta geolocalización')
      return
    }
    setDetectingLoc(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm({ ...form, originLat: pos.coords.latitude, originLng: pos.coords.longitude })
        setDetectingLoc(false)
      },
      (err) => {
        alert(`Error al obtener ubicación: ${err.message}`)
        setDetectingLoc(false)
      },
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  const setPrinter = (which: keyof PrinterSetup, config: PrinterConfig) => {
    setForm({ ...form, printers: { ...printers, [which]: config } })
  }

  const savePrinters = () => {
    saveSettings({ ...form, printers })
    setPrinterSaved(true)
    setTimeout(() => setPrinterSaved(false), 2000)
  }

  return (
    <div className="max-w-xl">
      <PageTitle title="Configuración" hint="Datos del local, impresoras, IGV y delivery." />

      <div className="card mt-6 flex items-center justify-between gap-4 p-5">
        <div>
          <h2 className="font-display text-lg">Apariencia</h2>
          <p className="text-sm text-ink/45">Por defecto usa el tema del celular o PC.</p>
        </div>
        <div className="flex flex-wrap justify-end rounded-full bg-ink/6 p-1">
          <button
            type="button"
            onClick={() => setPreference('system')}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
              preference === 'system' ? 'bg-surface text-ink shadow-sm' : 'text-ink/45'
            }`}
          >
            <Smartphone size={14} /> Auto
          </button>
          <button
            type="button"
            onClick={() => setPreference('light')}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
              preference === 'light' ? 'bg-surface text-ink shadow-sm' : 'text-ink/45'
            }`}
          >
            <Sun size={14} /> Claro
          </button>
          <button
            type="button"
            onClick={() => setPreference('dark')}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
              preference === 'dark' ? 'bg-surface text-ink shadow-sm' : 'text-ink/45'
            }`}
          >
            <Moon size={14} /> Oscuro
          </button>
        </div>
      </div>

      {/* Datos del local */}
      <form
        className="card mt-6 space-y-3 p-5"
        onSubmit={(e) => {
          e.preventDefault()
          saveSettings(form)
        }}
      >
        <h2 className="font-display text-lg">Datos del local</h2>
        <Field label="Nombre del local">
          <input className={inputClass} value={form.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Eslogan">
          <input className={inputClass} value={form.slogan} onChange={(e) => set('slogan', e.target.value)} />
        </Field>
        <Field label="Dirección">
          <input className={inputClass} value={form.address} onChange={(e) => set('address', e.target.value)} />
        </Field>
        <Field label="Teléfono">
          <input className={inputClass} value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="RUC">
          <input className={inputClass} value={form.ruc} onChange={(e) => set('ruc', e.target.value)} />
        </Field>
        <Field label="Horario">
          <input className={inputClass} value={form.hours} onChange={(e) => set('hours', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="IGV (0.18 = 18%)">
            <input
              type="number"
              step="0.01"
              className={inputClass}
              value={form.igvRate}
              onChange={(e) => set('igvRate', Number(e.target.value))}
            />
          </Field>
          <Field label="Delivery fallback (S/)">
            <input
              type="number"
              className={inputClass}
              value={form.deliveryFee}
              onChange={(e) => set('deliveryFee', Number(e.target.value))}
            />
          </Field>
        </div>
        <p className="text-xs text-ink/45">
          Las tarifas por km se editan en{' '}
          <Link to="/sucursales" className="font-bold text-ember underline">
            Sucursales
          </Link>
          : 0–4 km = S/ 3, 4–6 = S/ 6, y así, por cada sede.
        </p>

        <div className="rounded-xl border border-ink/10 bg-cream/50 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <MapPin size={16} className="text-ember" />
            <span className="font-semibold text-sm">Ubicación del local (origen delivery)</span>
          </div>
          <p className="text-xs text-ink/50">
            Sede principal: Chocos Imperial (−13.064353, −76.348946). Si tienes más locales, configura cada uno en Sucursales.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Latitud">
              <input
                type="number"
                step="0.0000001"
                className={inputClass}
                value={form.originLat ?? ''}
                onChange={(e) => set('originLat', e.target.value ? Number(e.target.value) : undefined)}
                placeholder="-13.064353"
              />
            </Field>
            <Field label="Longitud">
              <input
                type="number"
                step="0.0000001"
                className={inputClass}
                value={form.originLng ?? ''}
                onChange={(e) => set('originLng', e.target.value ? Number(e.target.value) : undefined)}
                placeholder="-76.348946"
              />
            </Field>
          </div>
          <button
            type="button"
            onClick={detectLocation}
            disabled={detectingLoc}
            className="w-full rounded-lg bg-ink py-2 text-sm font-semibold text-cream disabled:opacity-50"
          >
            {detectingLoc ? 'Detectando…' : 'Detectar mi ubicación actual'}
          </button>
          {form.originLat && form.originLng ? (
            <a
              href={`https://www.google.com/maps?q=${form.originLat},${form.originLng}`}
              target="_blank"
              rel="noreferrer"
              className="block text-center text-xs text-ember hover:underline"
            >
              Ver en Google Maps
            </a>
          ) : null}
        </div>

        <button className="w-full rounded-xl bg-ember py-3 font-semibold text-white">Guardar local</button>
      </form>

      {/* Impresoras */}
      <div className="card mt-6 space-y-4 p-5">
        <div className="flex items-center gap-2">
          <Printer size={20} className="text-ember" />
          <h2 className="font-display text-lg">Impresoras térmicas</h2>
        </div>
        <p className="text-xs text-ink/50">
          Configura tus ticketeras ESC/POS. Si usas USB, conecta la impresora y haz clic en "Vincular".
          Modo "Navegador" usa el diálogo de impresión del sistema.
        </p>

        <PrinterCard config={printers.caja} onChange={(c) => setPrinter('caja', c)} />
        <PrinterCard config={printers.cocina} onChange={(c) => setPrinter('cocina', c)} />

        <button
          type="button"
          onClick={savePrinters}
          className="w-full rounded-xl bg-ink py-3 font-semibold text-cream"
        >
          {printerSaved ? 'Guardado' : 'Guardar impresoras'}
        </button>
      </div>

      {me?.isSystem ? (
        <SystemPurgePanel
          onDone={() => {
            void reloadFromApi()
          }}
        />
      ) : null}

      {me?.isSystem ? (
        <button
          className="mt-4 text-sm text-ink/40 underline"
          onClick={() => {
            if (confirm('Esto recarga los datos desde el API/SQL.')) resetDemo()
          }}
        >
          Recargar datos desde el API
        </button>
      ) : null}
    </div>
  )
}

function SystemPurgePanel({ onDone }: { onDone: () => void }) {
  const [counts, setCounts] = useState<{ orders: number; customers: number; products: number; staff: number } | null>(
    null,
  )
  const [targets, setTargets] = useState<Record<SystemPurgeTarget, boolean>>({
    orders: true,
    users: true,
    customers: true,
    products: true,
  })
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = () => {
    void apiSystemStatus()
      .then((r) => setCounts(r.counts))
      .catch(() => setCounts(null))
  }

  useEffect(() => {
    load()
  }, [])

  const selected = (Object.keys(targets) as SystemPurgeTarget[]).filter((k) => targets[k])
  const needsOrders = targets.users || targets.customers || targets.products
  const canRun = selected.length > 0 && confirmText.trim().toUpperCase() === 'PUESTA EN MARCHA' && !busy

  const run = async () => {
    if (!canRun) return
    if (
      !confirm(
        'Vas a dejar el sistema listo para el primer día real. Se borran las pruebas marcadas. El usuario de sistema no se elimina. ¿Poner en marcha?',
      )
    ) {
      return
    }
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      const r = await apiSystemPurge(selected)
      setMsg(r.message)
      setConfirmText('')
      load()
      onDone()
    } catch (e) {
      setErr((e as Error).message || 'No se pudo poner en marcha')
    } finally {
      setBusy(false)
    }
  }

  const row = (key: SystemPurgeTarget, label: string, hint: string, count?: number) => (
    <label className="flex items-start gap-3 rounded-2xl bg-ink/[0.03] px-3 py-3">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4"
        checked={targets[key]}
        onChange={(e) => setTargets((t) => ({ ...t, [key]: e.target.checked }))}
      />
      <span>
        <span className="block text-sm font-bold">
          {label}
          {count != null ? <span className="ml-2 font-semibold text-ink/40">({count})</span> : null}
        </span>
        <span className="text-xs text-ink/45">{hint}</span>
      </span>
    </label>
  )

  return (
    <div className="card mt-8 space-y-3 border border-ember/20 p-5">
      <p className="text-[11px] font-bold tracking-[0.16em] text-ember uppercase">Solo sistema</p>
      <h2 className="font-display text-lg">Puesta en marcha</h2>
      <p className="text-sm text-ink/55">
        Deja el local listo para el primer día real: quita pedidos, usuarios, clientes y carta de prueba.
        Luego cargas el equipo y la carta de verdad. Tu cuenta de sistema no se borra.
        {needsOrders
          ? ' Si quitas usuarios, clientes o productos, los pedidos de prueba también se van.'
          : ''}
      </p>
      <div className="space-y-2">
        {row('orders', 'Pedidos de prueba', 'Comandas, pagos, reservas. Mesas quedan libres.', counts?.orders)}
        {row('users', 'Usuarios de prueba', 'Cajeros, mozos, cocina y admins. Tú (sistema) te quedas.', counts?.staff)}
        {row('customers', 'Clientes de prueba', 'Cuentas de la app / web y direcciones.', counts?.customers)}
        {row('products', 'Carta de prueba', 'Platos, extras, recetas y reseñas.', counts?.products)}
      </div>
      <Field label='Escribe PUESTA EN MARCHA para confirmar'>
        <input
          className={inputClass}
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="PUESTA EN MARCHA"
          autoComplete="off"
        />
      </Field>
      {err ? <p className="text-sm font-semibold text-brick">{err}</p> : null}
      {msg ? <p className="text-sm font-semibold text-sage">{msg}</p> : null}
      <button
        type="button"
        disabled={!canRun}
        onClick={() => void run()}
        className="w-full rounded-xl bg-ember py-3 text-sm font-bold text-white disabled:opacity-40"
      >
        {busy ? 'Preparando…' : 'Poner el sistema en marcha'}
      </button>
    </div>
  )
}
