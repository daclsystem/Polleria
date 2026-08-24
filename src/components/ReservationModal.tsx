import { useState } from 'react'
import { Calendar, Clock, Users, X, Check } from 'lucide-react'
import { useStore } from '../store/StoreContext'

const TIME_SLOTS = [
  '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '15:00', '18:00', '18:30', '19:00',
  '19:30', '20:00', '20:30', '21:00', '21:30', '22:00', '22:30',
]

const GUEST_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20]

export function ReservationModal({ onClose }: { onClose: () => void }) {
  const { state, createReservation } = useStore()
  const [step, setStep] = useState(0)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [guests, setGuests] = useState(0)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('937493214')
  const [notes, setNotes] = useState('')
  const [success, setSuccess] = useState(false)

  // Pre-fill from customer session
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
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <button className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-2xl">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
            <Check size={40} className="text-green-600" />
          </div>
          <h2 className="text-2xl font-black text-gray-900">¡Reserva Confirmada!</h2>
          <p className="mt-3 text-gray-600">
            Te esperamos el <strong>{dayName}</strong> a las <strong>{time}</strong> para <strong>{guests} personas</strong>.
          </p>
          <p className="mt-2 text-sm text-gray-500">Te contactaremos al <strong>{phone}</strong> para confirmar.</p>
          <button
            onClick={onClose}
            className="mt-6 w-full rounded-2xl bg-[#ffd700] py-4 text-lg font-black text-[#1a3d1a] shadow-lg transition hover:bg-yellow-400"
          >
            Listo
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4">
      <button className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white sm:rounded-3xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-4">
          <h2 className="text-xl font-black text-gray-900">Reservar Mesa</h2>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200">
            <X size={18} />
          </button>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center gap-1 px-5 pt-4">
          {['Fecha', 'Hora', 'Personas', 'Datos'].map((label, i) => (
            <div key={label} className="flex flex-1 flex-col items-center gap-1">
              <div className={`h-1.5 w-full rounded-full transition ${i <= step ? 'bg-[#1a3d1a]' : 'bg-gray-200'}`} />
              <span className={`text-[10px] font-bold ${i <= step ? 'text-[#1a3d1a]' : 'text-gray-400'}`}>{label}</span>
            </div>
          ))}
        </div>

        <div className="p-5">
          {/* Step 0: Fecha */}
          {step === 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-2xl bg-green-50 p-4">
                <Calendar size={24} className="text-green-700" />
                <div>
                  <p className="font-bold text-gray-900">¿Cuándo nos visitas?</p>
                  <p className="text-sm text-gray-500">Elige el día de tu reserva</p>
                </div>
              </div>
              <input
                type="date"
                min={minDate}
                max={maxDate}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-2xl border border-gray-200 px-5 py-4 text-lg font-bold text-gray-900 focus:border-green-500 focus:ring-2 focus:ring-green-500/20 focus:outline-none"
              />
              {date && (
                <p className="text-center text-sm font-medium text-green-700">
                  📅 {dayName}
                </p>
              )}
              <button
                onClick={() => setStep(1)}
                disabled={!date}
                className="w-full rounded-2xl bg-[#1a3d1a] py-4 text-lg font-bold text-white shadow-lg transition hover:bg-green-800 disabled:opacity-40"
              >
                Continuar
              </button>
            </div>
          )}

          {/* Step 1: Hora */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-2xl bg-green-50 p-4">
                <Clock size={24} className="text-green-700" />
                <div>
                  <p className="font-bold text-gray-900">¿A qué hora llegas?</p>
                  <p className="text-sm text-gray-500">{dayName}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {TIME_SLOTS.map((slot) => (
                  <button
                    key={slot}
                    onClick={() => setTime(slot)}
                    className={`rounded-xl py-3 text-sm font-bold transition ${
                      time === slot
                        ? 'bg-[#1a3d1a] text-[#ffd700] shadow-lg'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {slot}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep(0)} className="flex-1 rounded-2xl bg-gray-100 py-4 font-bold text-gray-600 hover:bg-gray-200">
                  Atrás
                </button>
                <button
                  onClick={() => setStep(2)}
                  disabled={!time}
                  className="flex-1 rounded-2xl bg-[#1a3d1a] py-4 font-bold text-white shadow-lg transition hover:bg-green-800 disabled:opacity-40"
                >
                  Continuar
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Personas */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-2xl bg-green-50 p-4">
                <Users size={24} className="text-green-700" />
                <div>
                  <p className="font-bold text-gray-900">¿Cuántas personas?</p>
                  <p className="text-sm text-gray-500">Disponibilidad: hasta {totalSeats} asientos</p>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {GUEST_OPTIONS.map((n) => (
                  <button
                    key={n}
                    onClick={() => setGuests(n)}
                    disabled={n > totalSeats}
                    className={`rounded-xl py-4 text-lg font-black transition ${
                      guests === n
                        ? 'bg-[#1a3d1a] text-[#ffd700] shadow-lg'
                        : n > totalSeats
                        ? 'bg-gray-50 text-gray-300'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              {guests > 0 && (
                <p className="text-center text-sm font-medium text-green-700">
                  👥 Mesa para {guests} {guests === 1 ? 'persona' : 'personas'}
                </p>
              )}
              <div className="flex gap-2">
                <button onClick={() => setStep(1)} className="flex-1 rounded-2xl bg-gray-100 py-4 font-bold text-gray-600 hover:bg-gray-200">
                  Atrás
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!guests}
                  className="flex-1 rounded-2xl bg-[#1a3d1a] py-4 font-bold text-white shadow-lg transition hover:bg-green-800 disabled:opacity-40"
                >
                  Continuar
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Datos */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-green-50 p-4">
                <p className="text-sm font-bold text-green-800">Resumen de tu reserva:</p>
                <div className="mt-2 flex flex-wrap gap-3 text-sm text-green-700">
                  <span className="flex items-center gap-1"><Calendar size={14} /> {dayName}</span>
                  <span className="flex items-center gap-1"><Clock size={14} /> {time}</span>
                  <span className="flex items-center gap-1"><Users size={14} /> {guests} personas</span>
                </div>
              </div>
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
                <label className="text-sm font-bold text-gray-700">Notas (opcional)</label>
                <input
                  className="mt-1.5 w-full rounded-xl border border-gray-200 px-4 py-3.5 text-sm focus:border-green-500 focus:ring-2 focus:ring-green-500/20 focus:outline-none"
                  placeholder="Cumpleaños, silla para bebé, zona terraza..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep(2)} className="flex-1 rounded-2xl bg-gray-100 py-4 font-bold text-gray-600 hover:bg-gray-200">
                  Atrás
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!name.trim() || !phone.trim()}
                  className="flex-1 rounded-2xl bg-[#ffd700] py-4 font-black text-[#1a3d1a] shadow-lg transition hover:bg-yellow-400 disabled:opacity-40"
                >
                  Confirmar Reserva
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
