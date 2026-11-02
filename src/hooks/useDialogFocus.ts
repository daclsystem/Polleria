import { useEffect, useRef, type KeyboardEvent } from 'react'

/** Mantiene el teclado dentro del diálogo y devuelve el foco al control de origen. */
export function useDialogFocus(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const frame = requestAnimationFrame(() => panelRef.current?.focus())
    return () => {
      cancelAnimationFrame(frame)
      if (previous?.isConnected) previous.focus()
    }
  }, [open])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const panel = panelRef.current
    if (!panel) return
    const controls = [...panel.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
    )].filter((element) => element.getClientRects().length > 0)
    if (!controls.length) {
      event.preventDefault()
      return
    }
    const first = controls[0]
    const last = controls[controls.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault()
      event.stopPropagation()
      last.focus()
    } else if (!event.shiftKey && (active === last || active === panel)) {
      event.preventDefault()
      event.stopPropagation()
      first.focus()
    }
  }

  return { panelRef, onKeyDown }
}
