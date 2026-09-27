// src/utils/escposImage.js
//
// Turning a logo into something a thermal printer can print.
//
// THE PROBLEM
// A receipt printer has ONE ink and no greys. It takes a bitmap where each bit is
// "burn this dot" or "do not", and a PNG has 24 bits of colour per pixel plus an
// alpha channel. Something has to decide, per dot, black or white — and doing that
// badly is what makes a logo come out as a solid black rectangle or as nothing at
// all.
//
// WHY DITHERING RATHER THAN A THRESHOLD
// A plain threshold ("darker than halfway? burn it") is one line of code and looks
// terrible: every gradient becomes a hard edge, and a logo with any shading turns
// into a blob. Floyd–Steinberg pushes each pixel's rounding error onto its
// neighbours, so a grey area becomes a fine pattern of dots that reads as grey from
// reading distance. It is the standard answer and it is about fifteen lines.
//
// WHY IN THE BROWSER
// The canvas already decodes PNG and JPEG, scales with a decent filter and hands
// back raw pixels. Doing this server-side would mean an image library, a build
// step for its native bindings, and storing a second representation of every logo
// that would then have to be regenerated whenever the paper width changed. The
// browser that is about to print is the right place to decide what printing means.

/** The 0x80 bit is the leftmost dot of each byte — MSB-first, as GS v 0 expects. */
const MSB = 0x80

/**
 * Decodes an image URL to pixels, scaled to fit a dot width.
 *
 * @param {string} url - An image URL or data URI.
 * @param {number} maxWidthDots - Paper width in dots (384 for 80mm, 320 for 58mm).
 * @returns {Promise<{width:number, height:number, data:Uint8ClampedArray}>} RGBA.
 */
const loadPixels = (url, maxWidthDots) => new Promise((resolve, reject) => {
  const img = new Image()
  // The image comes from our own API on a different origin in development, and a
  // tainted canvas cannot be read back — getImageData throws a SecurityError. This
  // asks for the CORS headers that keep it readable.
  img.crossOrigin = 'anonymous'
  img.onerror = () => reject(new Error('The image could not be loaded'))
  img.onload = () => {
    // Never scale UP. Enlarging a small logo to fill the paper prints a blocky
    // mess, and the width is a ceiling rather than a target.
    const scale = Math.min(1, maxWidthDots / img.naturalWidth)
    const width = Math.max(1, Math.floor(img.naturalWidth * scale))
    const height = Math.max(1, Math.floor(img.naturalHeight * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')

    // Paper is white. A PNG's transparent background would otherwise read as
    // black — alpha 0 is "no colour", and a logo on a transparent background is
    // the common case — so the sheet is filled first and the image composited over.
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)

    try {
      const { data } = ctx.getImageData(0, 0, width, height)
      resolve({ width, height, data })
    } catch (err) {
      reject(new Error('The image could not be read for printing'))
    }
  }
  img.src = url
})

/**
 * Greyscale, using the Rec. 601 luma weights.
 *
 * Not a plain average: the eye is far more sensitive to green than to blue, so
 * averaging turns a mid-green logo nearly black and a mid-blue one nearly white.
 *
 * @param {Uint8ClampedArray} rgba
 * @returns {Float32Array} One luminance per pixel, 0–255.
 */
const toGrey = (rgba) => {
  const grey = new Float32Array(rgba.length / 4)
  for (let i = 0, p = 0; i < rgba.length; i += 4, p += 1) {
    grey[p] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]
  }
  return grey
}

/**
 * Floyd–Steinberg dither to 1 bit, packed for `GS v 0`.
 *
 * The error from rounding each pixel is distributed to the four neighbours that
 * have not been visited yet, in the proportions 7/16 right, 3/16 below-left,
 * 5/16 below, 1/16 below-right. Those weights are the algorithm; they are not
 * tunable parameters.
 *
 * @param {{width:number, height:number, data:Uint8ClampedArray}} pixels
 * @returns {{width:number, height:number, bytesPerRow:number, data:Uint8Array}}
 */
const dither = ({ width, height, data }) => {
  const grey = toGrey(data)
  // Rows are byte-aligned: 385 dots still costs 49 bytes, and the spare bits at
  // the end stay white.
  const bytesPerRow = Math.ceil(width / 8)
  const out = new Uint8Array(bytesPerRow * height)

  const at = (x, y) => y * width + x
  const spread = (x, y, err, factor) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return
    grey[at(x, y)] += err * factor
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const old = grey[at(x, y)]
      // Below halfway is ink. `black` is what we decided; `err` is what we owe the
      // neighbours for deciding it.
      const black = old < 128
      const err = old - (black ? 0 : 255)
      if (black) out[y * bytesPerRow + (x >> 3)] |= MSB >> (x & 7)

      spread(x + 1, y, err, 7 / 16)
      spread(x - 1, y + 1, err, 3 / 16)
      spread(x, y + 1, err, 5 / 16)
      spread(x + 1, y + 1, err, 1 / 16)
    }
  }

  return { width, height, bytesPerRow, data: out }
}

/**
 * An image URL, ready for `encoder.raster()`.
 *
 * Returns null rather than throwing. A logo is decoration: a bill with no logo is
 * a bill, and a bill that did not print because the logo failed is a customer
 * standing at a counter. Every caller treats null as "skip this line".
 *
 * @param {string} url
 * @param {number} maxWidthDots
 * @returns {Promise<Object|null>}
 */
export const bitmapFor = async (url, maxWidthDots) => {
  if (!url) return null
  try {
    return dither(await loadPixels(url, maxWidthDots))
  } catch {
    return null
  }
}

/**
 * Dots across the printable area.
 *
 * NOT the same as the character columns in escpos.columnsFor: the standard font is
 * 12 dots wide, so 48 columns is 576 dots — but 576 is the FULL head width, and
 * printing edge to edge leaves a logo touching the paper's edge. These are the
 * widths a logo is scaled to.
 */
export const printDotsFor = (paperWidth) => (String(paperWidth) === '58' ? 320 : 384)

const escposImage = { bitmapFor, printDotsFor }

export default escposImage
