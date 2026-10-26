import { formatDayShort, limaYmd } from './format'
import { isVoidOrder } from '../types'

const DAY_MS = 24 * 60 * 60 * 1000

/** Medianoche de ese día en Lima, como instante UTC (Perú es UTC−5, sin horario de verano). */
export function limaDayStart(ymd: string) {
  return new Date(`${ymd}T05:00:00.000Z`)
}

export function limaDayEnd(ymd: string) {
  const d = limaDayStart(ymd)
  d.setUTCDate(d.getUTCDate() + 1)
  return d
}

export function limaTodayYmd() {
  return limaYmd(new Date())
}

/** Días de calendario en Lima, de `from` inclusive a `until` exclusive. */
export function eachLimaDay(from: Date, until: Date) {
  const days: { ymd: string; label: string }[] = []
  for (let t = from.getTime(); t < until.getTime(); t += DAY_MS) {
    const day = new Date(t)
    days.push({ ymd: limaYmd(day), label: formatDayShort(day.toISOString()) })
  }
  return days
}

/** Últimos `dayCount` días en Lima, terminando hoy. El mismo corte que Reportes. */
export function limaRecentRange(dayCount: number) {
  const endYmd = limaTodayYmd()
  const until = limaDayEnd(endYmd)
  const from = limaDayStart(endYmd)
  from.setUTCDate(from.getUTCDate() - (dayCount - 1))
  return { from, until, fromYmd: limaYmd(from), toYmd: endYmd }
}

export type DaySales = { label: string; total: number; count: number }

type SalesOrder = { createdAt: string; paid?: boolean; status?: string | null; total?: number }

/** Ventas cobradas por día. Misma regla que el gráfico de Reportes. */
export function paidSalesByDay(orders: SalesOrder[], from: Date, until: Date): DaySales[] {
  const inRange = orders.filter((o) => {
    const t = new Date(o.createdAt).getTime()
    return t >= from.getTime() && t < until.getTime() && o.paid && !isVoidOrder(o.status)
  })
  return eachLimaDay(from, until).map((day) => {
    const rows = inRange.filter((o) => limaYmd(o.createdAt) === day.ymd)
    return {
      label: day.label,
      total: rows.reduce((s, o) => s + (Number(o.total) || 0), 0),
      count: rows.length,
    }
  })
}
