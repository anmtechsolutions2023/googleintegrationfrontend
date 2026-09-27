// src/utils/imageDownscale.js
//
// Getting a picture a user chose down to something worth storing.
//
// WHY THE CLIENT DOES THIS
// The image is destined for a receipt printer: 384 dots across an 80mm roll, one
// ink, no greys. A 4MB phone photo carries nothing the paper can use. Uploading it
// anyway would spend a restaurant's mobile data on detail that is thrown away at
// print time, and would put a multi-megabyte body through the API for no gain.
//
// THE SERVER STILL CHECKS EVERYTHING. This is a courtesy to the network, not a
// security boundary — a caller can skip it entirely. posmedia.service re-reads the
// type from the magic bytes and re-measures the dimensions and the size, and
// refuses what it does not like. See its note on why the declared MIME is ignored.
//
// WHY PNG OUT
// A logo is flat colour and hard edges, which is what PNG is good at and what JPEG
// puts ringing artefacts around. Those artefacts survive dithering as speckle
// around every letter. A photographic QR is the same story: JPEG noise in a QR is
// noise in the error correction.

/** What the thermal head can use. Matches MEDIA.PRINT_WIDTH_PX on the server. */
export const PRINT_WIDTH_PX = 384

/** The server's ceiling, restated so the message can be shown before uploading. */
export const MAX_BYTES = 512 * 1024

const ACCEPTED = ['image/png', 'image/jpeg']

/** Human bytes, for a message somebody has to act on. */
export const describeSize = (bytes) => (bytes >= 1024 * 1024
  ? `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  : `${Math.max(1, Math.round(bytes / 1024))}KB`)

/**
 * Reads a File into a data URI.
 * @param {File} file
 * @returns {Promise<string>}
 */
const readFile = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onerror = () => reject(new Error('That file could not be read'))
  reader.onload = () => resolve(String(reader.result))
  reader.readAsDataURL(file)
})

/**
 * Loads a data URI into an Image.
 * @param {string} dataUri
 * @returns {Promise<HTMLImageElement>}
 */
const loadImage = (dataUri) => new Promise((resolve, reject) => {
  const img = new Image()
  img.onerror = () => reject(new Error('That file is not an image we can read'))
  img.onload = () => resolve(img)
  img.src = dataUri
})

/**
 * A file the user chose, ready to upload.
 *
 * @param {File} file
 * @param {Object} [opts]
 * @param {number} [opts.maxWidth] - Dots to fit within. Defaults to PRINT_WIDTH_PX.
 * @returns {Promise<{dataUri:string, width:number, height:number, byteSize:number}>}
 * @throws {Error} With a message written for the person who picked the file.
 */
export const prepareImage = async (file, { maxWidth = PRINT_WIDTH_PX } = {}) => {
  if (!file) throw new Error('No file chosen')

  // Checked before reading: rejecting a 12MB video after decoding it to base64 is
  // a slow way to say no.
  if (!ACCEPTED.includes(file.type)) {
    throw new Error('Please choose a PNG or JPEG image')
  }
  // Generous — the downscale below usually brings a large photo well under the
  // ceiling, so this only rejects what is implausible as a logo.
  if (file.size > 12 * 1024 * 1024) {
    throw new Error(`That image is ${describeSize(file.size)}. Please choose one under 12MB.`)
  }

  const img = await loadImage(await readFile(file))

  // Never scale UP: a 64px logo enlarged to 384 prints as blocks. Small is fine —
  // the printer's resolution is the limit, not ours.
  const scale = Math.min(1, maxWidth / img.naturalWidth)
  const width = Math.max(1, Math.round(img.naturalWidth * scale))
  const height = Math.max(1, Math.round(img.naturalHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  // Paper is white, and a transparent PNG background would otherwise be read as
  // black when the printer dithers it — alpha 0 means "no colour", not "white".
  // Flattening here means the preview on screen matches what comes out.
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, width, height)

  const dataUri = canvas.toDataURL('image/png')
  // The base64 payload's real decoded length, so the check matches the server's.
  const byteSize = Math.floor(((dataUri.length - dataUri.indexOf(',') - 1) * 3) / 4)

  if (byteSize > MAX_BYTES) {
    throw new Error(
      `That image is still ${describeSize(byteSize)} after resizing. `
      + 'Please use a simpler image — a logo needs flat colour, not a photograph.',
    )
  }

  return { dataUri, width, height, byteSize }
}

const imageDownscale = { prepareImage, describeSize, PRINT_WIDTH_PX, MAX_BYTES }

export default imageDownscale
