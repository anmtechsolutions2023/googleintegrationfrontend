import api from '../api/api'
import { fileNameFrom, saveBlob } from './exportService'

// The Menu workspace — /api/menu on the server.
//
// A DISH is one object here: the catalogue item, its price, and its menu entry
// at every branch. Masters (category, unit, diet, tags, variants, add-on
// groups, tax group) are sent by NAME and created by the server when new;
// branches, channels and portals are ids.

const data = (res) => res.data?.data ?? res.data

export const getMenuOptions = async () => data(await api.get('/api/menu/options'))
export const listDishes = async () => data(await api.get('/api/menu/dishes'))
export const getDish = async (itemId) => data(await api.get(`/api/menu/dishes/${encodeURIComponent(itemId)}`))
export const createDish = async (dish) => data(await api.post('/api/menu/dishes', dish))
export const updateDish = async (itemId, dish) => data(await api.put(`/api/menu/dishes/${encodeURIComponent(itemId)}`, dish))
export const bulkDishes = async (body) => data(await api.post('/api/menu/dishes/bulk', body))

export const getDishPhoto = async (itemId) => data(await api.get(`/api/menu/dishes/${encodeURIComponent(itemId)}/photo`))
export const putDishPhoto = async (itemId, dataUri) => data(await api.put(`/api/menu/dishes/${encodeURIComponent(itemId)}/photo`, { dataUri }))
export const deleteDishPhoto = async (itemId) => api.delete(`/api/menu/dishes/${encodeURIComponent(itemId)}/photo`)

/** What a menu file would do. Writes nothing. */
export const previewMenuImport = async (files) => data(await api.post('/api/menu/import/preview', files))
/** Apply a menu file. */
export const applyMenuImport = async (files) => data(await api.post('/api/menu/import/apply', files))

export const getMenuPrices = async () => data(await api.get('/api/menu/prices'))
export const saveMenuPrices = async (changes) => data(await api.put('/api/menu/prices', { changes }))

/** The menu as menu.csv + addons.csv + hours.csv, zipped. Saves it; returns the file name. */
export const backupMenu = async () => {
  const res = await api.get('/api/menu/backup', { responseType: 'blob' })
  const name = fileNameFrom(res, 'menu-backup.zip')
  saveBlob(res.data, name)
  return name
}

/** What clearing would do. Changes nothing. Admins only. */
export const previewClearMenu = async (body) => data(await api.post('/api/menu/clear/preview', body))
/** Clear the menu. Body: { mode: 'hide'|'empty', removeUnused, confirm: 'CLEAR MENU' }. */
export const clearMenu = async (body) => data(await api.post('/api/menu/clear', body))

const menuService = {
  getMenuOptions, listDishes, getDish, createDish, updateDish, bulkDishes,
  getDishPhoto, putDishPhoto, deleteDishPhoto,
  previewMenuImport, applyMenuImport, getMenuPrices, saveMenuPrices,
  backupMenu, previewClearMenu, clearMenu,
}
export default menuService
