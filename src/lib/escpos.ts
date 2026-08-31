/**
 * ESC/POS command encoder for 80mm thermal printers (Epson TM-T20/T88, Star, etc.)
 * Generates raw byte arrays that printers understand natively.
 */

const ESC = 0x1b
const GS = 0x1d
const LF = 0x0a
const DLE = 0x10

export const CMD = {
  INIT: [ESC, 0x40],
  CUT: [GS, 0x56, 0x00],
  CUT_PARTIAL: [GS, 0x56, 0x01],
  FEED_CUT: [GS, 0x56, 0x41, 0x03],
  ALIGN_LEFT: [ESC, 0x61, 0x00],
  ALIGN_CENTER: [ESC, 0x61, 0x01],
  ALIGN_RIGHT: [ESC, 0x61, 0x02],
  BOLD_ON: [ESC, 0x45, 0x01],
  BOLD_OFF: [ESC, 0x45, 0x00],
  DOUBLE_ON: [GS, 0x21, 0x11],
  DOUBLE_OFF: [GS, 0x21, 0x00],
  WIDE_ON: [GS, 0x21, 0x10],
  WIDE_OFF: [GS, 0x21, 0x00],
  UNDERLINE_ON: [ESC, 0x2d, 0x01],
  UNDERLINE_OFF: [ESC, 0x2d, 0x00],
  INVERT_ON: [GS, 0x42, 0x01],
  INVERT_OFF: [GS, 0x42, 0x00],
  OPEN_DRAWER: [DLE, 0x14, 0x01, 0x00, 0x05],
  BEEP: [ESC, 0x42, 0x03, 0x02],
  FEED: (n: number) => [ESC, 0x64, n],
} as const

const CODEPAGE_PC858 = [ESC, 0x74, 19]

const CHAR_MAP: Record<string, number> = {
  á: 0xa0, é: 0x82, í: 0xa1, ó: 0xa2, ú: 0xa3,
  Á: 0xb5, É: 0x90, Í: 0xd6, Ó: 0xe0, Ú: 0xe9,
  ñ: 0xa4, Ñ: 0xa5, ü: 0x81, Ü: 0x9a,
  '¡': 0xad, '¿': 0xa8, '°': 0xf8,
  '·': 0xfa, '€': 0xd5,
  // Intl (es-PE) usa NBSP en "S/ 12.50"; sin esto la impresora imprime "?"
  '\u00A0': 0x20, '\u202F': 0x20, '\u2007': 0x20, '\u2009': 0x20,
  '\u2013': 0x2d, '\u2014': 0x2d,
}

function encodeText(text: string): number[] {
  const bytes: number[] = []
  for (const ch of text) {
    if (CHAR_MAP[ch] !== undefined) {
      bytes.push(CHAR_MAP[ch])
    } else {
      const code = ch.charCodeAt(0)
      bytes.push(code > 127 ? 0x3f : code) // '?' for unmapped chars
    }
  }
  return bytes
}

/** Alinea `left` y `right` en un ancho fijo de caracteres, recortando si no entran. */
export function rowText(left: string, right: string, width: number): string {
  const gap = width - left.length - right.length
  if (gap > 0) return left + ' '.repeat(gap) + right
  return left.slice(0, Math.max(0, width - right.length - 1)) + ' ' + right
}

export class EscPosBuilder {
  private buffer: number[] = []
  private cols: number

  constructor(cols = 48) {
    this.cols = cols
    this.push(...CMD.INIT)
    this.push(...CODEPAGE_PC858)
  }

  private push(...bytes: number[]) {
    this.buffer.push(...bytes)
    return this
  }

  raw(bytes: number[]) {
    return this.push(...bytes)
  }

  text(s: string) {
    return this.push(...encodeText(s))
  }

  line(s = '') {
    this.text(s)
    return this.push(LF)
  }

  feed(lines = 1) {
    return this.push(...CMD.FEED(lines))
  }

  center() { return this.push(...CMD.ALIGN_CENTER) }
  left() { return this.push(...CMD.ALIGN_LEFT) }
  right() { return this.push(...CMD.ALIGN_RIGHT) }

  bold(on = true) { return this.push(...(on ? CMD.BOLD_ON : CMD.BOLD_OFF)) }
  double(on = true) { return this.push(...(on ? CMD.DOUBLE_ON : CMD.DOUBLE_OFF)) }
  wide(on = true) { return this.push(...(on ? CMD.WIDE_ON : CMD.WIDE_OFF)) }
  underline(on = true) { return this.push(...(on ? CMD.UNDERLINE_ON : CMD.UNDERLINE_OFF)) }
  invert(on = true) { return this.push(...(on ? CMD.INVERT_ON : CMD.INVERT_OFF)) }

  separator(char = '-') {
    return this.line(char.repeat(this.cols))
  }

  row(left: string, right: string, width = this.cols) {
    this.text(rowText(left, right, width))
    return this.push(LF)
  }

  columns(cols: { text: string; width: number; align?: 'left' | 'right' | 'center' }[]) {
    let result = ''
    for (const col of cols) {
      const text = col.text.slice(0, col.width)
      const pad = col.width - text.length
      if (col.align === 'right') {
        result += ' '.repeat(pad) + text
      } else if (col.align === 'center') {
        const l = Math.floor(pad / 2)
        result += ' '.repeat(l) + text + ' '.repeat(pad - l)
      } else {
        result += text + ' '.repeat(pad)
      }
    }
    return this.line(result)
  }

  openDrawer() { return this.push(...CMD.OPEN_DRAWER) }
  beep() { return this.push(...CMD.BEEP) }
  cut() { return this.push(...CMD.FEED_CUT) }

  build(): Uint8Array {
    return new Uint8Array(this.buffer)
  }
}
