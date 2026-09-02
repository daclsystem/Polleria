import type { HTMLAttributes } from 'react'
import { initialsFromName, isPlaceholderAvatar } from '../lib/avatar'

const TONE_BG = {
  staff: 'bg-[#1a3d1a] text-gold',
  customer: 'bg-[#1a3d1a] text-gold',
  driver: 'bg-teal-800 text-white',
} as const

/** Foto real, o iniciales locales (evita “SI” de ui-avatars / “de sistema”). */
export function PersonAvatar({
  name,
  photoUrl,
  tone = 'staff',
  className = 'h-10 w-10 text-sm',
  ...rest
}: {
  name: string
  photoUrl?: string | null
  tone?: 'staff' | 'customer' | 'driver'
  className?: string
} & HTMLAttributes<HTMLElement>) {
  const real =
    photoUrl &&
    !isPlaceholderAvatar(photoUrl) &&
    !photoUrl.includes('ui-avatars.com')
  if (real) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className={`rounded-full object-cover ${className}`}
        {...rest}
      />
    )
  }
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-extrabold tracking-tight ${TONE_BG[tone]} ${className}`}
      title={name}
      {...rest}
    >
      {initialsFromName(name)}
    </span>
  )
}
