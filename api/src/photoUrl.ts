/** Solo URLs reales (MinIO / http). No data URI ni ui-avatars. */
export function persistablePhotoUrl(url?: string | null): string | null {
  const v = String(url || '').trim()
  if (!v) return null
  if (v.startsWith('data:')) return null
  if (/ui-avatars\.com/i.test(v)) return null
  if (!/^https?:\/\//i.test(v)) return null
  if (v.length > 500) return null
  return v
}
