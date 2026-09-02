import { useCallback, useEffect, useState } from 'react'
import { LogOut, MessageCircle, QrCode, RefreshCw, Settings2, Zap } from 'lucide-react'
import {
  DEFAULT_WSPGO,
  fetchSessionQr,
  fetchWspgoConfig,
  getSessionStatus,
  logoutWhatsappSession,
  saveWspgoConfig,
  startWhatsappSession,
  type WspgoConfig,
} from '../lib/whatsapp'
import {
  downloadMassTemplate,
  enqueueMass,
  parseMassXlsx,
  resetMass,
  subscribeMass,
  type MassStatus,
} from '../lib/whatsappMass'
import { Field, Modal, PageTitle, inputClass } from '../components/ui'

export function WhatsApp() {
  const [config, setConfig] = useState<WspgoConfig>(DEFAULT_WSPGO)
  const [configOpen, setConfigOpen] = useState(false)
  const [sendResult, setSendResult] = useState<string | null>(null)
  const [sessionStatus, setSessionStatus] = useState<string>('…')
  const [qrSrc, setQrSrc] = useState<string | null>(null)
  const [qrBusy, setQrBusy] = useState(false)
  const [qrErr, setQrErr] = useState<string | null>(null)
  const [wantQr, setWantQr] = useState(false)
  const [mass, setMass] = useState<MassStatus>({ running: false, total: 0, sent: 0, failed: 0 })
  const [massRows, setMassRows] = useState(0)

  useEffect(() => subscribeMass(setMass), [])

  const flash = (msg: string) => {
    setSendResult(msg)
    setTimeout(() => setSendResult(null), 4000)
  }

  useEffect(() => {
    void fetchWspgoConfig().then(setConfig)
  }, [])

  const refreshStatus = useCallback(async () => {
    try {
      const s = await getSessionStatus(config)
      setSessionStatus(s.status)
      return s.status
    } catch {
      setSessionStatus('ERROR')
      return 'ERROR'
    }
  }, [config])

  const loadQr = useCallback(async () => {
    setQrBusy(true)
    setQrErr(null)
    try {
      const src = await fetchSessionQr(config)
      setQrSrc(src)
    } catch (e) {
      setQrSrc(null)
      setQrErr((e as Error).message || 'No hay QR. Cierra la sesión y vuelve a intentar.')
    } finally {
      setQrBusy(false)
    }
  }, [config])

  useEffect(() => {
    void refreshStatus()
    const t = window.setInterval(() => void refreshStatus(), 8000)
    return () => window.clearInterval(t)
  }, [refreshStatus])

  useEffect(() => {
    if (sessionStatus === 'SCAN_QR_CODE' || sessionStatus === 'STARTING') {
      void loadQr()
      const t = window.setInterval(() => void loadQr(), 12000)
      return () => window.clearInterval(t)
    }
    if (sessionStatus === 'WORKING') setQrSrc(null)
  }, [sessionStatus, loadQr])

  const handleLogoutQr = async () => {
    if (!confirm('Se cierra WhatsApp de este local. Después escanea el QR de nuevo.')) return
    setWantQr(true)
    setQrBusy(true)
    setQrErr(null)
    try {
      await logoutWhatsappSession(config)
      await startWhatsappSession(config)
      const st = await refreshStatus()
      if (st === 'SCAN_QR_CODE' || st === 'STARTING' || st === 'STOPPED') {
        await new Promise((r) => setTimeout(r, 1500))
        await refreshStatus()
        await loadQr()
      }
    } catch (e) {
      setQrErr((e as Error).message || 'No se pudo cerrar la sesión')
    } finally {
      setQrBusy(false)
    }
  }

  const handleReconnect = async () => {
    setWantQr(true)
    setQrBusy(true)
    setQrErr(null)
    try {
      await startWhatsappSession(config)
      await refreshStatus()
      await loadQr()
      flash('Reconectando sesión…')
    } catch (e) {
      setQrErr((e as Error).message || 'No se pudo reconectar')
    } finally {
      setQrBusy(false)
    }
  }

  const handleSaveConfig = async () => {
    try {
      await saveWspgoConfig(config)
      setConfigOpen(false)
      flash('Configuración guardada en API')
    } catch (e) {
      flash((e as Error).message || 'Error al guardar')
    }
  }

  const statusOk = sessionStatus === 'WORKING'

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageTitle title="WhatsApp" hint="Envío masivo y avisos automáticos de pedidos." />
        <button
          onClick={() => setConfigOpen(true)}
          className="flex min-h-11 items-center gap-2 rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-cream"
        >
          <Settings2 size={16} /> Configurar
        </button>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div
          className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${
            config.enabled && statusOk ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'
          }`}
        >
          <MessageCircle size={14} />
          {config.enabled ? `Sesión ${config.session}: ${sessionStatus}` : 'Deshabilitado'}
        </div>
        {config.enabled ? (
          <>
            <button
              type="button"
              onClick={() => void handleReconnect()}
              disabled={qrBusy}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[#25d366] px-3 text-xs font-bold text-white disabled:opacity-50"
            >
              <RefreshCw size={13} className={qrBusy ? 'animate-spin' : ''} /> Reconectar sesión
            </button>
            <button
              type="button"
              onClick={() => void handleLogoutQr()}
              disabled={qrBusy}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-ink px-3 text-xs font-bold text-cream disabled:opacity-50"
            >
              <LogOut size={13} /> Cerrar y escanear QR
            </button>
          </>
        ) : null}
        {sendResult && <span className="text-sm font-medium text-green-600">{sendResult}</span>}
      </div>

      {config.enabled &&
      (wantQr || qrSrc || qrErr || sessionStatus === 'SCAN_QR_CODE' || sessionStatus === 'STARTING') ? (
        <div className="card mt-4 flex flex-col items-center gap-3 p-5 sm:flex-row sm:items-start">
          <div className="flex h-52 w-52 shrink-0 items-center justify-center rounded-2xl bg-white ring-1 ring-ink/10">
            {qrSrc ? (
              <img src={qrSrc} alt="QR WhatsApp" className="h-48 w-48 rounded-xl" />
            ) : (
              <QrCode size={48} className="text-ink/25" />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="font-display text-lg">Escanea con WhatsApp</p>
            <p className="text-sm text-ink/55">
              En el celular: WhatsApp → Dispositivos vinculados → Vincular. El código se renueva solo.
            </p>
            {qrErr ? <p className="text-sm font-semibold text-brick">{qrErr}</p> : null}
            <button
              type="button"
              onClick={() => void loadQr()}
              disabled={qrBusy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#25d366] px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
            >
              <RefreshCw size={13} className={qrBusy ? 'animate-spin' : ''} />
              {qrBusy ? 'Cargando…' : 'Actualizar QR'}
            </button>
          </div>
        </div>
      ) : null}

      <div className="card mt-5 space-y-4 p-5">
          <p className="text-sm font-black">Carga masiva de mensajes</p>
          <p className="text-sm text-ink/55">
            Descarga el formato Excel, completa teléfono / nombre / mensaje y súbelo. El envío sigue en
            segundo plano con pausa entre mensajes para no caer en spam.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => downloadMassTemplate()}
              className="min-h-11 rounded-xl bg-cream px-4 text-sm font-semibold"
            >
              Descargar formato XLSX
            </button>
            <label className="min-h-11 cursor-pointer rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-cream">
              Subir Excel
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (!file) return
                  void file.arrayBuffer().then((buf) => {
                    const rows = parseMassXlsx(buf)
                    setMassRows(rows.length)
                    if (!rows.length) {
                      flash('El archivo no tiene filas válidas (telefono + mensaje)')
                      return
                    }
                    enqueueMass(rows, config)
                    flash(`${rows.length} mensajes en cola`)
                  })
                }}
              />
            </label>
            {!mass.running && mass.total > 0 ? (
              <button
                type="button"
                onClick={() => resetMass()}
                className="min-h-11 rounded-xl bg-cream px-4 text-sm font-semibold"
              >
                Limpiar
              </button>
            ) : null}
          </div>
          {mass.total > 0 ? (
            <div className="rounded-xl bg-cream p-3 text-sm">
              <p className="font-semibold">
                {mass.running ? 'Enviando en segundo plano…' : 'Cola'}
              </p>
              <p className="text-ink/55">
                Enviados {mass.sent} · Fallidos {mass.failed} · Total {mass.total}
                {mass.current ? ` · ahora ${mass.current}` : ''}
              </p>
              {mass.lastError ? <p className="mt-1 text-xs text-brick">{mass.lastError}</p> : null}
              {massRows > 0 && mass.running ? (
                <p className="mt-1 text-xs text-ink/40">Puedes salir de esta pantalla; el envío continúa.</p>
              ) : null}
            </div>
          ) : null}
        </div>

      <Modal open={configOpen} title="Configurar iwspgo (WhatsApp)" onClose={() => setConfigOpen(false)} wide>
        <div className="space-y-4">
          <div className="rounded-xl bg-green-50 p-3 text-xs text-green-700">
            <Zap size={12} className="mb-0.5 inline" /> Gateway:{' '}
            <strong>https://iwspgo.indevsoft.com</strong> · Header <code>X-Api-Key</code> · sesión WAHA
          </div>

          <Field label="URL base">
            <input
              className={inputClass}
              value={config.baseUrl}
              onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
            />
          </Field>
          <Field label="API Key (X-Api-Key)">
            <input
              className={inputClass}
              type="password"
              value={config.apiKey}
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
            />
          </Field>
          <Field label="Nombre de sesión">
            <input
              className={inputClass}
              value={config.session}
              onChange={(e) => setConfig({ ...config, session: e.target.value })}
            />
          </Field>
          <Field label="Teléfono del local (avisos de pedidos nuevos)">
            <input
              className={inputClass}
              value={config.notifyPhone}
              onChange={(e) => setConfig({ ...config, notifyPhone: e.target.value })}
              placeholder="51937493214"
            />
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.autoNotifyLocal}
              onChange={(e) => setConfig({ ...config, autoNotifyLocal: e.target.checked })}
              className="h-4 w-4 rounded"
            />
            Avisar al local en cada pedido nuevo
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.autoNotifyCustomer}
              onChange={(e) => setConfig({ ...config, autoNotifyCustomer: e.target.checked })}
              className="h-4 w-4 rounded"
            />
            Avisar al cliente (recibido / listo)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
              className="h-4 w-4 rounded"
            />
            Habilitado
          </label>

          <button
            type="button"
            className="text-xs text-ink/50 underline"
            onClick={() => setConfig({ ...DEFAULT_WSPGO })}
          >
            Restaurar valores por defecto
          </button>

          <button onClick={handleSaveConfig} className="w-full rounded-xl bg-[#25d366] py-3 font-semibold text-white">
            Guardar configuración
          </button>
        </div>
      </Modal>
    </div>
  )
}
