export function splitVehicle(info?: string | null, plate?: string | null) {
  const p = String(plate || '').trim().toUpperCase()
  const raw = String(info || '').trim()
  if (p) return { vehicle: raw || 'Moto', plate: p }
  const m = raw.match(/^(.+?)\s*[·•|]\s*([A-Z0-9]{2,4}[- ]?[A-Z0-9]{2,4})$/i)
  if (m) return { vehicle: m[1].trim() || 'Moto', plate: m[2].trim().toUpperCase() }
  if (/^[A-Z0-9]{3,8}$/i.test(raw.replace(/[-\s]/g, ''))) {
    return { vehicle: 'Moto', plate: raw.replace(/\s+/g, '').toUpperCase() }
  }
  return { vehicle: raw || 'Moto', plate: '' }
}

export function whatsappHref(phone?: string | null, text?: string) {
  let d = String(phone || '').replace(/\D/g, '')
  if (d.length === 9 && d.startsWith('9')) d = `51${d}`
  if (d.length < 11) return ''
  const q = text ? `?text=${encodeURIComponent(text)}` : ''
  return `https://wa.me/${d}${q}`
}
