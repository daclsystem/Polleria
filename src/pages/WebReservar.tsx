import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Calendar, Check, Clock, Users } from 'lucide-react'
import { useStore } from '../store/StoreContext'

const TIME_SLOTS = [
  '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '15:00', '18:00', '18:30', '19:00',
  '19:30', '20:00', '20:30', '21:00', '21:30', '22:00', '22:30',
]

const GUEST_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20]

export function WebReservar() {
  const { state, createReservation } = useStore()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [guests, setGuests] = useState(0)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('937493214')
  const [notes, setNotes] = useState('')
  const [success, setSuccess] = useState(false)

  useState(() => {
    try {
      const raw = localStorage.getItem('chifa-lopez-customer')
      if (raw) {
        const cust = JSON.parse(raw)
        if (cust?.name) setName(cust.name)
        if (cust?.phone) setPhone(cust.phone)
      }
    } catch {}
  })

  const today = new Date()
  const minDate = today.toISOString().split('T')[0]
  const maxDate = new Date(today.getTime() + 30 * 86400000).toISOString().split('T')[0]

  const selectedDate = date ? new Date(date + 'T12:00:00') : null
  const dayName = selectedDate
    ? selectedDate.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' })
    : ''

  const tablesAvailable = state.tables.filter((t) => t.status === 'libre')
  const totalSeats = tablesAvailable.reduce((s, t) => s + t.seats, 0)

  const handleSubmit = async () => {
    if (!name.trim() || !phone.trim()) return
    let customerId: string | undefined
    try {
      const raw = localStorage.getItem('polleria-customer-session') || localStorage.getItem('chifa-lopez-customer')
      if (raw) customerId = JSON.parse(raw)?.id
    } catch {}
    await createReservation({
      customerName: name.trim(),
      customerPhone: phone.trim(),
      customerId,
      date,
      time,
      guests,
      notes: notes.trim() || undefined,
    })
    setSuccess(true)
  }

  if (success) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-green-50 to-white p-6">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-green-100">
            <Check size={48} className="text-green-600" />
          </div>
          <h1 className="text-3xl font-black text-gray-900">¡Reserva Confirmada!</h1>
          <p className="mt-4 text-lg text-gray-600">
            Te esperamos el <strong>{dayName}</strong> a las <strong>{time}</strong>
          </p>
          <p className="mt-1 text-gray-500">Mesa para <strong>{guests} personas</strong></p>
          <p className="mt-4 text-sm text-gray-400">Te contactaremos al <strong>{phone}</strong> para confirmar.</p>
          <div className="mt-8 flex flex-col gap-3">
            <button
              onClick={() => navigate('/web')}
              className="rounded-2xl bg-[#ffd700] py-4 text-lg font-black text-[#1a3d1a] shadow-lg transition hover:bg-yellow-400"
            >
              Volver a la Tienda
            </button>
            <button
              onClick={() => { setSuccess(false); setStep(0); setDate(''); setTime(''); setGuests(0) }}
              className="rounded-2xl bg-gray-100 py-4 font-semibold text-gray-700 hover:bg-gray-200"
            >
              Hacer otra Reserva
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-green-50 via-white to-yellow-50">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#1a3d1a] shadow-xl">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-4 px-4">
          <button onClick={() => navigate('/web')} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-lg font-black text-[#ffd700]">Reservar Mesa</h1>
            <p className="text-xs text-green-300">Chifa-Pollería Lopez</p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-lg px-4 py-8">
        {/* Steps indicator */}
        <div className="mb-8 flex items-center gap-1">
          {['Fecha', 'Hora', 'Personas', 'Datos'].map((label, i) => (
            <div key={label} className="flex flex-1 flex-col items-center gap-1.5">
              <div className={`h-2 w-full rounded-full transition ${i <= step ? 'bg-[#1a3d1a]' : 'bg-gray-200'}`} />
              <span className={`text-xs font-bold ${i <= step ? 'text-[#1a3d1a]' : 'text-gray-400'}`}>{label}</span>
            </div>
          ))}
        </div>

        {/* Step 0: Fecha */}
        {step === 0 && (
          <div className="space-y-5">
            <div className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-100">
                <Calendar size={28} className="text-green-700" />
              </div>
              <div>
                <p className="text-lg font-black text-gray-900">¿Cuándo nos visitas?</p>
                <p className="text-sm text-gray-500">Selecciona la fecha de tu reserva</p>
              </div>
            </div>
            <input
              type="date"
              min={minDate}
              max={maxDate}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-2xl border border-gray-200 bg-white px-5 py-5 text-lg font-bold text-gray-900 shadow-sm focus:border-green-500 focus:ring-2 focus:ring-green-500/20 focus:outline-none"
            />
            {date && (
              <div className="rounded-2xl bg-green-50 p-4 text-center">
                <p className="text-lg font-bold text-green-800">📅 {dayName}</p>
              </div>
            )}
            <button
              onClick={() => setStep(1)}
              disabled={!date}
              className="w-full rounded-2xl bg-[#1a3d1a] py-4 text-lg font-bold text-white shadow-lg transition hover:bg-green-800 disabled:opacity-40"
            >
              Siguiente →
            </button>
          </div>
        )}

        {/* Step 1: Hora */}
        {step === 1 && (
          <div className="space-y-5">
            <div className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-100">
                <Clock size={28} className="text-green-700" />
              </div>
              <div>
                <p className="text-lg font-black text-gray-900">¿A qué hora llegas?</p>
                <p className="text-sm text-gray-500">{dayName}</p>
              </div>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
              <p className="mb-3 text-xs font-bold uppercase text-gray-500">Almuerzo</p>
              <div className="grid grid-cols-4 gap-2">
                {TIME_SLOTS.filter((s) => parseInt(s) < 16).map((slot) => (
                  <button
                    key={slot}
                    onClick={() => setTime(slot)}
                    className={`rounded-xl py-3 text-sm font-bold transition ${
                      time === slot
                        ? 'bg-[#1a3d1a] text-[#ffd700] shadow-lg'
                        : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {slot}
                  </button>
                ))}
              </div>
              <p className="mb-3 mt-5 text-xs font-bold uppercase text-gray-500">Cena</p>
              <div className="grid grid-cols-4 gap-2">
                {TIME_SLOTS.filter((s) => parseInt(s) >= 16).map((slot) => (
                  <button
                    key={slot}
                    onClick={() => setTime(slot)}
                    className={`rounded-xl py-3 text-sm font-bold transition ${
                      time === slot
                        ? 'bg-[#1a3d1a] text-[#ffd700] shadow-lg'
                        : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(0)} className="flex-1 rounded-2xl bg-gray-100 py-4 font-bold text-gray-600 hover:bg-gray-200">
                ← Atrás
              </button>
              <button
                onClick={() => setStep(2)}
                disabled={!time}
                className="flex-1 rounded-2xl bg-[#1a3d1a] py-4 font-bold text-white shadow-lg transition hover:bg-green-800 disabled:opacity-40"
              >
                Siguiente →
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Personas */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-100">
                <Users size={28} className="text-green-700" />
              </div>
              <div>
                <p className="text-lg font-black text-gray-900">¿Cuántos serán?</p>
                <p className="text-sm text-gray-500">Capacidad disponible: {totalSeats} asientos</p>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {GUEST_OPTIONS.map((n) => (
                <button
                  key={n}
                  onClick={() => setGuests(n)}
                  disabled={n > totalSeats}
                  className={`rounded-2xl py-5 text-xl font-black transition ${
                    guests === n
                      ? 'bg-[#1a3d1a] text-[#ffd700] shadow-lg ring-4 ring-green-200'
                      : n > totalSeats
                      ? 'bg-gray-50 text-gray-300'
                      : 'bg-white text-gray-700 shadow-sm ring-1 ring-gray-100 hover:ring-green-300'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            {guests > 0 && (
              <div className="rounded-2xl bg-green-50 p-4 text-center">
                <p className="text-lg font-bold text-green-800">👥 Mesa para {guests} {guests === 1 ? 'persona' : 'personas'}</p>
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="flex-1 rounded-2xl bg-gray-100 py-4 font-bold text-gray-600 hover:bg-gray-200">
                ← Atrás
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!guests}
                className="flex-1 rounded-2xl bg-[#1a3d1a] py-4 font-bold text-white shadow-lg transition hover:bg-green-800 disabled:opacity-40"
              >
                Siguiente →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Datos */}
        {step === 3 && (
          <div className="space-y-5">
            {/* Resumen */}
            <div className="rounded-2xl bg-[#1a3d1a] p-5 text-white">
              <p className="text-sm font-bold text-[#ffd700]">Tu reserva:</p>
              <div className="mt-2 flex flex-wrap gap-4 text-sm">
                <span className="flex items-center gap-1.5"><Calendar size={14} className="text-[#ffd700]" /> {dayName}</span>
                <span className="flex items-center gap-1.5"><Clock size={14} className="text-[#ffd700]" /> {time}</span>
                <span className="flex items-center gap-1.5"><Users size={14} className="text-[#ffd700]" /> {guests} personas</span>
              </div>
            </div>

            <div className="space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
              <div>
                <label className="text-sm font-bold text-gray-700">Tu nombre *</label>
                <input
                  className="mt-1.5 w-full rounded-xl border border-gray-200 px-4 py-3.5 text-sm focus:border-green-500 focus:ring-2 focus:ring-green-500/20 focus:outline-none"
                  placeholder="Nombre completo"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="text-sm font-bold text-gray-700">Celular *</label>
                <input
                  className="mt-1.5 w-full rounded-xl border border-gray-200 px-4 py-3.5 text-sm focus:border-green-500 focus:ring-2 focus:ring-green-500/20 focus:outline-none"
                  placeholder="999 999 999"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="text-sm font-bold text-gray-700">Notas especiales (opcional)</label>
                <input
                  className="mt-1.5 w-full rounded-xl border border-gray-200 px-4 py-3.5 text-sm focus:border-green-500 focus:ring-2 focus:ring-green-500/20 focus:outline-none"
                  placeholder="Cumpleaños, silla para bebé, zona terraza..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="flex-1 rounded-2xl bg-gray-100 py-4 font-bold text-gray-600 hover:bg-gray-200">
                ← Atrás
              </button>
              <button
                onClick={handleSubmit}
                disabled={!name.trim() || !phone.trim()}
                className="flex-1 rounded-2xl bg-[#ffd700] py-4 font-black text-[#1a3d1a] shadow-lg transition hover:bg-yellow-400 disabled:opacity-40"
              >
                Confirmar Reserva ✓
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
