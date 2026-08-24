import { useMemo, useState } from 'react'
import {
  Calendar,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Phone,
  Search,
  TrendingUp,
  UserCheck,
  Users,
  X,
} from 'lucide-react'
import { useStore } from '../store/StoreContext'
import type { Reservation, ReservationStatus } from '../types'
import { PageTitle } from '../components/ui'

const STATUS_CONFIG: Record<ReservationStatus, { label: string; color: string; bg: string }> = {
  pendiente: { label: 'Pendiente', color: 'text-amber-700', bg: 'bg-amber-100' },
  confirmada: { label: 'Confirmada', color: 'text-blue-700', bg: 'bg-blue-100' },
  completada: { label: 'Completada', color: 'text-green-700', bg: 'bg-green-100' },
  cancelada: { label: 'Cancelada', color: 'text-red-700', bg: 'bg-red-100' },
}

type FilterTab = 'hoy' | 'proximas' | 'pasadas' | 'todas'

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-PE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export function Reservas() {
  const { state, updateReservationStatus } = useStore()
  const [tab, setTab] = useState<FilterTab>('hoy')
  const [search, setSearch] = useState('')
  const [calMonth, setCalMonth] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })

  const today = new Date().toISOString().split('T')[0]
  const reservations = state.reservations || []

  const filtered = useMemo(() => {
    let list = reservations

    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        (r) =>
          r.customerName.toLowerCase().includes(q) ||
          r.customerPhone.includes(q),
      )
    }

    switch (tab) {
      case 'hoy':
        list = list.filter((r) => r.date === today && r.status !== 'cancelada')
        break
      case 'proximas':
        list = list.filter((r) => r.date >= today && (r.status === 'pendiente' || r.status === 'confirmada'))
        break
      case 'pasadas':
        list = list.filter((r) => r.date < today || r.status === 'completada' || r.status === 'cancelada')
        break
    }

    return list.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date)
      return a.time.localeCompare(b.time)
    })
  }, [reservations, tab, search, today])

  // ─── Stats ────────────────────────────────────────────────────
  const todayCount = reservations.filter((r) => r.date === today && r.status !== 'cancelada').length
  const todayGuests = reservations
    .filter((r) => r.date === today && r.status !== 'cancelada')
    .reduce((s, r) => s + r.guests, 0)
  const upcomingCount = reservations.filter(
    (r) => r.date >= today && (r.status === 'pendiente' || r.status === 'confirmada'),
  ).length
  const pendingCount = reservations.filter((r) => r.date >= today && r.status === 'pendiente').length
  const confirmedCount = reservations.filter(
    (r) => r.date >= today && r.status === 'confirmada',
  ).length

  // ─── Bar chart: reservas por día (próximos 7 días) ─────────────
  const barData = useMemo(() => {
    const days: { label: string; date: string; count: number; guests: number }[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(Date.now() + i * 86400000)
      const dateStr = d.toISOString().split('T')[0]
      const dayReservations = reservations.filter(
        (r) => r.date === dateStr && r.status !== 'cancelada',
      )
      days.push({
        label: i === 0 ? 'HOY' : d.toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric' }),
        date: dateStr,
        count: dayReservations.length,
        guests: dayReservations.reduce((s, r) => s + r.guests, 0),
      })
    }
    return days
  }, [reservations])

  const maxBar = Math.max(1, ...barData.map((d) => d.guests))

  // ─── Hourly distribution (for today) ──────────────────────────
  const hourlyData = useMemo(() => {
    const hours: { hour: string; count: number }[] = []
    const slots = ['11', '12', '13', '14', '15', '18', '19', '20', '21', '22']
    for (const h of slots) {
      const count = reservations.filter(
        (r) => r.date === today && r.time.startsWith(h) && r.status !== 'cancelada',
      ).length
      hours.push({ hour: `${h}:00`, count })
    }
    return hours
  }, [reservations, today])

  const maxHourly = Math.max(1, ...hourlyData.map((h) => h.count))

  // ─── Calendar ─────────────────────────────────────────────────
  const calendarDays = useMemo(() => {
    const { year, month } = calMonth
    const first = new Date(year, month, 1)
    const last = new Date(year, month + 1, 0)
    const startDay = first.getDay()
    const days: { date: string; day: number; inMonth: boolean; count: number }[] = []

    for (let i = 0; i < startDay; i++) {
      const d = new Date(year, month, -startDay + i + 1)
      days.push({ date: d.toISOString().split('T')[0], day: d.getDate(), inMonth: false, count: 0 })
    }
    for (let d = 1; d <= last.getDate(); d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const count = reservations.filter((r) => r.date === dateStr && r.status !== 'cancelada').length
      days.push({ date: dateStr, day: d, inMonth: true, count })
    }
    const remaining = 42 - days.length
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i)
      days.push({ date: d.toISOString().split('T')[0], day: d.getDate(), inMonth: false, count: 0 })
    }
    return days
  }, [calMonth, reservations])

  const calMonthLabel = new Date(calMonth.year, calMonth.month).toLocaleDateString('es-PE', {
    month: 'long',
    year: 'numeric',
  })

  const prevMonth = () =>
    setCalMonth((p) => (p.month === 0 ? { year: p.year - 1, month: 11 } : { ...p, month: p.month - 1 }))
  const nextMonth = () =>
    setCalMonth((p) => (p.month === 11 ? { year: p.year + 1, month: 0 } : { ...p, month: p.month + 1 }))

  const tabs: { id: FilterTab; label: string; count?: number }[] = [
    { id: 'hoy', label: 'Hoy', count: todayCount },
    { id: 'proximas', label: 'Próximas', count: upcomingCount },
    { id: 'pasadas', label: 'Pasadas' },
    { id: 'todas', label: 'Todas' },
  ]

  return (
    <div>
      <PageTitle
        title="Reservas"
        hint={`${todayCount} hoy (${todayGuests} personas) · ${upcomingCount} próximas`}
      />

      {/* ─── KPIs ───────────────────────────────────────────────── */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100">
            <CalendarDays size={20} className="text-amber-600" />
          </div>
          <div>
            <p className="text-2xl font-display">{todayCount}</p>
            <p className="text-xs text-ink/50">Hoy</p>
          </div>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
            <Users size={20} className="text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-display">{todayGuests}</p>
            <p className="text-xs text-ink/50">Personas hoy</p>
          </div>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100">
            <Clock size={20} className="text-orange-600" />
          </div>
          <div>
            <p className="text-2xl font-display">{pendingCount}</p>
            <p className="text-xs text-ink/50">Por confirmar</p>
          </div>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100">
            <UserCheck size={20} className="text-green-600" />
          </div>
          <div>
            <p className="text-2xl font-display">{confirmedCount}</p>
            <p className="text-xs text-ink/50">Confirmadas</p>
          </div>
        </div>
      </div>

      {/* ─── Charts Row ─────────────────────────────────────────── */}
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {/* Bar chart: Próximos 7 días */}
        <div className="card p-5">
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp size={16} className="text-ember" />
            <h3 className="text-sm font-semibold">Reservas · Próximos 7 días</h3>
          </div>
          <div className="flex items-end gap-2" style={{ height: 140 }}>
            {barData.map((d) => (
              <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] font-bold text-ink/60">{d.guests > 0 ? d.guests : ''}</span>
                <div className="relative w-full rounded-t-lg bg-cream" style={{ height: 100 }}>
                  <div
                    className="absolute inset-x-0 bottom-0 rounded-t-lg bg-ember transition-all duration-300"
                    style={{ height: `${(d.guests / maxBar) * 100}%` }}
                  />
                </div>
                <span className={`text-[10px] font-bold ${d.date === today ? 'text-ember' : 'text-ink/50'}`}>
                  {d.label}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-center text-[10px] text-ink/40">Personas esperadas por día</p>
        </div>

        {/* Hourly distribution */}
        <div className="card p-5">
          <div className="mb-4 flex items-center gap-2">
            <Clock size={16} className="text-ember" />
            <h3 className="text-sm font-semibold">Distribución horaria · Hoy</h3>
          </div>
          <div className="flex items-end gap-1.5" style={{ height: 140 }}>
            {hourlyData.map((h) => (
              <div key={h.hour} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] font-bold text-ink/60">{h.count > 0 ? h.count : ''}</span>
                <div className="relative w-full rounded-t-md bg-cream" style={{ height: 100 }}>
                  <div
                    className="absolute inset-x-0 bottom-0 rounded-t-md bg-blue-500 transition-all duration-300"
                    style={{ height: `${(h.count / maxHourly) * 100}%` }}
                  />
                </div>
                <span className="text-[9px] text-ink/40">{h.hour.split(':')[0]}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-center text-[10px] text-ink/40">Reservas por hora (hoy)</p>
        </div>
      </div>

      {/* ─── Calendar + List ────────────────────────────────────── */}
      <div className="mt-5 grid gap-4 lg:grid-cols-[300px_1fr]">
        {/* Mini Calendar */}
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <button onClick={prevMonth} className="tap rounded-lg p-1 hover:bg-cream">
              <ChevronLeft size={18} />
            </button>
            <h3 className="text-sm font-semibold capitalize">{calMonthLabel}</h3>
            <button onClick={nextMonth} className="tap rounded-lg p-1 hover:bg-cream">
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-7 gap-0.5 text-center text-[10px] font-bold text-ink/40">
            {['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-0.5">
            {calendarDays.map((d, i) => {
              const isToday = d.date === today
              const hasReservation = d.count > 0
              return (
                <div
                  key={i}
                  className={`relative flex h-9 items-center justify-center rounded-lg text-xs transition ${
                    !d.inMonth
                      ? 'text-ink/20'
                      : isToday
                      ? 'bg-ember font-bold text-white'
                      : hasReservation
                      ? 'bg-blue-50 font-semibold text-blue-700'
                      : 'text-ink/70 hover:bg-cream'
                  }`}
                >
                  {d.day}
                  {hasReservation && !isToday && (
                    <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-blue-500" />
                  )}
                  {hasReservation && isToday && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white text-[8px] font-bold text-ember shadow">
                      {d.count}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          <div className="mt-3 flex items-center gap-3 text-[10px] text-ink/50">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-ember" /> Hoy
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-blue-500" /> Con reservas
            </span>
          </div>
        </div>

        {/* Reservation List */}
        <div>
          {/* Tabs + Search */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-2 overflow-x-auto">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                    tab === t.id
                      ? 'bg-ink text-cream'
                      : 'bg-white text-ink/60 hover:bg-ink/5'
                  }`}
                >
                  {t.label}
                  {t.count !== undefined && t.count > 0 && (
                    <span className={`rounded-full px-1.5 text-[10px] ${tab === t.id ? 'bg-ember text-white' : 'bg-ink/10'}`}>
                      {t.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
              <input
                className="w-full rounded-xl border border-ink/10 bg-white py-2 pl-8 pr-3 text-sm sm:w-48"
                placeholder="Buscar cliente..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Cards */}
          {filtered.length === 0 ? (
            <div className="mt-6 flex flex-col items-center gap-3 rounded-3xl border border-dashed border-ink/15 py-14 text-center">
              <Calendar size={36} className="text-ink/20" />
              <p className="text-sm text-ink/40">
                {tab === 'hoy'
                  ? 'No hay reservas para hoy'
                  : tab === 'proximas'
                  ? 'No hay reservas próximas'
                  : 'No se encontraron reservas'}
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {filtered.map((res) => (
                <ReservationCard
                  key={res.id}
                  reservation={res}
                  isToday={res.date === today}
                  onChangeStatus={(status) => updateReservationStatus(res.id, status)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ReservationCard({
  reservation: r,
  isToday,
  onChangeStatus,
}: {
  reservation: Reservation
  isToday: boolean
  onChangeStatus: (status: ReservationStatus) => void
}) {
  const cfg = STATUS_CONFIG[r.status]

  return (
    <article className={`card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between ${isToday ? 'ring-2 ring-ember/30' : ''}`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${isToday ? 'bg-ember/10' : 'bg-cream'}`}>
          <Users size={20} className={isToday ? 'text-ember' : 'text-ink/40'} />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{r.customerName}</p>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${cfg.bg} ${cfg.color}`}>
              {cfg.label}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-ink/55">
            <span className="inline-flex items-center gap-1">
              <Calendar size={12} className="text-ember" />
              {isToday ? 'HOY' : formatDate(r.date)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock size={12} /> {r.time}
            </span>
            <span className="inline-flex items-center gap-1">
              <Users size={12} /> {r.guests} pers.
            </span>
            <span className="inline-flex items-center gap-1">
              <Phone size={12} /> {r.customerPhone}
            </span>
          </div>
          {r.notes && (
            <p className="mt-1.5 text-xs text-ink/50 italic">📝 {r.notes}</p>
          )}
        </div>
      </div>

      {/* Actions */}
      {(r.status === 'pendiente' || r.status === 'confirmada') && (
        <div className="flex shrink-0 gap-2 sm:ml-3">
          {r.status === 'pendiente' && (
            <button
              onClick={() => onChangeStatus('confirmada')}
              className="flex min-h-9 items-center gap-1 rounded-xl bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700"
            >
              <Check size={13} /> Confirmar
            </button>
          )}
          {r.status === 'confirmada' && (
            <button
              onClick={() => onChangeStatus('completada')}
              className="flex min-h-9 items-center gap-1 rounded-xl bg-green-600 px-3 text-xs font-semibold text-white hover:bg-green-700"
            >
              <Check size={13} /> Completar
            </button>
          )}
          <button
            onClick={() => onChangeStatus('cancelada')}
            className="flex min-h-9 items-center gap-1 rounded-xl bg-red-50 px-3 text-xs font-semibold text-red-600 hover:bg-red-100"
          >
            <X size={13} />
          </button>
        </div>
      )}
    </article>
  )
}
