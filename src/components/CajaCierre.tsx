import { useEffect, useRef, useState } from 'react'
import { History, Printer, Wallet } from 'lucide-react'
import {
  apiCashClose,
  apiCashHistory,
  apiCashShift,
  type CashCloseRow,
  type CashShift,
} from '../lib/apiClient'
import { formatDateTime, round2, soles } from '../lib/format'
import { cashCloseHtml, printReport } from '../lib/print'
import { useStore } from '../store/StoreContext'
import type { InventoryItem, Order, Product } from '../types'
import { Field, Modal, inputClass } from './ui'
import { ConfirmProcess } from './ConfirmProcess'

const LAST_CLOSE_KEY = 'polleria.cashLastCloseAt'
const HIST_KEY = 'polleria.cashCloseHistory'

function limaDayStartIso() {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date())
  return new Date(`${ymd}T05:00:00.000Z`).toISOString()
}

function shiftFromOrders(orders: Order[], lastCloseAt: string | null): CashShift {
  const dayStart = limaDayStartIso()
  const fromAt =
    lastCloseAt && new Date(lastCloseAt).getTime() > new Date(dayStart).getTime() ? lastCloseAt : dayStart
  const fromMs = new Date(fromAt).getTime()
  const inShift = orders.filter((o) => {
    if (!o.paid || o.status === 'cancelado') return false
    return new Date(o.updatedAt || o.createdAt).getTime() >= fromMs
  })
  let efectivo = 0
  let yape = 0
  let tarjeta = 0
  for (const o of inShift) {
    const m = o.paymentMethod
    if (m === 'yape') yape += o.total
    else if (m === 'tarjeta') tarjeta += o.total
    else efectivo += o.total
  }
  return {
    fromAt,
    lastCloseAt,
    ordersCount: inShift.length,
    salesTotal: round2(inShift.reduce((s, o) => s + o.total, 0)),
    efectivo: round2(efectivo),
    yape: round2(yape),
    tarjeta: round2(tarjeta),
    pendingUnpaid: orders.filter((o) => !o.paid && o.status !== 'cancelado').length,
  }
}

function readLocalHistory(): CashCloseRow[] {
  try {
    const raw = localStorage.getItem(HIST_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as CashCloseRow[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function pushLocalHistory(row: CashCloseRow) {
  const next = [row, ...readLocalHistory()].slice(0, 40)
  localStorage.setItem(HIST_KEY, JSON.stringify(next))
}

export type CuantiLine = { name: string; sold: number; left: number; unit: string }

function cuantificableResumen(
  orders: Order[],
  products: Product[],
  inventory: InventoryItem[],
  fromAt: string,
): { products: CuantiLine[]; insumos: CuantiLine[] } {
  const fromMs = new Date(fromAt).getTime()
  const soldBy = new Map<string, number>()
  for (const o of orders) {
    if (!o.paid || o.status === 'cancelado') continue
    if (new Date(o.updatedAt || o.createdAt).getTime() < fromMs) continue
    for (const it of o.items) {
      if (!it.productId || it.productId === 'delivery') continue
      soldBy.set(it.productId, (soldBy.get(it.productId) || 0) + it.qty)
    }
  }
  const invBy = new Map(inventory.map((i) => [i.id, i]))
  const cuanti = products.filter((p) => p.cuantificable || (p.recipes && p.recipes.length > 0))
  const productLines: CuantiLine[] = cuanti.map((p) => {
    const sold = soldBy.get(p.id) || 0
    let left = 0
    if (p.recipes?.length) {
      const parts = p.recipes.map((r) => {
        const inv = invBy.get(r.inventoryId)
        if (!inv || !(r.qtyPerUnit > 0)) return 0
        return Math.floor((inv.stock / r.qtyPerUnit) * 100) / 100
      })
      left = parts.length ? Math.max(0, Math.min(...parts)) : 0
    }
    return { name: p.name, sold: round2(sold), left: round2(left), unit: 'und' }
  })
  const used = new Map<string, number>()
  for (const p of cuanti) {
    const sold = soldBy.get(p.id) || 0
    if (!sold || !p.recipes) continue
    for (const r of p.recipes) {
      used.set(r.inventoryId, (used.get(r.inventoryId) || 0) + sold * r.qtyPerUnit)
    }
  }
  const insumos: CuantiLine[] = inventory
    .filter((i) => used.has(i.id) || cuanti.some((p) => p.recipes?.some((r) => r.inventoryId === i.id)))
    .map((i) => ({
      name: i.name,
      sold: round2(used.get(i.id) || 0),
      left: round2(i.stock),
      unit: i.unit || '',
    }))
    .filter((l) => l.sold > 0 || l.left !== 0)
  return {
    products: productLines.filter((l) => l.sold > 0 || l.left > 0),
    insumos,
  }
}

function qtyLabel(n: number, unit: string) {
  const v = Number.isInteger(n) ? String(n) : String(round2(n))
  return unit ? `${v} ${unit}` : v
}

function SignaturePad({ onChange }: { onChange: (dataUrl: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)

  const syncSize = () => {
    const c = ref.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    const rect = c.getBoundingClientRect()
    const snap = c.toDataURL('image/png')
    c.width = Math.max(1, Math.round(rect.width * dpr))
    c.height = Math.max(1, Math.round(rect.height * dpr))
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111'
    ctx.lineWidth = 2.2
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, rect.width, rect.height)
    if (snap && snap.length > 80) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height)
      img.src = snap
    }
  }

  useEffect(() => {
    syncSize()
    const onResize = () => syncSize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = ref.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const emit = () => {
    const c = ref.current
    if (c) onChange(c.toDataURL('image/png'))
  }

  return (
    <div>
      <canvas
        ref={ref}
        className="h-28 w-full touch-none rounded-xl bg-white ring-1 ring-ink/15"
        onPointerDown={(e) => {
          drawing.current = true
          e.currentTarget.setPointerCapture(e.pointerId)
          const ctx = ref.current?.getContext('2d')
          const p = point(e)
          ctx?.beginPath()
          ctx?.moveTo(p.x, p.y)
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return
          const ctx = ref.current?.getContext('2d')
          const p = point(e)
          ctx?.lineTo(p.x, p.y)
          ctx?.stroke()
        }}
        onPointerUp={() => {
          drawing.current = false
          emit()
        }}
        onPointerLeave={() => {
          if (!drawing.current) return
          drawing.current = false
          emit()
        }}
      />
      <button
        type="button"
        className="mt-1 text-xs font-semibold text-ink/45 underline"
        onClick={() => {
          const c = ref.current
          const ctx = c?.getContext('2d')
          if (!c || !ctx) return
          ctx.fillStyle = '#fff'
          ctx.fillRect(0, 0, c.getBoundingClientRect().width, c.getBoundingClientRect().height)
          onChange('')
        }}
      >
        Borrar firma
      </button>
    </div>
  )
}

export function CajaCierre() {
  const { state } = useStore()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'cierre' | 'historial'>('cierre')
  const [shift, setShift] = useState<CashShift | null>(null)
  const [fromApi, setFromApi] = useState(false)
  const [history, setHistory] = useState<CashCloseRow[]>([])
  const [counted, setCounted] = useState(0)
  const [notes, setNotes] = useState('')
  const [signature, setSignature] = useState('')
  const [err, setErr] = useState('')
  const [dlg, setDlg] = useState<'confirm' | 'busy' | 'done' | null>(null)
  const [diffDone, setDiffDone] = useState<number | null>(null)

  const applyShift = (s: CashShift, api: boolean) => {
    setFromApi(api)
    setShift(s)
    setCounted(round2(s.efectivo))
  }

  const load = () => {
    setErr('')
    setShift(null)
    const local = () =>
      shiftFromOrders(state.orders, typeof localStorage !== 'undefined' ? localStorage.getItem(LAST_CLOSE_KEY) : null)
    void apiCashShift()
      .then((s) => applyShift(s, true))
      .catch(() => applyShift(local(), false))
    void apiCashHistory()
      .then(setHistory)
      .catch(() => setHistory(readLocalHistory()))
  }

  useEffect(() => {
    if (open) load()
  }, [open])

  const diff = round2((counted || 0) - (shift?.efectivo || 0))

  const printCurrent = (closedAt = new Date().toISOString()) => {
    if (!shift) return
    printReport(
      cashCloseHtml({
        settings: state.settings,
        fromAt: shift.fromAt,
        closedAt,
        ordersCount: shift.ordersCount,
        sales: shift.salesTotal,
        efectivo: shift.efectivo,
        yape: shift.yape,
        tarjeta: shift.tarjeta,
        counted,
        difference: diff,
        notes: notes.trim() || undefined,
        signature: signature || undefined,
      }),
    )
  }

  const runClose = async () => {
    if (!signature) {
      setDlg(null)
      setErr('Firma la entrega del efectivo para liquidar.')
      return
    }
    setDlg('busy')
    setErr('')
    const closedAt = new Date().toISOString()
    try {
      const r = await apiCashClose({
        countedCash: counted,
        notes: notes.trim() || undefined,
        signature,
      })
      setDiffDone(r.difference)
      try {
        localStorage.setItem(LAST_CLOSE_KEY, closedAt)
        pushLocalHistory({
          id: `local-${Date.now()}`,
          fromAt: shift?.fromAt || closedAt,
          closedAt,
          ordersCount: r.ordersCount,
          salesTotal: r.salesTotal,
          efectivo: r.efectivo,
          yape: r.yape,
          tarjeta: r.tarjeta,
          countedCash: counted,
          difference: r.difference,
          notes: notes.trim(),
        })
      } catch {
        /* ignore */
      }
      setDlg('done')
      printCurrent(closedAt)
      void apiCashHistory()
        .then(setHistory)
        .catch(() => setHistory(readLocalHistory()))
    } catch {
      try {
        localStorage.setItem(LAST_CLOSE_KEY, closedAt)
        pushLocalHistory({
          id: `local-${Date.now()}`,
          fromAt: shift?.fromAt || closedAt,
          closedAt,
          ordersCount: shift?.ordersCount || 0,
          salesTotal: shift?.salesTotal || 0,
          efectivo: shift?.efectivo || 0,
          yape: shift?.yape || 0,
          tarjeta: shift?.tarjeta || 0,
          countedCash: counted,
          difference: diff,
          notes: notes.trim(),
        })
      } catch {
        /* ignore */
      }
      setDiffDone(diff)
      setDlg('done')
      printCurrent(closedAt)
      setHistory(readLocalHistory())
    }
  }

  const stats = {
    n: history.length,
    sales: history.reduce((s, h) => s + h.salesTotal, 0),
    cash: history.reduce((s, h) => s + h.countedCash, 0),
    diff: history.reduce((s, h) => s + h.difference, 0),
    tickets: history.reduce((s, h) => s + h.ordersCount, 0),
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setNotes('')
          setSignature('')
          setDlg(null)
          setTab('cierre')
          setOpen(true)
        }}
        className="inline-flex min-h-10 items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-cream"
      >
        <Wallet size={16} /> Cierre de caja
      </button>

      <Modal open={open} title="Cierre de caja" onClose={() => setOpen(false)} wide>
        <div className="mb-3 flex gap-2">
          <button
            type="button"
            onClick={() => setTab('cierre')}
            className={`min-h-9 rounded-full px-4 text-sm font-semibold ${
              tab === 'cierre' ? 'bg-ink text-cream' : 'bg-cream text-ink/60'
            }`}
          >
            Cerrar turno
          </button>
          <button
            type="button"
            onClick={() => setTab('historial')}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-4 text-sm font-semibold ${
              tab === 'historial' ? 'bg-ink text-cream' : 'bg-cream text-ink/60'
            }`}
          >
            <History size={14} /> Historial y estadística
          </button>
        </div>

        {tab === 'historial' ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-2xl bg-cream p-3">
                <p className="text-[11px] font-bold uppercase text-ink/40">Cierres</p>
                <p className="text-xl font-black">{stats.n}</p>
              </div>
              <div className="rounded-2xl bg-cream p-3">
                <p className="text-[11px] font-bold uppercase text-ink/40">Ventas</p>
                <p className="text-xl font-black">{soles(stats.sales)}</p>
              </div>
              <div className="rounded-2xl bg-cream p-3">
                <p className="text-[11px] font-bold uppercase text-ink/40">Efectivo contado</p>
                <p className="font-black">{soles(stats.cash)}</p>
              </div>
              <div className="rounded-2xl bg-cream p-3">
                <p className="text-[11px] font-bold uppercase text-ink/40">Diferencia</p>
                <p className={`font-black ${Math.abs(stats.diff) < 0.01 ? 'text-emerald-700' : 'text-ember'}`}>
                  {soles(stats.diff)}
                </p>
              </div>
            </div>
            <p className="text-xs text-ink/45">
              {stats.tickets} pedidos cobrados en esos turnos
              {stats.n ? ` · promedio ${soles(stats.sales / stats.n)} por cierre` : ''}.
            </p>
            {history.length === 0 ? (
              <p className="rounded-xl bg-cream px-3 py-6 text-center text-sm text-ink/45">
                Aún no hay cierres registrados.
              </p>
            ) : (
              <ul className="max-h-72 space-y-2 overflow-y-auto">
                {history.map((h) => (
                  <li key={h.id} className="rounded-2xl bg-cream p-3 text-sm">
                    <p className="font-semibold">{formatDateTime(h.closedAt)}</p>
                    <p className="text-ink/55">
                      {h.ordersCount} pedidos · {soles(h.salesTotal)} · contado {soles(h.countedCash)}
                      {Math.abs(h.difference) >= 0.01
                        ? ` · ${h.difference > 0 ? 'sobrante' : 'faltante'} ${soles(Math.abs(h.difference))}`
                        : ' · cuadra'}
                    </p>
                    {h.notes ? <p className="mt-1 text-xs text-ink/40">{h.notes}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : shift ? (
          <div className="space-y-3">
            <p className="text-sm text-ink/55">
              Turno desde {formatDateTime(shift.fromAt)}
              {shift.lastCloseAt ? ' (último cierre)' : ' (inicio del día)'}
            </p>
            {!fromApi ? (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                Totales según pedidos ya cobrados en este turno. Puedes cuadrar y cerrar igual.
              </p>
            ) : null}
            <div className="rounded-2xl bg-cream p-3 text-sm space-y-1">
              <p className="flex justify-between">
                <span>Pedidos cobrados</span>
                <strong>{shift.ordersCount}</strong>
              </p>
              <p className="flex justify-between">
                <span>Ventas</span>
                <strong>{soles(shift.salesTotal)}</strong>
              </p>
              <p className="flex justify-between">
                <span>Efectivo esperado</span>
                <strong>{soles(shift.efectivo)}</strong>
              </p>
              <p className="flex justify-between">
                <span>Yape</span>
                <span>{soles(shift.yape)}</span>
              </p>
              <p className="flex justify-between">
                <span>Tarjeta</span>
                <span>{soles(shift.tarjeta)}</span>
              </p>
            </div>
            {shift.pendingUnpaid > 0 ? (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                Aún hay {shift.pendingUnpaid} pedido{shift.pendingUnpaid === 1 ? '' : 's'} por cobrar.
              </p>
            ) : null}
            <Field label="Conteo de efectivo en caja">
              <input
                className={inputClass}
                inputMode="decimal"
                value={counted || ''}
                onChange={(e) => setCounted(Math.max(0, round2(Number(e.target.value) || 0)))}
              />
            </Field>
            <p className={`text-sm font-bold ${Math.abs(diff) < 0.01 ? 'text-emerald-700' : 'text-ember'}`}>
              {Math.abs(diff) < 0.01
                ? 'Cuadra con el esperado'
                : diff > 0
                  ? `Sobrante ${soles(diff)}`
                  : `Faltante ${soles(Math.abs(diff))}`}
            </p>
            <Field label="Nota (opcional)">
              <input
                className={inputClass}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Turno mañana, cajero…"
              />
            </Field>
            <Field label="Firma · entrega del efectivo y liquidación">
              <SignaturePad onChange={setSignature} />
            </Field>
            {err ? <p className="text-xs font-semibold text-ember">{err}</p> : null}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => printCurrent()}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-cream text-sm font-bold"
              >
                <Printer size={16} /> Imprimir
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!signature) {
                    setErr('Firma la entrega del efectivo para liquidar.')
                    return
                  }
                  setDlg('confirm')
                }}
                className="min-h-11 rounded-xl bg-ink text-sm font-bold text-cream"
              >
                Cerrar caja
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink/50">Cargando turno…</p>
        )}
      </Modal>

      <ConfirmProcess
        open={!!dlg}
        phase={dlg === 'done' ? 'done' : dlg === 'busy' ? 'busy' : 'confirm'}
        title="¿Cerrar caja ahora?"
        message={
          <p>
            Se liquida el turno con efectivo contado <strong>{soles(counted)}</strong>
            {Math.abs(diff) >= 0.01
              ? ` (${diff > 0 ? 'sobrante' : 'faltante'} ${soles(Math.abs(diff))})`
              : ''}
            . Queda la firma de entrega.
          </p>
        }
        confirmLabel="Sí, liquidar"
        tone="ink"
        doneTitle="Caja cerrada"
        doneMessage={
          diffDone == null || Math.abs(diffDone) < 0.01
            ? 'Liquidación impresa. El siguiente turno empieza ahora.'
            : `Cierre registrado. Diferencia: ${soles(diffDone)}.`
        }
        busyLabel="Cerrando…"
        onConfirm={() => void runClose()}
        onCancel={() => setDlg(null)}
        onDone={() => {
          setDlg(null)
          setTab('historial')
        }}
      />
    </>
  )
}
