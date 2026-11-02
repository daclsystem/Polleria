import { ChevronLeft, ChevronRight } from 'lucide-react'

export function Pagination({ page, total, pageSize = 24, onChange, noun = 'registros' }: {
  page: number
  total: number
  pageSize?: number
  onChange: (page: number) => void
  noun?: string
}) {
  const totalPages = Math.ceil(total / pageSize)
  if (totalPages <= 1) return null
  const change = (next: number, element: HTMLElement) => {
    onChange(next)
    const main = element.closest('main')
    main?.scrollTo({ top: 0 })
    main?.focus({ preventScroll: true })
  }

  return (
    <nav aria-label={`Paginación de ${noun}`} className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/8 bg-surface p-3">
      <p className="text-xs text-ink/55" aria-live="polite">
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total} {noun}
      </p>
      <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
        <button type="button" disabled={page <= 1} aria-label="Página anterior" onClick={(event) => change(page - 1, event.currentTarget)} className="flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-lg border border-ink/10 px-2 text-xs font-semibold text-ink/65 hover:bg-ink/5 disabled:opacity-30">
          <ChevronLeft size={17} /><span className="hidden sm:inline">Anterior</span>
        </button>
        <select aria-label="Elegir página" value={page} onChange={(event) => change(Number(event.target.value), event.currentTarget)} className="min-h-11 min-w-0 flex-1 rounded-lg border border-ink/10 bg-surface px-2 text-sm text-ink sm:flex-none">
          {Array.from({ length: totalPages }, (_, index) => <option key={index + 1} value={index + 1}>Página {index + 1} de {totalPages}</option>)}
        </select>
        <button type="button" disabled={page >= totalPages} aria-label="Página siguiente" onClick={(event) => change(page + 1, event.currentTarget)} className="flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-lg border border-ink/10 px-2 text-xs font-semibold text-ink/65 hover:bg-ink/5 disabled:opacity-30">
          <span className="hidden sm:inline">Siguiente</span><ChevronRight size={17} />
        </button>
      </div>
    </nav>
  )
}
