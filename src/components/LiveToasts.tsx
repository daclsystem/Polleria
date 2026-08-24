import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useStore } from '../store/StoreContext'

export function LiveToasts() {
  const { notices, dismissNotice } = useStore()
  if (!notices.length) return null

  return (
    <div className="pointer-events-none fixed top-16 right-3 z-[60] flex w-[min(22rem,calc(100vw-1.5rem))] flex-col gap-2 sm:top-4">
      {notices.map((n) => (
        <div
          key={n.id}
          className={`pointer-events-auto flex items-start gap-2 rounded-2xl px-3 py-3 text-sm shadow-lg ring-1 ${
            n.tone === 'ok'
              ? 'bg-emerald-700 text-white ring-emerald-600'
              : n.tone === 'warn'
                ? 'bg-amber-500 text-ink ring-amber-400'
                : 'bg-ink text-cream ring-ink/20'
          }`}
        >
          <p className="min-w-0 flex-1 font-semibold leading-snug">{n.text}</p>
          <button className="shrink-0 opacity-70 hover:opacity-100" onClick={() => dismissNotice(n.id)}>
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  )
}

export function useLiveBadge() {
  const { live } = useStore()
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 4000)
    return () => clearInterval(t)
  }, [])
  return { live, pulse: tick % 2 === 0 }
}
