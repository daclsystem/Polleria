import { CircleUserRound, LockKeyhole, UserRound } from 'lucide-react'

export function OrderPeople({
  customer,
  attendant,
  locked = false,
  attendantLabel = 'Mozo',
  className = '',
}: {
  customer: string
  attendant: string
  locked?: boolean
  attendantLabel?: string
  className?: string
}) {
  return (
    <div className={`order-people grid grid-cols-2 gap-2 ${className}`}>
      <div className="min-w-0 rounded-xl bg-surface/60 px-2.5 py-2 ring-1 ring-ink/5">
        <p className="flex items-center gap-1.5 text-[10px] font-medium text-ink/55">
          <UserRound size={12} className="shrink-0" /> Cliente
        </p>
        <p className="mt-1 text-[13px] font-bold leading-snug text-ink [overflow-wrap:anywhere]">
          {customer || 'Sin nombre registrado'}
        </p>
      </div>
      <div className="min-w-0 rounded-xl bg-ember/7 px-2.5 py-2 text-ember ring-1 ring-ember/5">
        <p className="flex items-center gap-1.5 text-[10px] font-medium">
          <CircleUserRound size={12} className="shrink-0" /> {attendantLabel}
          {locked ? <LockKeyhole size={11} className="ml-auto shrink-0" aria-label="Asignada a otro mozo" /> : null}
        </p>
        <p className="mt-1 text-[13px] font-bold leading-snug [overflow-wrap:anywhere]">{attendant}</p>
      </div>
    </div>
  )
}
