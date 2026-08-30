export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-black/[0.07] ${className}`} />
}

export function SkeletonProductCard({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="w-[10.75rem] shrink-0 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
        <Skeleton className="aspect-[4/3] w-full rounded-none" />
        <div className="space-y-2 p-2.5">
          <Skeleton className="h-3.5 w-4/5" />
          <Skeleton className="h-2.5 w-3/5" />
          <Skeleton className="h-3.5 w-16" />
        </div>
      </div>
    )
  }
  return (
    <div className="flex w-full items-center gap-3 rounded-2xl bg-white p-2.5 shadow-sm ring-1 ring-black/5">
      <Skeleton className="h-[4.75rem] w-[4.75rem] shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
    </div>
  )
}

export function SkeletonProductRail({ count = 4 }: { count?: number }) {
  return (
    <div className="flex gap-3 overflow-hidden">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonProductCard key={i} compact />
      ))}
    </div>
  )
}

export function SkeletonProductGrid({
  count = 8,
  compact = false,
  className = '',
}: {
  count?: number
  compact?: boolean
  className?: string
}) {
  return (
    <div className={className || (compact ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5' : 'grid grid-cols-1 gap-2 sm:grid-cols-2')}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonProductCard key={i} compact={compact} />
      ))}
    </div>
  )
}

export function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-3 w-44" />
              <Skeleton className="h-3 w-3/4" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <Skeleton className="mt-3 h-5 w-20" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonPersonList({ count = 5 }: { count?: number }) {
  return (
    <div className="mt-6 space-y-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
          <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="h-8 w-16 rounded-xl" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonStats({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-2xl bg-white p-4 text-center shadow-sm">
          <Skeleton className="mx-auto h-3 w-12" />
          <Skeleton className="mx-auto mt-2 h-7 w-20" />
          <Skeleton className="mx-auto mt-2 h-3 w-16" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonTrackPage() {
  return (
    <div className="min-h-dvh bg-[#f6f7f9]">
      <div className="bg-[#1a3d1a] px-4 pb-8 pt-5">
        <Skeleton className="h-4 w-32 bg-white/20" />
        <Skeleton className="mt-4 h-3 w-40 bg-white/15" />
        <Skeleton className="mt-2 h-7 w-48 bg-white/20" />
      </div>
      <div className="-mt-4 space-y-4 px-4 pb-10">
        <div className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </div>
        <Skeleton className="h-56 w-full rounded-2xl" />
        <div className="space-y-3 rounded-2xl bg-white p-5 shadow-sm">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="mt-2 h-6 w-24" />
        </div>
      </div>
    </div>
  )
}

export function SkeletonSystemPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-10 w-28 rounded-xl" />
      </div>
      <SkeletonRows count={5} />
    </div>
  )
}
