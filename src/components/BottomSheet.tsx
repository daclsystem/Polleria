import type { ReactNode } from 'react'

/** Overlay + panel. En móvil sale desde abajo; en sm+ queda centrado. */
export function BottomSheet({
  open,
  onClose,
  children,
  z = 70,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  z?: number
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0" style={{ zIndex: z }}>
      <button
        type="button"
        className="absolute inset-0 bg-black/55"
        onClick={onClose}
        aria-label="Cerrar"
      />
      <div className="absolute inset-x-0 bottom-0 z-10 flex max-h-[min(88dvh,100%)] w-full flex-col overflow-y-auto overscroll-contain rounded-t-3xl bg-surface px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 text-ink shadow-2xl sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[min(88dvh,36rem)] sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:pt-5">
        <div className="mx-auto mb-3 h-1.5 w-10 shrink-0 rounded-full bg-black/15 sm:hidden" />
        {children}
      </div>
    </div>
  )
}
