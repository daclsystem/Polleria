import { useEffect, useRef, useState } from 'react'
import { History, Printer, Wallet } from 'lucide-react'
import {
  apiCashClose,
  apiCashHistory,
  apiCashShift,
  type CashCloseRow,
  type CashShift,
  type CashStockLine,
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

function qtyLabel(n: number, unit: string) {
  const v = Number.isInteger(n) ? String(n) : String(round2(n))
  return unit ? `${v} ${unit}` : v
}

function stockFromState(
  orders: Order[],
  products: Product[],
  inventory: InventoryItem[],
  fromAt: string,
): CashStockLine[] {
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
  const used = new Map<string, number>()
  for (const p of products) {
    const sold = soldBy.get(p.id) || 0
    if (!sold || !p.recipes?.length) continue
    for (const r of p.recipes) {
      used.set(r.inventoryId, (used.get(r.inventoryId) || 0) + sold * r.qtyPerUnit)
    }
  }
  return inventory.map((i) => {
    const out = round2(used.get(i.id) || 0)
    const left = round2(i.stock)
    return { id: i.id, name: i.name, unit: i.unit || '', had: round2(left + out), out, left }
  })
}

function mergeStock(api: CashStockLine[] | undefined, local: CashStockLine[]): CashStockLine[] {
  if (!api?.length) return local
  const loc = new Map(local.map((l) => [l.id, l]))
  const seen = new Set<string>()
  const rows = api.map((a) => {
    seen.add(a.id)
    const b = loc.get(a.id)
    const out = round2(Math.max(a.out, b?.out || 0))
    const extra = Math.max(0, out - a.out)
    return { ...a, out, had: round2(a.had + extra) }
  })
  for (const b of local) {
    if (!seen.has(b.id)) rows.push(b)
  }
  return rows
}

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
    products: productLines.filter((l) => l.sold > 0),
    insumos,
  }
}

function SignaturePad({ onChange }: { onChange: (dataUrl: string) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)

  const metrics = () => {
    const wrap = wrapRef.current
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    return { w: wrap?.clientWidth || 0, h: wrap?.clientHeight || 0, dpr }
  }

  const ctx2d = () => canvasRef.current?.getContext('2d') ?? null

  const styleStroke = (ctx: CanvasRenderingContext2D, dpr: number) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111827'
    ctx.lineWidth = 2.4
  }

  const fit = (keep: boolean) => {
    if (drawing.current) return
    const c = canvasRef.current
    if (!c) return
    const { w, h, dpr } = metrics()
    if (w < 8 || h < 8) return
    const bw = Math.round(w * dpr)
    const bh = Math.round(h * dpr)
    if (c.width === bw && c.height === bh) return
    const snap = keep && c.width > 1 && c.height > 1 ? c.toDataURL('image/png') : ''
    c.width = bw
    c.height = bh
    const ctx = ctx2d()
    if (!ctx) return
    styleStroke(ctx, dpr)
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, w, h)
    if (!snap) return
    const img = new Image()
    img.onload = () => {
      styleStroke(ctx, dpr)
      ctx.drawImage(img, 0, 0, w, h)
    }
    img.src = snap
  }

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver(() => fit(true))
    ro.observe(wrap)
    const t = window.setTimeout(() => fit(false), 40)
    return () => {
      ro.disconnect()
      window.clearTimeout(t)
    }
  }, [])

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const emit = () => {
    const c = canvasRef.current
    if (c) onChange(c.toDataURL('image/png'))
  }

  return (
    <div>
      <div
        ref={wrapRef}
        className="h-28 w-full overflow-hidden rounded-xl bg-white ring-1 ring-ink/15"
      >
        <canvas
          ref={canvasRef}
          className="block h-full w-full touch-none"
          style={{ touchAction: 'none' }}
          onPointerDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            drawing.current = true
            e.currentTarget.setPointerCapture(e.pointerId)
            const p = pos(e)
            last.current = p
            const ctx = ctx2d()
            if (!ctx) return
            styleStroke(ctx, metrics().dpr)
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(p.x + 0.01, p.y)
            ctx.stroke()
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return
            e.preventDefault()
            const p = pos(e)
            const prev = last.current
            last.current = p
            const ctx = ctx2d()
            if (!ctx || !prev) return
            styleStroke(ctx, metrics().dpr)
            ctx.beginPath()
            ctx.moveTo(prev.x, prev.y)
            ctx.lineTo(p.x, p.y)
            ctx.stroke()
          }}
          onPointerUp={(e) => {
            drawing.current = false
            last.current = null
            try {
              e.currentTarget.releasePointerCapture(e.pointerId)
            } catch {
              /* ignore */
            }
            emit()
          }}
          onPointerCancel={(e) => {
            drawing.current = false
            last.current = null
            try {
              e.currentTarget.releasePointerCapture(e.pointerId)
            } catch {
              /* ignore */
            }
            emit()
          }}
        />
      </div>
      <button
        type="button"
        className="mt-1 text-xs font-semibold text-ink/45 underline"
        onClick={() => {
          drawing.current = false
          const c = canvasRef.current
          const ctx = ctx2d()
          const { w, h, dpr } = metrics()
          if (!c || !ctx) return
          styleStroke(ctx, dpr)
          ctx.fillStyle = '#fff'
          ctx.fillRect(0, 0, w, h)
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

  const liveShift = shiftFromOrders(
    state.orders,
    typeof localStorage !== 'undefined' ? localStorage.getItem(LAST_CLOSE_KEY) : null,
  )
  const hasSales = (shift?.ordersCount ?? liveShift.ordersCount) > 0 && (shift?.salesTotal ?? liveShift.salesTotal) > 0
  const fromAt = shift?.fromAt || liveShift.fromAt
  const cuanti = cuantificableResumen(state.orders, state.products, state.inventory, fromAt)
  const stockLines: CashStockLine[] = mergeStock(
    shift?.stock,
    stockFromState(state.orders, state.products, state.inventory, fromAt),
  )

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
        cuantificable: cuanti,
        stock: stockLines,
      }),
    )
  }

  const runClose = async () => {
    if (!hasSales) {
      setDlg(null)
      setErr('No hay ventas en este turno. No se puede cerrar caja.')
      return
    }
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
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setDlg(null)
            setTab('historial')
            setOpen(true)
          }}
          className="inline-flex min-h-10 items-center gap-2 rounded-full bg-cream px-4 py-2 text-sm font-semibold text-ink"
        >
          <History size={16} /> Historial
        </button>
        <button
          type="button"
          disabled={!hasSales}
          title={!hasSales ? 'No hay ventas en este turno' : undefined}
          onClick={() => {
            setNotes('')
            setSignature('')
            setDlg(null)
            setTab('cierre')
            setOpen(true)
          }}
          className="inline-flex min-h-10 items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-cream disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Wallet size={16} /> Cierre de caja
        </button>
      </div>

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
            {!hasSales ? (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                No hay ventas cobradas en este turno. El cierre de caja no se puede hacer.
              </p>
            ) : null}
            <div className="rounded-2xl bg-cream p-3 text-sm">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink/40">
                Stock del turno
              </p>
              {stockLines.length === 0 ? (
                <p className="text-xs text-ink/45">No hay insumos en inventario.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[13px]">
                    <thead>
                      <tr className="text-[10px] font-bold uppercase tracking-wide text-ink/40">
                        <th className="pb-1.5 pr-2 font-bold">Insumo</th>
                        <th className="pb-1.5 px-1 text-right font-bold">Había</th>
                        <th className="pb-1.5 px-1 text-right font-bold">Salió</th>
                        <th className="pb-1.5 pl-1 text-right font-bold">Queda</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockLines.map((l) => (
                        <tr key={l.id} className="border-t border-ink/10">
                          <td className="py-1.5 pr-2">
                            <span className="block max-w-[11rem] truncate">{l.name}</span>
                            {l.unit ? <span className="text-[10px] text-ink/35">{l.unit}</span> : null}
                          </td>
                          <td className="py-1.5 px-1 text-right tabular-nums">{qtyLabel(l.had, '')}</td>
                          <td className="py-1.5 px-1 text-right tabular-nums font-semibold">{qtyLabel(l.out, '')}</td>
                          <td className="py-1.5 pl-1 text-right tabular-nums font-bold">{qtyLabel(l.left, '')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {cuanti.products.length > 0 ? (
              <div className="rounded-2xl bg-cream p-3 text-sm">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink/40">
                  Vendidos en el turno
                </p>
                <ul className="space-y-1">
                  {cuanti.products.map((l) => (
                    <li key={l.name} className="flex justify-between gap-2">
                      <span className="min-w-0 truncate">{l.name}</span>
                      <span className="shrink-0 font-semibold">{qtyLabel(l.sold, l.unit)}</span>
                    </li>
                  ))}
                </ul>
              </div>
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
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold tracking-[0.14em] text-ink/40 uppercase">
                Firma · entrega del efectivo y liquidación
              </p>
              <SignaturePad onChange={setSignature} />
            </div>
            {err ? <p className="text-xs font-semibold text-ember">{err}</p> : null}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!hasSales}
                onClick={() => printCurrent()}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-cream text-sm font-bold disabled:opacity-40"
              >
                <Printer size={16} /> Imprimir
              </button>
              <button
                type="button"
                disabled={!hasSales}
                onClick={() => {
                  if (!hasSales) return
                  if (!signature) {
                    setErr('Firma la entrega del efectivo para liquidar.')
                    return
                  }
                  setDlg('confirm')
                }}
                className="min-h-11 rounded-xl bg-ink text-sm font-bold text-cream disabled:opacity-40"
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
