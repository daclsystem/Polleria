import { useState } from 'react'
import type { ReactNode } from 'react'

export type ConfirmButton = {
  label: string
  onClick: () => void
  variant?: 'danger' | 'primary' | 'secondary'
  disabled?: boolean
}

export function ConfirmDialog({
  open,
  title,
  message,
  buttons,
  onClose,
}: {
  open: boolean
  title: string
  message?: ReactNode
  buttons: ConfirmButton[]
  onClose?: () => void
}) {
  if (!open) return null

  const getButtonClass = (variant?: string, disabled?: boolean) => {
    const base = 'min-h-12 w-full rounded-xl border text-sm font-semibold transition-colors'
    
    if (disabled) {
      return `${base} border-ink/20 bg-ink/5 text-ink/30 cursor-not-allowed`
    }

    switch (variant) {
      case 'danger':
        return `${base} border-brick/30 bg-transparent text-brick hover:bg-brick/10 active:bg-brick/15`
      case 'primary':
        return `${base} border-sage/30 bg-transparent text-sage hover:bg-sage/10 active:bg-sage/15`
      case 'secondary':
      default:
        return `${base} border-sage/30 bg-transparent text-sage hover:bg-sage/10 active:bg-sage/15`
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Cerrar"
      />
      
      {/* Dialog */}
      <div className="relative z-10 w-full max-w-[320px] rounded-3xl bg-[#1c1c1e] p-6 shadow-2xl">
        {/* Title */}
        <h3 className="text-center text-[17px] font-semibold leading-snug text-white">
          {title}
        </h3>
        
        {/* Message */}
        {message && (
          <div className="mt-2 text-center text-[13px] leading-relaxed text-white/60">
            {message}
          </div>
        )}
        
        {/* Buttons */}
        <div className="mt-5 space-y-2">
          {buttons.map((button, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                if (!button.disabled) {
                  button.onClick()
                }
              }}
              disabled={button.disabled}
              className={getButtonClass(button.variant, button.disabled)}
            >
              {button.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// Hook para usar el diálogo de confirmación
export function useConfirmDialog() {
  const [state, setState] = useState<{
    open: boolean
    title: string
    message?: ReactNode
    buttons: ConfirmButton[]
  }>({
    open: false,
    title: '',
    buttons: [],
  })

  const confirm = (options: {
    title: string
    message?: ReactNode
    buttons: ConfirmButton[]
  }) => {
    setState({
      open: true,
      ...options,
    })
  }

  const close = () => {
    setState((prev) => ({ ...prev, open: false }))
  }

  const dialog = (
    <ConfirmDialog
      open={state.open}
      title={state.title}
      message={state.message}
      buttons={state.buttons}
      onClose={close}
    />
  )

  return { confirm, close, dialog }
}

// Helpers para casos comunes
export function confirmDelete(options: {
  title: string
  message?: ReactNode
  confirmLabel?: string
  onConfirm: () => void
  onCancel?: () => void
}) {
  return {
    title: options.title,
    message: options.message,
    buttons: [
      {
        label: options.confirmLabel || 'Eliminar',
        onClick: options.onConfirm,
        variant: 'danger' as const,
      },
      {
        label: 'Cancelar',
        onClick: options.onCancel || (() => {}),
        variant: 'secondary' as const,
      },
    ],
  }
}

export function confirmAction(options: {
  title: string
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel?: () => void
}) {
  return {
    title: options.title,
    message: options.message,
    buttons: [
      {
        label: options.confirmLabel || 'Confirmar',
        onClick: options.onConfirm,
        variant: 'primary' as const,
      },
      {
        label: options.cancelLabel || 'Cancelar',
        onClick: options.onCancel || (() => {}),
        variant: 'secondary' as const,
      },
    ],
  }
}
