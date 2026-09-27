import { createEncoder, columnsFor, toPrintable, wrap } from '../escpos'

// The visible text of a byte stream: control sequences dropped, lines split.
// ESC @ carries no parameter; every other command used here carries one byte.
export const visible = (bytes) => {
  let out = ''
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i]
    if (b === 0x1b) { i += bytes[i + 1] === 0x40 ? 1 : 2; continue }
    if (b === 0x1d) { i += 2; continue }
    out += b === 0x0a ? '\n' : String.fromCharCode(b)
  }
  return out.split('\n').slice(0, -1)
}

describe('escpos', () => {
  test('paper width sets the characters on a line', () => {
    expect(columnsFor('80')).toBe(48)
    expect(columnsFor('58')).toBe(32)
    expect(columnsFor(undefined)).toBe(48)
  })

  test('text is reduced to what the printer can draw', () => {
    expect(toPrintable('₹ 675 · Café — “Jain”')).toBe('Rs. 675 - Cafe - "Jain"')
    expect(toPrintable('पनीर')).toBe('????')
    expect(toPrintable(null)).toBe('')
  })

  test('wraps on words, and breaks only a word longer than the line', () => {
    expect(wrap('Paneer Butter Masala with extra cream', 16)).toEqual(['Paneer Butter', 'Masala with', 'extra cream'])
    expect(wrap('ABCDEFGHIJKLMNOPQRST', 8)).toEqual(['ABCDEFGH', 'IJKLMNOP', 'QRST'])
  })

  test('starts by resetting the printer and ends a cut with the cutter command', () => {
    const bytes = createEncoder().init().cut().toBytes()
    expect(Array.from(bytes.slice(0, 5))).toEqual([0x1b, 0x40, 0x1b, 0x74, 0x00])
    expect(Array.from(bytes.slice(-3))).toEqual([0x1d, 0x56, 0x01])
  })

  test('a row puts the value flush right on exactly one line', () => {
    const [row] = visible(createEncoder({ columns: 32 }).row('Subtotal', '572.85').toBytes())
    expect(row).toHaveLength(32)
    expect(row.startsWith('Subtotal')).toBe(true)
    expect(row.endsWith('572.85')).toBe(true)
  })

  test('a long label wraps and the value sits on its last line', () => {
    const lines = visible(createEncoder({ columns: 24 }).row('Chilli Paneer Spring Rolls Large', '219.00').toBytes())
    expect(lines.length).toBeGreaterThan(1)
    expect(lines[lines.length - 1].endsWith('219.00')).toBe(true)
    lines.forEach((l) => expect(l.length).toBeLessThanOrEqual(24))
  })

  test('double-width text has half the room', () => {
    const lines = visible(createEncoder({ columns: 48 }).size(2, 2).line('X'.repeat(30)).toBytes())
    expect(lines).toEqual(['X'.repeat(24), 'X'.repeat(6)])
  })
})

// ── Raster images ────────────────────────────────────────────────────────────
//
// `GS v 0` is the one command here where a mistake is silent and ugly rather than
// absent: xL/xH is the row width in BYTES, not in dots, and getting it wrong prints
// a skewed diagonal smear rather than nothing. So the header is asserted byte by
// byte.
describe('raster images', () => {
  const GS = 0x1d

  const bitmap = (width, height, fill = 0xff) => ({
    width,
    height,
    bytesPerRow: Math.ceil(width / 8),
    data: new Uint8Array(Math.ceil(width / 8) * height).fill(fill),
  })

  it('emits the GS v 0 header with the width in BYTES, not dots', () => {
    const e = createEncoder({ columns: 48 })
    // 384 dots = 48 bytes per row.
    e.raster(bitmap(384, 2))
    const bytes = Array.from(e.toBytes())

    expect(bytes.slice(0, 4)).toEqual([GS, 0x76, 0x30, 0x00])
    // xL, xH — 48, not 384.
    expect(bytes[4]).toBe(48)
    expect(bytes[5]).toBe(0)
    // yL, yH — the height in dots.
    expect(bytes[6]).toBe(2)
    expect(bytes[7]).toBe(0)
    // Then exactly the pixel data, and nothing after it.
    expect(bytes.length).toBe(8 + 48 * 2)
  })

  it('splits a height above 255 across yL and yH', () => {
    const e = createEncoder({ columns: 48 })
    e.raster(bitmap(8, 300))
    const bytes = Array.from(e.toBytes())
    // 300 = 0x012C → low byte 0x2C, high byte 0x01.
    expect(bytes[6]).toBe(0x2c)
    expect(bytes[7]).toBe(0x01)
  })

  // Pixels are pushed raw. Routing them through the text path would run them into
  // toPrintable, which rewrites anything it cannot draw as '?' — every 0x3F byte in
  // the image would become a question mark and the picture would be corrupt.
  it('passes pixel bytes through untouched', () => {
    const e = createEncoder({ columns: 48 })
    const bmp = bitmap(8, 1, 0x00)
    bmp.data[0] = 0xe2 // a byte toPrintable would substitute in text
    e.raster(bmp)
    const bytes = Array.from(e.toBytes())
    expect(bytes[8]).toBe(0xe2)
  })

  // A logo is decoration. escposImage returns null when an image cannot be decoded,
  // and a bill that failed to print because of a picture is a customer at a counter.
  it('emits nothing at all for a missing or malformed bitmap', () => {
    expect(createEncoder({ columns: 48 }).raster(null).toBytes()).toHaveLength(0)
    expect(createEncoder({ columns: 48 }).raster({}).toBytes()).toHaveLength(0)
    expect(createEncoder({ columns: 48 })
      .raster({ width: 8, height: 0, bytesPerRow: 1, data: new Uint8Array() })
      .toBytes()).toHaveLength(0)
  })

  it('is chainable like every other command', () => {
    const e = createEncoder({ columns: 48 })
    expect(e.raster(bitmap(8, 1))).toBe(e)
  })
})
