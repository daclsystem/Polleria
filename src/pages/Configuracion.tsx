import { useState } from 'react'
import { Printer, Usb, Wifi, Monitor, TestTube2 } from 'lucide-react'
import { useStore } from '../store/StoreContext'
import type { PrinterConfig, PrinterDriver, PrinterSetup, Settings } from '../types'
import { DEFAULT_PRINTER } from '../types'
import { isWebUsbSupported, requestUsbPrinter } from '../lib/printer-driver'
import { EscPosBuilder } from '../lib/escpos'
import { sendToPrinter } from '../lib/printer-driver'
import { Field, PageTitle, inputClass } from '../components/ui'

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
  const { state, saveSettings, resetDemo } = useStore()
  const [form, setForm] = useState<Settings>(state.settings)
  const [printerSaved, setPrinterSaved] = useState(false)

  const printers = form.printers ?? defaultSetup()

  const set = (k: keyof Settings, v: string | number) => setForm({ ...form, [k]: v })

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
          <Field label="Delivery (S/)">
            <input
              type="number"
              className={inputClass}
              value={form.deliveryFee}
              onChange={(e) => set('deliveryFee', Number(e.target.value))}
            />
          </Field>
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

      <button
        className="mt-6 text-sm text-brick underline"
        onClick={() => {
          if (confirm('Esto recarga los datos desde el API/SQL.')) resetDemo()
        }}
      >
        Restaurar datos de demostración
      </button>
    </div>
  )
}
