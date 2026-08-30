import { createSeed } from '../data/seed'
import type { Product } from '../types'

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Completa tags/opciones desde el seed local si la API aún no las trae. */
export function enrichProducts(apiProducts: Product[]): Product[] {
  const seed = createSeed().products
  const byName = new Map(seed.map((p) => [norm(p.name), p]))
  return apiProducts.map((p) => {
    const s = byName.get(norm(p.name))
    if (!s) return p
    return {
      ...p,
      tags: p.tags?.length ? p.tags : s.tags,
      optionGroups: p.optionGroups?.length ? p.optionGroups : s.optionGroups,
    }
  })
}
