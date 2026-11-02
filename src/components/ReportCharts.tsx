import { useMemo, useSyncExternalStore } from 'react'
import _ReactEChartsCore from 'echarts-for-react/lib/core'
import * as echarts from 'echarts/core'
import { PieChart as EPie, BarChart as EBar, LineChart as ELine } from 'echarts/charts'
import { TooltipComponent, LegendComponent, GridComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { soles } from '../lib/format'

const ReactEChartsCore = ((_ReactEChartsCore as unknown as { default?: typeof _ReactEChartsCore }).default ??
  _ReactEChartsCore) as typeof _ReactEChartsCore

echarts.use([EPie, EBar, ELine, TooltipComponent, LegendComponent, GridComponent, CanvasRenderer])

const PIE_COLORS = ['#ffd700', '#8fd48f', '#38bdf8', '#fb7185', '#c4b5fd', '#34d399', '#fbbf24', '#94a3b8']

function useDark() {
  return useSyncExternalStore(
    (cb) => {
      const mo = new MutationObserver(cb)
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
      return () => mo.disconnect()
    },
    () => document.documentElement.classList.contains('dark'),
    () => false,
  )
}

function palette(dark: boolean) {
  return {
    text: dark ? '#9ca89c' : '#6b7280',
    grid: dark ? 'rgba(148,163,184,0.18)' : 'rgba(12,12,12,0.08)',
    axis: dark ? 'rgba(148,163,184,0.28)' : 'rgba(12,12,12,0.16)',
    tipBg: dark ? '#1c221c' : '#ffffff',
    tipBorder: dark ? 'rgba(255,255,255,0.12)' : 'rgba(12,12,12,0.08)',
    tipText: dark ? '#f3f6f3' : '#0c0c0c',
    ember: dark ? '#8fd48f' : '#1a3d1a',
    gold: '#ffd700',
    amber: dark ? '#fbbf24' : '#d97706',
  }
}

function axisMoney(v: number) {
  if (v >= 1000) return `S/${(v / 1000).toFixed(v >= 10000 ? 0 : 1).replace(/\.0$/, '')}k`
  return `S/${Math.round(v)}`
}

type MoneyRow = { label: string; total: number; count?: number }
type MixRow = { label: string; value: number }

function ChartShell({
  option,
  height = 260,
  empty,
}: {
  option: Record<string, unknown> | null
  height?: number
  empty?: boolean
}) {
  if (empty || !option) return <p className="py-10 text-center text-sm text-ink/40">Sin datos en este periodo.</p>
  return (
    <ReactEChartsCore echarts={echarts} option={option} style={{ height, width: '100%' }} notMerge lazyUpdate />
  )
}

export function HourMoneyChart({ items, height = 280 }: { items: MoneyRow[]; height?: number }) {
  const dark = useDark()
  const c = useMemo(() => palette(dark), [dark])
  const option = useMemo(() => {
    if (!items.length) return null
    const max = Math.max(...items.map((i) => i.total), 0)
    const text = { color: c.text, fontSize: 11 }
    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: c.tipBg,
        borderColor: c.tipBorder,
        borderWidth: 1,
        textStyle: { color: c.tipText, fontSize: 12 },
        extraCssText: 'border-radius:10px;box-shadow:0 12px 28px rgba(0,0,0,0.35);',
        formatter: (params: Array<{ name?: string; value?: number }>) => {
          const p = Array.isArray(params) ? params[0] : params
          const row = items.find((i) => i.label.startsWith(String(p?.name || ''))) || items.find((i) => i.label === p?.name)
          const tickets = row?.count ?? 0
          return `<b>${p?.name}:00</b><br/>${soles(Number(p?.value || 0))}<br/>${tickets} tickets`
        },
      },
      grid: { top: 18, right: 12, bottom: 28, left: 48 },
      xAxis: {
        type: 'category',
        data: items.map((i) => i.label.slice(0, 2)),
        axisLabel: text,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: c.axis } },
      },
      yAxis: {
        type: 'value',
        axisLabel: { ...text, formatter: axisMoney },
        splitLine: { lineStyle: { color: c.grid, type: 'dashed' } },
        axisLine: { show: false },
      },
      series: [
        {
          type: 'bar',
          data: items.map((i) => ({
            value: i.total,
            itemStyle: { color: i.total === max && max > 0 ? c.gold : c.ember, borderRadius: [5, 5, 0, 0] },
          })),
          barMaxWidth: 26,
        },
      ],
    }
  }, [items, c])
  return <ChartShell option={option} height={height} empty={!items.some((i) => i.total > 0)} />
}

export function ComposedDayChart({ items, height = 280 }: { items: MoneyRow[]; height?: number }) {
  const dark = useDark()
  const c = useMemo(() => palette(dark), [dark])
  const option = useMemo(() => {
    if (!items.length) return null
    const text = { color: c.text, fontSize: 11 }
    const tip = {
      backgroundColor: c.tipBg,
      borderColor: c.tipBorder,
      borderWidth: 1,
      textStyle: { color: c.tipText, fontSize: 12 },
      extraCssText: 'border-radius:10px;box-shadow:0 12px 28px rgba(0,0,0,0.35);',
    }
    return {
      tooltip: {
        ...tip,
        trigger: 'axis',
        formatter: (params: Array<{ seriesName?: string; value?: number; color?: string; axisValue?: string }>) => {
          if (!Array.isArray(params) || !params.length) return ''
          let html = `<b>${params[0].axisValue ?? ''}</b>`
          for (const p of params) {
            const money = p.seriesName === 'Ventas'
            const val = money ? soles(Number(p.value || 0)) : `${p.value ?? 0} tickets`
            html += `<br/><span style="color:${p.color || '#cbd5e1'}">${p.seriesName}</span>: <b>${val}</b>`
          }
          return html
        },
      },
      legend: { bottom: 0, textStyle: text, itemWidth: 10, itemHeight: 10 },
      grid: { top: 16, right: 52, bottom: 36, left: 44 },
      xAxis: {
        type: 'category',
        data: items.map((i) => i.label),
        axisLabel: text,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: c.axis } },
      },
      yAxis: [
        {
          type: 'value',
          axisLabel: text,
          splitLine: { lineStyle: { color: c.grid, type: 'dashed' } },
          axisLine: { show: false },
        },
        {
          type: 'value',
          axisLabel: { ...text, formatter: axisMoney },
          splitLine: { show: false },
          axisLine: { show: false },
        },
      ],
      series: [
        {
          name: 'Tickets',
          type: 'bar',
          yAxisIndex: 0,
          data: items.map((i) => i.count ?? 0),
          barMaxWidth: 26,
          itemStyle: { color: c.amber, borderRadius: [4, 4, 0, 0] },
        },
        {
          name: 'Ventas',
          type: 'line',
          yAxisIndex: 1,
          data: items.map((i) => i.total),
          smooth: true,
          lineStyle: { width: 2.4, color: c.ember },
          itemStyle: { color: c.ember },
          symbol: 'circle',
          symbolSize: 6,
        },
      ],
    }
  }, [items, c])
  return <ChartShell option={option} height={height} empty={!items.some((i) => i.total > 0 || (i.count ?? 0) > 0)} />
}

export function HorizontalMoneyChart({ items, height = 280 }: { items: MoneyRow[]; height?: number }) {
  const dark = useDark()
  const c = useMemo(() => palette(dark), [dark])
  const rows = useMemo(() => items.slice(0, 12).reverse(), [items])
  const option = useMemo(() => {
    if (!rows.length) return null
    const text = { color: c.text, fontSize: 11 }
    const max = Math.max(...rows.map((i) => i.total), 0)
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: c.tipBg,
        borderColor: c.tipBorder,
        borderWidth: 1,
        textStyle: { color: c.tipText, fontSize: 12 },
        extraCssText: 'border-radius:10px;box-shadow:0 12px 28px rgba(0,0,0,0.35);',
        formatter: (params: Array<{ name?: string; value?: number }>) => {
          const p = Array.isArray(params) ? params[0] : params
          const row = rows.find((i) => i.label === p?.name)
          return `<b>${p?.name}</b><br/>${soles(Number(p?.value || 0))}${row?.count != null ? `<br/>${row.count}` : ''}`
        },
      },
      grid: { top: 8, right: 24, bottom: 8, left: 8, containLabel: true },
      xAxis: {
        type: 'value',
        axisLabel: { ...text, formatter: axisMoney },
        splitLine: { lineStyle: { color: c.grid, type: 'dashed' } },
        axisLine: { show: false },
      },
      yAxis: {
        type: 'category',
        data: rows.map((i) => i.label),
        axisLabel: { ...text, width: 110, overflow: 'truncate' },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [
        {
          type: 'bar',
          data: rows.map((i) => ({
            value: i.total,
            itemStyle: { color: i.total === max && max > 0 ? c.gold : c.ember, borderRadius: [0, 6, 6, 0] },
          })),
          barMaxWidth: 16,
        },
      ],
    }
  }, [rows, c])
  return (
    <ChartShell
      option={option}
      height={Math.max(height, 40 + rows.length * 28)}
      empty={!rows.some((i) => i.total > 0)}
    />
  )
}

export function DonutChart({ items, height = 260 }: { items: MixRow[]; height?: number }) {
  const dark = useDark()
  const c = useMemo(() => palette(dark), [dark])
  const data = useMemo(() => items.filter((i) => i.value > 0), [items])
  const option = useMemo(() => {
    if (!data.length) return null
    const text = { color: c.text, fontSize: 11 }
    return {
      tooltip: {
        trigger: 'item',
        backgroundColor: c.tipBg,
        borderColor: c.tipBorder,
        borderWidth: 1,
        textStyle: { color: c.tipText, fontSize: 12 },
        extraCssText: 'border-radius:10px;box-shadow:0 12px 28px rgba(0,0,0,0.35);',
        formatter: (p: { name?: string; value?: number; percent?: number }) =>
          `<b>${p.name}</b><br/>${soles(Number(p.value || 0))} (${(p.percent ?? 0).toFixed(1)}%)`,
      },
      legend: { bottom: 0, textStyle: text, itemWidth: 10, itemHeight: 10 },
      series: [
        {
          type: 'pie',
          radius: ['42%', '64%'],
          center: ['50%', '44%'],
          padAngle: 2,
          itemStyle: { borderRadius: 4 },
          label: { show: false },
          data: data.map((d, i) => ({
            name: d.label,
            value: d.value,
            itemStyle: { color: PIE_COLORS[i % PIE_COLORS.length] },
          })),
        },
      ],
    }
  }, [data, c])
  return <ChartShell option={option} height={height} empty={!data.length} />
}

export function VerticalMoneyChart({ items, height = 260 }: { items: MixRow[]; height?: number }) {
  const dark = useDark()
  const c = useMemo(() => palette(dark), [dark])
  const option = useMemo(() => {
    if (!items.length) return null
    const text = { color: c.text, fontSize: 11 }
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: c.tipBg,
        borderColor: c.tipBorder,
        borderWidth: 1,
        textStyle: { color: c.tipText, fontSize: 12 },
        extraCssText: 'border-radius:10px;box-shadow:0 12px 28px rgba(0,0,0,0.35);',
        formatter: (params: Array<{ name?: string; value?: number }>) => {
          const p = Array.isArray(params) ? params[0] : params
          return `<b>${p?.name}</b><br/>${soles(Number(p?.value || 0))}`
        },
      },
      grid: { top: 16, right: 12, bottom: 28, left: 48 },
      xAxis: {
        type: 'category',
        data: items.map((i) => i.label),
        axisLabel: text,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: c.axis } },
      },
      yAxis: {
        type: 'value',
        axisLabel: { ...text, formatter: axisMoney },
        splitLine: { lineStyle: { color: c.grid, type: 'dashed' } },
        axisLine: { show: false },
      },
      series: [
        {
          type: 'bar',
          data: items.map((i) => i.value),
          barMaxWidth: 36,
          itemStyle: { color: c.ember, borderRadius: [5, 5, 0, 0] },
        },
      ],
    }
  }, [items, c])
  return <ChartShell option={option} height={height} empty={!items.some((i) => i.value > 0)} />
}
