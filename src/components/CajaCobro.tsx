import { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Field, inputClass } from './ui'
import { ConfirmProcess } from './ConfirmProcess'
import { round2, soles } from '../lib/format'
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
  onFinished,
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
  onFinished?: () => void
}) {
  const total = round2(order.total)
  const [efectivo, setEfectivo] = useState(total)
  const [extras, setExtras] = useState<{ kind: ExtraKind; amount: number; op: string }[]>([])
  const [docTipo, setDocTipo] = useState<FiscalDocTipo>('ninguno')
  const [docNumero, setDocNumero] = useState('')
  const [docNombre, setDocNombre] = useState(order.customerName || '')
  const [docEmail, setDocEmail] = useState('')
  const [docPhone, setDocPhone] = useState(order.customerPhone || '')
  const [docAddress, setDocAddress] = useState(order.address || '')
  const [err, setErr] = useState('')
  const [dlg, setDlg] = useState<'confirm' | 'busy' | 'done' | null>(null)
  const [pending, setPending] = useState<Parameters<typeof onConfirm>[0] | null>(null)

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

  const needsDocData = docTipo !== 'ninguno'
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
    if (Math.abs(falta) > 0.01) return false
    if (suma <= 0) return false
    if (!opOk) return false
    if (needsDocData && !(nameOk && mailOk && phoneOk && addrOk && rucOk && dniOk)) return false
    return true
  }, [falta, suma, opOk, needsDocData, nameOk, mailOk, phoneOk, addrOk, rucOk, dniOk])

  const submit = () => {
    setErr('')
    if (!canPay) {
      if (Math.abs(falta) > 0.01) setErr(`La suma debe ser ${soles(total)}`)
      else if (!opOk) setErr('Yape o tarjeta necesitan el número de operación')
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
        docNumero: needsDocData ? docNumero.trim() : undefined,
        docNombre: needsDocData ? docNombre.trim() : undefined,
        docEmail: needsDocData ? docEmail.trim() : undefined,
        docPhone: needsDocData ? docPhone.trim() : undefined,
        docAddress: needsDocData ? docAddress.trim() : undefined,
      },
    }
    setPending(payload)
    setDlg('confirm')
  }

  const runPay = async () => {
    if (!pending) return
    setDlg('busy')
    try {
      await onConfirm(pending)
      setDlg('done')
    } catch (e) {
      setDlg('confirm')
      setErr((e as Error).message || 'No se pudo cobrar')
    }
  }

  return (
    <div className="space-y-3 rounded-xl bg-white p-3">
      <p className="text-xs font-semibold uppercase text-ink/40">Cobrar</p>
      {isFactura ? (
        <div className="space-y-0.5 text-sm text-ink/55">
          <p className="flex justify-between">
            <span>Op. gravadas</span>
            <span>{soles(order.subtotal)}</span>
          </p>
          <p className="flex justify-between">
            <span>IGV incluido</span>
            <span>{soles(order.igv)}</span>
          </p>
          <p className="font-display text-2xl tracking-tight text-ember">{soles(total)}</p>
        </div>
      ) : (
        <p className="font-display text-2xl tracking-tight text-ember">{soles(total)}</p>
      )}

      <div className="space-y-2">
        <div className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
          <span className="text-sm font-bold">Efectivo</span>
          <input
            className={inputClass}
            inputMode="decimal"
            value={efectivo || ''}
            placeholder="0.00"
            onChange={(e) => setEfectivo(Math.max(0, round2(Number(e.target.value) || 0)))}
          />
        </div>

        {extras.map((e) => (
          <div key={e.kind} className="rounded-xl bg-cream p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold">{e.kind === 'yape' ? 'Yape' : 'Tarjeta'}</span>
              <button
                type="button"
                onClick={() => removeExtra(e.kind)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-ink/45"
                aria-label="Quitar"
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
                className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-ink/8 px-3 text-xs font-bold text-ink"
              >
                <Plus size={14} /> Agregar {m.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <p className={`text-xs font-semibold ${Math.abs(falta) < 0.01 ? 'text-emerald-700' : 'text-ember'}`}>
        {Math.abs(falta) < 0.01 ? 'Suma completa' : `Falta ${soles(falta)}`}
      </p>

      <div>
        <p className="mb-1.5 text-[11px] font-bold tracking-wide text-ink/40 uppercase">Documento</p>
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
              className={`min-h-10 rounded-xl px-2 text-xs font-bold ${
                docTipo === id ? 'bg-ink text-cream' : 'bg-cream text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

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
        </div>
      ) : null}

      {err ? <p className="text-xs font-semibold text-ember">{err}</p> : null}

      <button
        type="button"
        disabled={busy || !canPay}
        onClick={submit}
        className="min-h-11 w-full rounded-xl bg-ember text-sm font-bold text-white disabled:opacity-40"
      >
        {busy ? 'Cobrando…' : 'Cobrar e imprimir'}
      </button>

      <ConfirmProcess
        open={!!dlg}
        phase={dlg === 'done' ? 'done' : dlg === 'busy' ? 'busy' : 'confirm'}
        title="¿Cobrar este pedido?"
        message={
          <p>
            Se registra el pago de <strong>{soles(total)}</strong>
            {isFactura ? ' (factura con IGV incluido)' : ''} y se imprime el ticket.
          </p>
        }
        confirmLabel="Sí, cobrar"
        doneTitle="Cobro procesado"
        doneMessage="El pedido quedó pagado y se envió a imprimir."
        busyLabel="Cobrando…"
        onConfirm={() => void runPay()}
        onCancel={() => setDlg(null)}
        onDone={() => {
          setDlg(null)
          onFinished?.()
        }}
      />
    </div>
  )
}
