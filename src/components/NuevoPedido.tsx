import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, Plus, ShoppingBag, Table2 } from 'lucide-react'
import { Modal } from './ui'

/** Un solo arranque: mesa, para llevar o delivery. Evita pantallas duplicadas. */
export function NuevoPedidoButton({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  const go = (to: string) => {
    setOpen(false)
    navigate(to)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex min-h-11 items-center gap-2 rounded-2xl bg-gold px-4 text-sm font-black text-[#1a3d1a] shadow-lg shadow-yellow-500/20 ${className}`}
      >
        <Plus size={18} strokeWidth={2.6} />
        Nuevo pedido
      </button>
      <Modal open={open} title="¿Qué van a pedir?" onClose={() => setOpen(false)}>
        <div className="grid gap-2">
          <button
            type="button"
            onClick={() => go('/mesas')}
            className="flex min-h-14 items-center gap-3 rounded-2xl bg-gold/20 px-4 text-left ring-1 ring-gold/40"
          >
            <Table2 size={22} />
            <span>
              <span className="block text-sm font-black">En mesa</span>
              <span className="block text-xs text-ink/50">Toca la mesa en el salón</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => go('/pos')}
            className="flex min-h-14 items-center gap-3 rounded-2xl bg-cream px-4 text-left ring-1 ring-ink/8"
          >
            <ShoppingBag size={22} />
            <span>
              <span className="block text-sm font-black">Para llevar</span>
              <span className="block text-xs text-ink/50">Piden y se lo llevan</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => go('/pos?tipo=delivery')}
            className="flex min-h-14 items-center gap-3 rounded-2xl bg-sky-500/10 px-4 text-left ring-1 ring-sky-500/20"
          >
            <MapPin size={22} />
            <span>
              <span className="block text-sm font-black">Delivery</span>
              <span className="block text-xs text-ink/50">Se lo llevan a casa</span>
            </span>
          </button>
        </div>
      </Modal>
    </>
  )
}
