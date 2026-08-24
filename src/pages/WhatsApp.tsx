import { useEffect, useState } from 'react'
import {
  MessageCircle,
  Phone,
  Send,
  Settings2,
  Zap,
} from 'lucide-react'
import { useStore } from '../store/StoreContext'
import { formatDateTime, padOrder, soles } from '../lib/format'
import {
  DEFAULT_WSPGO,
  fetchWspgoConfig,
  getSessionStatus,
  saveWspgoConfig,
  sendWhatsAppText,
  type WspgoConfig,
} from '../lib/whatsapp'
import type { Order } from '../types'
import { Field, Modal, PageTitle, inputClass } from '../components/ui'

type MessageTab = 'pedidos' | 'plantillas' | 'config'

function fillPreview(template: string, order: Order) {
  const detalle = order.items.map((i) => `${i.qty}x ${i.name}`).join('\n')
  return template
    .replace(/\{nombre\}/g, order.customerName)
    .replace(/\{numero\}/g, String(order.number))
    .replace(/\{total\}/g, soles(order.total))
    .replace(/\{detalle\}/g, detalle)
    .replace(/\{direccion\}/g, order.address || 'N/A')
    .replace(/\{telefono\}/g, order.customerPhone || '')
    .replace(/\{tipo\}/g, order.type)
    .replace(/\{pago\}/g, order.paymentMethod)
    .replace(/\{tipo_entrega\}/g, order.type === 'delivery' ? 'Delivery' : 'Recojo')
    .replace(/\{direccion_line\}/g, order.address ? `📍 ${order.address}` : '')
}

export function WhatsApp() {
  const { state } = useStore()
  const [config, setConfig] = useState<WspgoConfig>(DEFAULT_WSPGO)
  const [tab, setTab] = useState<MessageTab>('pedidos')
  const [configOpen, setConfigOpen] = useState(false)
  const [previewMsg, setPreviewMsg] = useState<string | null>(null)
  const [customPhone, setCustomPhone] = useState('')
  const [customMsg, setCustomMsg] = useState('')
  const [sendResult, setSendResult] = useState<string | null>(null)
  const [sessionStatus, setSessionStatus] = useState<string>('…')

  const recentOrders = state.orders
    .filter((o) => o.customerPhone && o.status !== 'cancelado')
    .slice(0, 15)

  useEffect(() => {
    void fetchWspgoConfig().then(setConfig)
  }, [])

  useEffect(() => {
    getSessionStatus(config)
      .then((s) => setSessionStatus(s.status))
      .catch(() => setSessionStatus('ERROR'))
  }, [config.baseUrl, config.apiKey, config.session])

  const flash = (msg: string) => {
    setSendResult(msg)
    setTimeout(() => setSendResult(null), 4000)
  }

  const handleSendToOrder = async (order: Order, key: keyof WspgoConfig['templates']) => {
    const phone = order.customerPhone || ''
    if (!phone) return
    const message = fillPreview(config.templates[key], order)
    const res = await sendWhatsAppText(phone, message, config)
    flash(res.ok ? `Enviado a ${order.customerName}` : `Error: ${res.error}`)
  }

  const handleSendCustom = async () => {
    if (!customPhone || !customMsg) return
    const res = await sendWhatsAppText(customPhone, customMsg, config)
    flash(res.ok ? 'Mensaje enviado' : `Error: ${res.error}`)
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

  const tabs: { id: MessageTab; label: string }[] = [
    { id: 'pedidos', label: 'Enviar a pedidos' },
    { id: 'plantillas', label: 'Plantillas' },
    { id: 'config', label: 'Mensaje libre' },
  ]

  const statusOk = sessionStatus === 'WORKING'

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageTitle title="WhatsApp" hint="Pedidos automáticos vía iwspgo.indevsoft.com" />
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
        {!statusOk && config.enabled ? (
          <a
            href="https://iwspgo.indevsoft.com/dashboard"
            target="_blank"
            rel="noreferrer"
            className="text-sm font-semibold text-ember underline"
          >
            Abrir dashboard y escanear QR
          </a>
        ) : null}
        {sendResult && <span className="text-sm font-medium text-green-600">{sendResult}</span>}
      </div>

      <div className="mt-5 flex gap-2 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`min-h-9 shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold ${
              tab === t.id ? 'bg-[#25d366] text-white' : 'bg-white text-ink/60'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'pedidos' && (
        <div className="mt-5 space-y-3">
          <p className="text-xs text-ink/50">
            Cada pedido nuevo se envía solo al local y al cliente. Aquí puedes reenviar plantillas.
          </p>
          {recentOrders.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-ink/15 py-12 text-center text-ink/40">
              No hay pedidos con teléfono registrado
            </div>
          ) : (
            recentOrders.map((o) => (
              <div key={o.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#25d366]/10">
                    <Phone size={18} className="text-[#25d366]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">
                      {padOrder(o.number)} · {o.customerName}
                    </p>
                    <p className="text-xs text-ink/50">
                      {o.customerPhone} · {soles(o.total)} · {formatDateTime(o.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleSendToOrder(o, 'pedidoRecibido')}
                    className="flex min-h-8 items-center gap-1 rounded-lg bg-[#25d366] px-3 text-xs font-semibold text-white"
                  >
                    <Send size={11} /> Recibido
                  </button>
                  <button
                    onClick={() => handleSendToOrder(o, 'pedidoListo')}
                    className="flex min-h-8 items-center gap-1 rounded-lg bg-[#25d366] px-3 text-xs font-semibold text-white"
                  >
                    <Send size={11} /> Listo
                  </button>
                  {o.type === 'delivery' ? (
                    <button
                      onClick={() => handleSendToOrder(o, 'pedidoEnCamino')}
                      className="flex min-h-8 items-center gap-1 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white"
                    >
                      <Send size={11} /> En camino
                    </button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'plantillas' && (
        <div className="mt-5 space-y-4">
          <p className="text-xs text-ink/50">
            Variables: {'{nombre}'}, {'{numero}'}, {'{total}'}, {'{detalle}'}, {'{direccion}'}, {'{pago}'}
          </p>
          {(Object.keys(config.templates) as (keyof WspgoConfig['templates'])[]).map((key) => {
            const labels: Record<string, string> = {
              pedidoRecibido: 'Pedido recibido (cliente)',
              pedidoListo: 'Pedido listo (cliente)',
              pedidoEnCamino: 'Pedido en camino',
              avisoLocal: 'Aviso al local (pedido nuevo)',
            }
            return (
              <div key={key} className="card p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{labels[key] || key}</p>
                  <button
                    onClick={() => setPreviewMsg(config.templates[key])}
                    className="text-xs font-semibold text-[#25d366] hover:underline"
                  >
                    Vista previa
                  </button>
                </div>
                <textarea
                  className="mt-2 w-full resize-none rounded-xl border border-ink/10 bg-cream p-3 text-xs leading-relaxed"
                  rows={4}
                  value={config.templates[key]}
                  onChange={(e) => {
                    setConfig({
                      ...config,
                      templates: { ...config.templates, [key]: e.target.value },
                    })
                  }}
                />
              </div>
            )
          })}
          <button
            onClick={async () => {
              try {
                await saveWspgoConfig(config)
                flash('Plantillas guardadas en API')
              } catch (e) {
                flash((e as Error).message || 'Error al guardar')
              }
            }}
            className="w-full rounded-xl bg-[#25d366] py-3 font-semibold text-white"
          >
            Guardar plantillas
          </button>
        </div>
      )}

      {tab === 'config' && (
        <div className="card mt-5 space-y-4 p-5">
          <Field label="Número de WhatsApp (con código de país)">
            <input
              className={inputClass}
              value={customPhone}
              onChange={(e) => setCustomPhone(e.target.value)}
              placeholder="51999999999"
              inputMode="tel"
            />
          </Field>
          <Field label="Mensaje">
            <textarea
              className="w-full resize-none rounded-xl border border-ink/10 bg-white p-3 text-sm"
              rows={5}
              value={customMsg}
              onChange={(e) => setCustomMsg(e.target.value)}
            />
          </Field>
          <button
            onClick={handleSendCustom}
            disabled={!customPhone || !customMsg}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#25d366] py-3 font-semibold text-white disabled:opacity-40"
          >
            <Send size={16} /> Enviar por API
          </button>
        </div>
      )}

      <Modal open={!!previewMsg} title="Vista previa del mensaje" onClose={() => setPreviewMsg(null)}>
        <div className="rounded-2xl bg-[#e5ddd5] p-4">
          <div className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-[#dcf8c6] p-3 text-sm shadow-sm">
            {previewMsg}
          </div>
        </div>
      </Modal>

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
