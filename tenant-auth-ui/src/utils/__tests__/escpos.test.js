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
