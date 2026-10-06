// src/utils/zip.js
// A minimal ZIP writer for the browser: STORED entries only, no compression.
//
// The browser port of the backend's utils/zip.js, for the one job that needs
// it here — handing over the sample menu's three CSV files as one download.
// They are a few kilobytes; a compression library would outweigh them.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    table[n] = c >>> 0
  }
  return table
})()

/** CRC-32 of bytes, as the unsigned 32-bit value ZIP stores. */
export const crc32 = (bytes) => {
  let c = 0xFFFFFFFF
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

const dosDateTime = (d) => ({
  time: ((d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)) & 0xFFFF,
  date: (((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF,
})

const UTF8_FLAG = 0x0800

/**
 * Builds a ZIP archive.
 *
 * @param {Array<{name: string, data: string|Uint8Array}>} entries - Strings are written as UTF-8.
 * @param {Date} [modified]
 * @returns {Uint8Array}
 */
export const buildZip = (entries, modified = new Date()) => {
  const enc = new TextEncoder()
  const { time, date } = dosDateTime(modified)
  const parts = []
  const centrals = []
  let offset = 0

  entries.forEach(({ name, data }) => {
    const nameBytes = enc.encode(name)
    const body = typeof data === 'string' ? enc.encode(data) : data
    const crc = crc32(body)

    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, UTF8_FLAG, true)
    local.setUint16(8, 0, true)
    local.setUint16(10, time, true)
    local.setUint16(12, date, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, body.length, true)
    local.setUint32(22, body.length, true)
    local.setUint16(26, nameBytes.length, true)
    local.setUint16(28, 0, true)

    const central = new DataView(new ArrayBuffer(46))
    central.setUint32(0, 0x02014b50, true)
    central.setUint16(4, 20, true)
    central.setUint16(6, 20, true)
    central.setUint16(8, UTF8_FLAG, true)
    central.setUint16(10, 0, true)
    central.setUint16(12, time, true)
    central.setUint16(14, date, true)
    central.setUint32(16, crc, true)
    central.setUint32(20, body.length, true)
    central.setUint32(24, body.length, true)
    central.setUint16(28, nameBytes.length, true)
    central.setUint32(42, offset, true)

    parts.push(new Uint8Array(local.buffer), nameBytes, body)
    centrals.push(new Uint8Array(central.buffer), nameBytes)
    offset += 30 + nameBytes.length + body.length
  })

  const centralSize = centrals.reduce((n, b) => n + b.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, entries.length, true)
  end.setUint16(10, entries.length, true)
  end.setUint32(12, centralSize, true)
  end.setUint32(16, offset, true)

  const all = [...parts, ...centrals, new Uint8Array(end.buffer)]
  const out = new Uint8Array(all.reduce((n, b) => n + b.length, 0))
  let at = 0
  all.forEach((b) => { out.set(b, at); at += b.length })
  return out
}

export default buildZip
