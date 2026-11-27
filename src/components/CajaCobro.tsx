import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Printer, X } from 'lucide-react'
import { Field, inputClass } from './ui'
import { apiLookupDoc } from '../lib/apiClient'
import { orderBalance, reconcileOrderMoney, round2, soles } from '../lib/format'
import type { FiscalDocTipo, Order, PaySplit } from '../types'

type ExtraKind = 'yape' | 'tarjeta'

const EXTRA_METHODS: { id: ExtraKind; label: string }[] = [
  { id: 'yape', label: 'Yape' },
  { id: 'tarjeta', label: 'Tarjeta' },
]

export function CajaCobro({
  order,
  busy,
  onConfirm,
}: {
  order: Order
  busy?: boolean
  onConfirm: (payload: {
    payments: PaySplit[]
    billing: {
      docTipo: FiscalDocTipo
      docNumero?: string
      docNombre?: string
      docEmail?: string
      docPhone?: string
      docAddress?: string
    }
  }) => Promise<void>
}) {
  const money = useMemo(() => reconcileOrderMoney(order), [order])
  const total = orderBalance(order, money.total)
  const [efectivo, setEfectivo] = useState(total)
  const [extras, setExtras] = useState<{ kind: ExtraKind; amount: number; op: string }[]>([])
  const [docTipo, setDocTipo] = useState<FiscalDocTipo>(order.docTipo || (money.total > 700 ? 'boleta_dni' : 'boleta_simple'))
  const [docNumero, setDocNumero] = useState(order.docTipo === 'boleta_dni' || order.docTipo === 'factura' ? order.docNumero || '' : '')
  const [docNombre, setDocNombre] = useState((order.docTipo !== 'boleta_simple' ? order.docNombre : undefined) || order.customerName || '')
  const [docEmail, setDocEmail] = useState(order.docEmail || '')
  const [docPhone, setDocPhone] = useState(order.docPhone || order.customerPhone || '')
  const [docAddress, setDocAddress] = useState(order.docAddress || order.address || '')
  const [err, setErr] = useState('')
  const [lookupNote, setLookupNote] = useState('')
  const [pending, setPending] = useState<Parameters<typeof onConfirm>[0] | null>(null)
  const inFlight = useRef(false)
  const confirmButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setEfectivo(total)
    setExtras([])
    setPending(null)
  }, [order.id, total])

  useEffect(() => {
    if (pending) confirmButton.current?.focus()
  }, [pending])

  useEffect(() => {
    const digits = docNumero.replace(/\D/g, '')
    const kind = docTipo === 'factura' ? 'ruc' : docTipo === 'boleta_dni' ? 'dni' : ''
    const ready = (kind === 'dni' && digits.length === 8) || (kind === 'ruc' && digits.length === 11)
    if (!ready || (kind !== 'dni' && kind !== 'ruc')) {
      setLookupNote('')
      return
    }
    let cancel = false
    const timer = setTimeout(() => {
      setLookupNote('Consultando documento…')
      void apiLookupDoc(kind, digits)
        .then((data) => {
          if (cancel) return
          if (data.nombre) setDocNombre(data.nombre)
          if (data.direccion) setDocAddress(data.direccion)
          setLookupNote('')
        })
        .catch(() => {
          if (!cancel) setLookupNote('')
        })
    }, 400)
    return () => {
      cancel = true
      clearTimeout(timer)
    }
  }, [docNumero, docTipo])

  const extraSum = round2(extras.reduce((s, e) => s + e.amount, 0))
  const suma = round2(efectivo + extraSum)
  const falta = round2(total - suma)
  const used = extras.map((e) => e.kind)
  const available = EXTRA_METHODS.filter((m) => !used.includes(m.id))
  const isFactura = docTipo === 'factura'

  const setExtraAmount = (kind: ExtraKind, raw: string) => {
    const n = Math.max(0, round2(Number(raw) || 0))
    const next = extras.map((e) => (e.kind === kind ? { ...e, amount: n } : e))
    const other = round2(next.reduce((s, e) => s + e.amount, 0))
    setExtras(next)
    setEfectivo(Math.max(0, round2(total - other)))
  }

  const addExtra = (kind: ExtraKind) => {
    if (used.includes(kind)) return
    setExtras([...extras, { kind, amount: 0, op: '' }])
  }

  const removeExtra = (kind: ExtraKind) => {
    const next = extras.filter((e) => e.kind !== kind)
    const other = round2(next.reduce((s, e) => s + e.amount, 0))
    setExtras(next)
    setEfectivo(Math.max(0, round2(total - other)))
  }

  const genericBoleta = docTipo === 'boleta_simple'
  const requiereIdentificacion = genericBoleta && money.total > 700
  const needsDocData = docTipo === 'boleta_dni' || docTipo === 'factura'
  const needsRuc = isFactura
  const needsDni = docTipo === 'boleta_dni'
  const rucOk = !needsRuc || docNumero.replace(/\D/g, '').length === 11
  const dniOk = !needsDni || docNumero.replace(/\D/g, '').length === 8
  const mailOk = !needsDocData || /.+@.+\..+/.test(docEmail.trim())
  const phoneOk = !needsDocData || docPhone.replace(/\D/g, '').length >= 7
  const addrOk = !needsDocData || docAddress.trim().length >= 4
  const nameOk = !needsDocData || docNombre.trim().length >= 2
  const opOk = extras.every((e) => e.amount <= 0 || e.op.trim().length >= 4)

  const canPay = useMemo(() => {
    if (falta !== 0) return false
    if (suma <= 0) return false
    if (!opOk) return false
    if (requiereIdentificacion) return false
    if (needsDocData && !(nameOk && mailOk && phoneOk && addrOk && rucOk && dniOk)) return false
    return true
  }, [falta, suma, opOk, requiereIdentificacion, needsDocData, nameOk, mailOk, phoneOk, addrOk, rucOk, dniOk])

  const submit = () => {
    setErr('')
    if (!canPay) {
      if (falta !== 0) setErr(`La suma debe ser ${soles(total)}`)
      else if (!opOk) setErr('Yape o tarjeta necesitan el número de operación')
      else if (requiereIdentificacion) setErr('Selecciona Boleta con DNI o Factura para este importe.')
      else setErr('Completa los datos del documento')
      return
    }
    const payments: PaySplit[] = []
    if (efectivo > 0) payments.push({ method: 'efectivo', amount: efectivo, cashTendered: efectivo })
    for (const e of extras) {
      if (e.amount > 0) payments.push({ method: e.kind, amount: e.amount, reference: e.op.trim() })
    }
    const payload = {
      payments,
      billing: {
        docTipo,
        docNumero: genericBoleta ? '00000000' : needsDocData ? docNumero.trim() : undefined,
        docNombre: genericBoleta ? 'CLIENTES VARIOS' : needsDocData ? docNombre.trim() : undefined,
        docEmail: needsDocData ? docEmail.trim() : undefined,
        docPhone: needsDocData ? docPhone.trim() : undefined,
        docAddress: needsDocData ? docAddress.trim() : undefined,
      },
    }
    setPending(payload)
  }

  const runPay = async () => {
    if (!pending || inFlight.current) return
    inFlight.current = true
    try {
      await onConfirm(pending)
    } catch (e) {
      setErr((e as Error).message || 'No se pudo cobrar')
    } finally {
      inFlight.current = false
      setPending(null)
    }
  }

  return (
    <section aria-label="Cobro" className="min-w-0 rounded-2xl border border-ink/10 bg-cream">
      <div className="border-b border-ink/10 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3 className="text-sm font-bold">Saldo por cobrar</h3>
          <p className="text-2xl font-black tracking-tight text-ember tabular-nums">{soles(total)}</p>
        </div>
        {!!order.paidAmount && (
          <p className="mt-1 text-sm text-ink/70">Abonado {soles(order.paidAmount)} de {soles(money.total)}</p>
        )}
        {isFactura && (
          <p className="mt-1 text-xs text-ink/70">Base gravada {soles(money.subtotal)} · IGV {soles(money.igv)}</p>
        )}
      </div>

      <fieldset disabled={busy || !!pending} className="min-w-0 space-y-4 px-4 py-4 sm:px-5">
        <legend className="sr-only">Datos del cobro</legend>
        <div className="space-y-2">
          <label className="grid grid-cols-[1fr_minmax(0,9rem)] items-center gap-2">
            <span className="text-sm font-semibold">Efectivo</span>
            <input
              className={`${inputClass} text-right tabular-nums`}
              inputMode="decimal"
              value={efectivo || ''}
              placeholder="0.00"
              onChange={(e) => setEfectivo(Math.max(0, round2(Number(e.target.value) || 0)))}
            />
          </label>

          {extras.map((e) => (
            <div key={e.kind} className="rounded-xl bg-cream p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold">{e.kind === 'yape' ? 'Yape' : 'Tarjeta'}</span>
                <button
                  type="button"
                  onClick={() => removeExtra(e.kind)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-ink/45"
                  aria-label={`Quitar ${e.kind === 'yape' ? 'Yape' : 'Tarjeta'}`}
                >
                  <X size={16} />
                </button>
              </div>
              <Field label="Con cuánto pagó">
                <input
                  className={inputClass}
                  inputMode="decimal"
                  value={e.amount || ''}
                  placeholder="0.00"
                  onChange={(ev) => setExtraAmount(e.kind, ev.target.value)}
                />
              </Field>
              <Field label="Nº de operación">
                <input
                  className={inputClass}
                  value={e.op}
                  onChange={(ev) =>
                    setExtras(extras.map((x) => (x.kind === e.kind ? { ...x, op: ev.target.value } : x)))
                  }
                  placeholder={e.kind === 'yape' ? 'Ej. 12345678' : 'Voucher / operación'}
                />
              </Field>
            </div>
          ))}

          {available.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {available.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => addExtra(m.id)}
                  className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-ink/12 bg-surface px-3 text-xs font-bold hover:border-ember/50"
                >
                  <Plus size={14} /> Agregar {m.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {falta !== 0 && (
          <p role="status" className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            {falta > 0 ? `Falta asignar ${soles(falta)}` : `Exceso de ${soles(-falta)}`}
          </p>
        )}

        <div>
          <p className="mb-2 text-sm font-semibold">Documento</p>
          <div className="grid grid-cols-2 gap-1.5">
            {(
              [
                ['ninguno', 'Solo ticket'],
                ['boleta_simple', 'Boleta simple'],
                ['boleta_dni', 'Boleta con DNI'],
                ['factura', 'Factura'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setDocTipo(id)}
                aria-pressed={docTipo === id}
                className={`min-h-11 rounded-xl border px-2 text-xs font-bold hover:border-ember/50 ${
                  docTipo === id ? 'border-ember/55 bg-ember/10 text-ember' : 'border-ink/10 bg-surface text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {genericBoleta ? (
          <p className="rounded-xl bg-cream px-3 py-2 text-xs text-ink/70">
            Boleta a cliente genérico: CLIENTES VARIOS · 00000000
          </p>
        ) : null}

        {needsDocData ? (
          <div className="space-y-2">
            {needsRuc ? (
              <Field label="RUC">
                <input
                  className={inputClass}
                  inputMode="numeric"
                  maxLength={11}
                  value={docNumero}
                  onChange={(e) => setDocNumero(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  placeholder="11 dígitos"
                />
              </Field>
            ) : null}
            {needsDni ? (
              <Field label="DNI">
                <input
                  className={inputClass}
                  inputMode="numeric"
                  maxLength={8}
                  value={docNumero}
                  onChange={(e) => setDocNumero(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder="8 dígitos"
                />
              </Field>
            ) : null}
            <Field label={needsRuc ? 'Razón social' : 'Nombre'}>
              <input className={inputClass} value={docNombre} onChange={(e) => setDocNombre(e.target.value)} />
            </Field>
            <Field label="Correo">
              <input className={inputClass} type="email" value={docEmail} onChange={(e) => setDocEmail(e.target.value)} />
            </Field>
            <Field label="Teléfono">
              <input className={inputClass} inputMode="tel" value={docPhone} onChange={(e) => setDocPhone(e.target.value)} />
            </Field>
            <Field label="Dirección">
              <input className={inputClass} value={docAddress} onChange={(e) => setDocAddress(e.target.value)} />
            </Field>
            {lookupNote ? <p className="text-xs text-ink/50">{lookupNote}</p> : null}
          </div>
        ) : null}

      </fieldset>
      <div className="sticky bottom-0 space-y-2 rounded-b-2xl border-t border-ink/10 bg-cream px-4 py-3 sm:px-5">
        {err && <p role="alert" className="text-sm font-semibold text-rose-700 dark:text-rose-300">{err}</p>}
        {total === 0 ? (
          <p className="text-sm text-ink/75">El saldo es cero y el pedido aún figura abierto. Revisa sus pagos en caja.</p>
        ) : pending || busy ? (
          <>
            <p role="status" className="text-sm font-semibold">{busy ? 'Esperando confirmación de caja…' : `¿Confirmar el cobro de ${soles(total)}?`}</p>
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => setPending(null)} className="min-h-12 rounded-xl border border-ink/12 bg-surface px-3 text-sm font-bold disabled:opacity-50">
                Volver
              </button>
              <button ref={confirmButton} type="button" disabled={busy} onClick={() => void runPay()} className="btn-primary flex-1 gap-2 px-3 text-sm disabled:opacity-60">
                {busy ? 'Registrando…' : 'Confirmar e imprimir'}
              </button>
            </div>
          </>
        ) : (
          <button type="button" onClick={submit} className="btn-primary w-full gap-2 px-3 text-sm">
            <Printer size={16} aria-hidden="true" /> Cobrar {soles(total)}
          </button>
        )}
      </div>
    </section>
  )
}
