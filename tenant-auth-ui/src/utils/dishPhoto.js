// src/utils/dishPhoto.js
//
// Dish photos in the browser: making the two sizes the server keeps, and
// showing them to staff.
//
// TWO SIZES, MADE HERE
//   photo — 1000px JPEG, for the dish sheet, the editor and (later) portals.
//   thumb — 480px JPEG under 96KB, for lists: the guest's QR menu, the Dishes
//           list and the till's picture tiles. A menu of thirty dishes then
//           costs about 750KB on a guest's phone instead of fifteen megabytes.
// The server re-reads and re-measures both (menu.service.validateThumb); this
// is a courtesy to the network, not a check.
//
// SHOWING THEM TO STAFF
// Staff requests carry a bearer token, which an <img src> cannot send, so a
// photo is fetched once as a blob and shown from an object URL. The URL carries
// the photo's version, so the browser's own cache answers repeat visits and a
// replaced photo is fetched again. Object URLs are kept for the session — a
// menu's worth of thumbnails is a few megabytes at most.

import api from '../api/api'

export const PHOTO_MAX_PX = 1000
export const THUMB_MAX_PX = 480
export const THUMB_MAX_BYTES = 96 * 1024

const readImage = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onerror = () => reject(new Error(`${file.name || 'That file'} could not be read.`))
  reader.onload = () => {
    const img = new Image()
    img.onerror = () => reject(new Error(`${file.name || 'That file'} is not an image this browser can open.`))
    img.onload = () => resolve(img)
    img.src = String(reader.result)
  }
  reader.readAsDataURL(file)
})

const drawAt = (img, maxPx, quality) => {
  const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.width * scale))
  canvas.height = Math.max(1, Math.round(img.height * scale))
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}

/** Decoded bytes of a base64 data URI. */
export const dataUriBytes = (uri) => {
  const b64 = String(uri).split(',')[1] || ''
  return Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0)
}

/**
 * A chosen picture, as the photo and its list thumbnail.
 *
 * @param {File} file
 * @returns {Promise<{dataUri: string, thumbDataUri: string}>}
 */
export const preparePhoto = async (file) => {
  const img = await readImage(file)
  const dataUri = drawAt(img, PHOTO_MAX_PX, 0.85)
  let thumbDataUri = drawAt(img, THUMB_MAX_PX, 0.8)
  // A busy picture can come out over the cap; step the quality down.
  for (let q = 0.7; dataUriBytes(thumbDataUri) > THUMB_MAX_BYTES && q > 0.3; q -= 0.1) {
    thumbDataUri = drawAt(img, THUMB_MAX_PX, q)
  }
  return { dataUri, thumbDataUri }
}

const cache = new Map()

/**
 * An object URL for a dish photo, fetched once per version.
 *
 * @param {string} itemId - itemdetail id.
 * @param {number} version - The dish's photoVersion.
 * @param {'thumb'|'full'} [size]
 * @returns {Promise<string>}
 */
export const staffPhotoUrl = (itemId, version, size = 'thumb') => {
  const key = `${itemId}:${version}:${size}`
  if (!cache.has(key)) {
    const pending = api.get(`/api/menu/photos/${encodeURIComponent(itemId)}`, {
      params: { size, v: version }, responseType: 'blob',
    })
      .then((res) => URL.createObjectURL(res.data))
      .catch((err) => {
        cache.delete(key)
        throw err
      })
    cache.set(key, pending)
  }
  return cache.get(key)
}

/** Test seam. */
export const clearPhotoCache = () => cache.clear()

/** Lower case, letters and digits only — how a file name is matched to a dish. */
export const slug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '')

/**
 * Which dish a photo file is for, from its name: the dish code (MNS-01.jpg)
 * first, then the dish name (butter-chicken.jpg).
 *
 * @param {string} fileName
 * @param {Array<{itemId: string, code?: string, name: string}>} dishes
 * @returns {{dish: Object, by: 'code'|'name'}|null}
 */
export const matchPhotoFile = (fileName, dishes) => {
  const base = slug(String(fileName).replace(/\.[^.]+$/, ''))
  if (!base) return null
  const byCode = dishes.find((d) => d.code && slug(d.code) === base)
  if (byCode) return { dish: byCode, by: 'code' }
  const byName = dishes.find((d) => slug(d.name) === base)
  return byName ? { dish: byName, by: 'name' } : null
}
