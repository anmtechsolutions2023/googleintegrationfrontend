// src/utils/escpos.js
//
// ESC/POS: the command language receipt printers speak.
//
// A thermal printer reached over Bluetooth has no print dialog, no fonts and no
// page layout. It takes bytes — text in its built-in font, plus a handful of
// control codes for alignment, bold, size and the cutter. This builds those
// bytes. It knows nothing about bills; utils/escposReceipt does.
//
// Text is reduced to printable ASCII. The printer's default code page is CP437,
// which has no rupee sign and no Indian scripts, and a byte it cannot draw comes
// out as a wrong glyph rather than an error. So "₹" becomes "Rs.", accents are
// dropped and anything else is a "?" the cashier can see, not a silent
// mis-print.

const ESC = 0x1b
const GS = 0x1d
const LF = 0x0a

/**
 * Characters per line in the printer's standard font (12 dots wide): an 80mm
 * head is 576 dots, a 58mm head 384.
 */
export const columnsFor = (paperWidth) => (String(paperWidth) === '58' ? 32 : 48)

const SUBSTITUTES = [
  [/₹/g, 'Rs.'],
  [/[·•]/g, '-'],
  [/[–—]/g, '-'],
  [/[‘’]/g, "'"],
  [/[“”]/g, '"'],
  [/…/g, '...'],
  [/×/g, 'x'],
  [/ /g, ' '],
]

/** Printable ASCII only — see the note at the top of the file. */
export const toPrintable = (value) => {
  let s = String(value ?? '')
  SUBSTITUTES.forEach(([pattern, to]) => { s = s.replace(pattern, to) })
  s = s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  return s.replace(/[\r\n\t]+/g, ' ').replace(/[^\x20-\x7e]/g, '?')
}

/** Word-wraps to `width`, breaking a word only when it is longer than a line. */
export const wrap = (value, width) => {
  const w = Math.max(1, width)
  const lines = []
  let current = ''
  toPrintable(value).split(' ').filter(Boolean).forEach((word) => {
    let rest = word
    while (rest.length > w) {
      if (current) { lines.push(current); current = '' }
      lines.push(rest.slice(0, w))
      rest = rest.slice(w)
    }
    if (!rest) return
    if (!current) current = rest
    else if (current.length + 1 + rest.length <= w) current = `${current} ${rest}`
    else { lines.push(current); current = rest }
  })
  if (current) lines.push(current)
  return lines.length ? lines : ['']
}

/**
 * A chainable byte builder.
 *
 * @param {Object} [opts]
 * @param {number} [opts.columns=48] - Characters per line at normal size.
 */
export const createEncoder = ({ columns = 48 } = {}) => {
  const bytes = []
  let widthScale = 1
  const push = (...codes) => { codes.forEach((c) => bytes.push(c & 0xff)) }
  const text = (s) => {
    const printable = toPrintable(s)
    for (let i = 0; i < printable.length; i += 1) bytes.push(printable.charCodeAt(i))
  }
  // Double-width text halves the room on a line.
  const width = () => Math.max(1, Math.floor(columns / widthScale))

  const api = {
    /** Reset the printer and select the default code page. */
    init() { push(ESC, 0x40, ESC, 0x74, 0x00); return api },
    align(where) { push(ESC, 0x61, where === 'center' ? 1 : where === 'right' ? 2 : 0); return api },
    bold(on) { push(ESC, 0x45, on ? 1 : 0); return api },
    /** White on black — kept for the few lines read at arm's length. */
    invert(on) { push(GS, 0x42, on ? 1 : 0); return api },
    /** Character size, 1–8 times in each direction. */
    size(w = 1, h = 1) {
      const sw = Math.min(8, Math.max(1, w))
      const sh = Math.min(8, Math.max(1, h))
      widthScale = sw
      push(GS, 0x21, ((sw - 1) << 4) | (sh - 1))
      return api
    },
    /** Text, wrapped to the line. */
    line(s = '') {
      wrap(s, width()).forEach((l) => { text(l); push(LF) })
      return api
    },
    centre(s) { return api.align('center').line(s).align('left') },
    /**
     * A label on the left and a value flush right — the shape of every total.
     * A long label wraps and the value sits on its last line.
     */
    row(left, right = '', { strong = false } = {}) {
      const w = width()
      const value = toPrintable(right)
      if (strong) api.bold(true)
      if (value.length + 2 > w) {
        api.line(left)
        text(' '.repeat(Math.max(0, w - value.length)) + value.slice(0, w))
        push(LF)
      } else {
        const lines = wrap(left, w - value.length - 1)
        lines.forEach((l, i) => {
          if (i < lines.length - 1) { text(l); push(LF); return }
          text(l + ' '.repeat(Math.max(1, w - l.length - value.length)) + value)
          push(LF)
        })
      }
      if (strong) api.bold(false)
      return api
    },
    rule(ch = '-') { text(ch.repeat(width())); push(LF); return api },
    feed(lines = 1) { push(ESC, 0x64, Math.min(255, Math.max(0, lines))); return api },
    /** Feed past the cutter, then a partial cut. */
    cut() { api.feed(4); push(GS, 0x56, 0x01); return api },
    toBytes() { return Uint8Array.from(bytes) },
    get columns() { return width() },
  }
  return api
}

const escpos = { columnsFor, toPrintable, wrap, createEncoder }

export default escpos
