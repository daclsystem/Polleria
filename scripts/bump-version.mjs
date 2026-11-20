import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/lib/version.ts')
const raw = fs.readFileSync(file, 'utf8')
const current = raw.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1] || '0.0.0'
const parts = current.split('.').map((n) => Number.parseInt(n, 10) || 0)
while (parts.length < 3) parts.push(0)
parts[2] += 1
const next = parts.join('.')

const now = new Date()
const day = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`
const prevBuild = raw.match(/APP_BUILD\s*=\s*['"]([^'"]+)['"]/)?.[1] || ''
const sameDay = prevBuild.startsWith(day)
const letter = sameDay ? String.fromCharCode(97 + (prevBuild.match(/[a-z]$/) ? prevBuild.charCodeAt(prevBuild.length - 1) - 96 : 0)) : 'a'
const build = `${day}${letter}`

const updated = raw
  .replace(/APP_VERSION\s*=\s*['"][^'"]+['"]/, `APP_VERSION = '${next}'`)
  .replace(/APP_BUILD\s*=\s*['"][^'"]+['"]/, `APP_BUILD = '${build}'`)

fs.writeFileSync(file, updated)
console.log(`Versión ${current} → ${next}`)
