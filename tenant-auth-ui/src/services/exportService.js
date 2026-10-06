import api from '../api/api'
import { downloadErrorMessage } from './posService'

// CSV exports — /api/exports on the server.
//
// The server decides who may take which file (each export opens on its own
// screen's scope; customer data needs CUSTOMER:EXPORT). The list below is what
// it offers THIS person, so a screen shows an Export button exactly when the
// server would serve the file — the two cannot disagree.

/** Only the query keys the server knows; empty values are dropped. */
const clean = (params = {}) => Object.fromEntries(
  Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
)

const fileNameFrom = (res, fallback) => {
  const header = res?.headers?.['content-disposition'] || ''
  const match = header.match(/filename="?([^";]+)"?/i)
  return match ? match[1] : fallback
}

const saveBlob = (blob, name) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// One request per signed-in identity, shared by every Export button on the
// page. Keyed on tenant + scopes, so switching tenancy or gaining a permission
// asks again rather than reusing a list that no longer applies.
const catalogueCache = new Map()

/**
 * The exports this person may take.
 * @param {string} cacheKey - Changes whenever the answer could.
 * @returns {Promise<{exports: Array, canUnmask: boolean}>}
 */
export const getExports = (cacheKey = 'default') => {
  if (!catalogueCache.has(cacheKey)) {
    const pending = api.get('/api/exports')
      .then((res) => res.data?.data || { exports: [], canUnmask: false })
      .catch((err) => {
        // A failed read is not cached: the next screen asks again.
        catalogueCache.delete(cacheKey)
        throw err
      })
    catalogueCache.set(cacheKey, pending)
  }
  return catalogueCache.get(cacheKey)
}

/** Test seam — forget every cached list. */
export const clearExportCache = () => catalogueCache.clear()

/** Row count, file name and header row for a query, without the file. */
export const previewExport = async (key, params) => {
  const res = await api.get(`/api/exports/${encodeURIComponent(key)}/preview`, { params: clean(params) })
  return res.data?.data
}

/** Downloads the file and returns its name. */
export const downloadExport = async (key, params) => {
  const res = await api.get(`/api/exports/${encodeURIComponent(key)}`, { params: clean(params), responseType: 'blob' })
  const name = fileNameFrom(res, `${key}.csv`)
  saveBlob(res.data, name)
  return name
}

/** Every Insights report for a period, as one .zip. */
export const downloadReportsBundle = async (params) => {
  const res = await api.get('/api/exports/bundle', { params: clean(params), responseType: 'blob' })
  const name = fileNameFrom(res, 'reports.zip')
  saveBlob(res.data, name)
  return name
}

export { downloadErrorMessage }

const exportService = {
  getExports, clearExportCache, previewExport, downloadExport, downloadReportsBundle, downloadErrorMessage,
}
export default exportService
