import { createContext, useContext, useState, type ReactNode } from 'react'
import { ConfirmDialog, type ConfirmButton } from './ConfirmDialog'

type ConfirmOptions = {
  title: string
  message?: ReactNode
  buttons: ConfirmButton[]
}

type ConfirmDialogContextType = {
  confirm: (options: ConfirmOptions) => Promise<void>
  confirmDelete: (title: string, onConfirm: () => void | Promise<void>, message?: ReactNode) => Promise<void>
  confirmAction: (title: string, onConfirm: () => void | Promise<void>, message?: ReactNode, confirmLabel?: string) => Promise<void>
}

const ConfirmDialogContext = createContext<ConfirmDialogContextType | null>(null)

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
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

  const close = () => {
    setState((prev) => ({ ...prev, open: false }))
  }

  const confirm = async (options: ConfirmOptions) => {
    return new Promise<void>((resolve) => {
      setState({
        open: true,
        title: options.title,
        message: options.message,
        buttons: options.buttons.map((btn) => ({
          ...btn,
          onClick: () => {
            btn.onClick()
            close()
            resolve()
          },
        })),
      })
    })
  }

  const confirmDelete = async (
    title: string,
    onConfirm: () => void | Promise<void>,
    message?: ReactNode
  ) => {
    return confirm({
      title,
      message,
      buttons: [
        {
          label: 'Eliminar',
          variant: 'danger',
          onClick: () => void onConfirm(),
        },
        {
          label: 'Cancelar',
          variant: 'secondary',
          onClick: close,
        },
      ],
    })
  }

  const confirmAction = async (
    title: string,
    onConfirm: () => void | Promise<void>,
    message?: ReactNode,
    confirmLabel = 'Confirmar'
  ) => {
    return confirm({
      title,
      message,
      buttons: [
        {
          label: confirmLabel,
          variant: 'primary',
          onClick: () => void onConfirm(),
        },
        {
          label: 'Cancelar',
          variant: 'secondary',
          onClick: close,
        },
      ],
    })
  }

  return (
    <ConfirmDialogContext.Provider value={{ confirm, confirmDelete, confirmAction }}>
      {children}
      <ConfirmDialog
        open={state.open}
        title={state.title}
        message={state.message}
        buttons={state.buttons}
        onClose={close}
      />
    </ConfirmDialogContext.Provider>
  )
}

export function useConfirm() {
  const context = useContext(ConfirmDialogContext)
  if (!context) {
    throw new Error('useConfirm must be used within ConfirmDialogProvider')
  }
  return context
}
