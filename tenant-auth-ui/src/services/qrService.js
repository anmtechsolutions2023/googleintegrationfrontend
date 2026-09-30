// src/services/qrService.js
// Staff side of QR table ordering: table codes, the branch switch, the diner
// limits, and the review queue of orders guests placed from their phones.
// Every call goes through the staff API client, so scopes are enforced by the
// server (POS_QR / POS_ORDER — see the backend's posqr.routes.js).

import api from '../api/api'
import { QR, PUBLIC_DINE_ORIGIN } from '../config/config'

const data = (res) => res.data?.data ?? res.data

/** The address a table's QR code encodes. */
export const dineUrlFor = (token) => `${PUBLIC_DINE_ORIGIN}/t/${token}`

/** Every table in a branch with its code (the server issues missing ones). */
export const getCodes = (branchId) => api.get(QR.CODES, { params: { branchId } }).then(data)

export const rotateCode = (tableId) => api.post(QR.rotate(tableId)).then(data)

export const getSettings = (branchId) => api.get(QR.SETTINGS, { params: { branchId } }).then(data)

export const updateSettings = (branchId, patch) =>
  api.put(QR.SETTINGS, patch, { params: { branchId } }).then(data)

export const getLimits = () => api.get(QR.LIMITS).then(data)

/** Orders guests placed that nobody has accepted or rejected. */
export const getPendingOrders = (branchId) =>
  api.get(QR.PENDING, { params: branchId ? { branchId } : {} }).then(data)

export const getRejectionReasons = () => api.get(QR.REJECTION_REASONS).then(data)

export const acceptOrder = (orderId) => api.post(QR.accept(orderId)).then(data)

export const rejectOrder = (orderId, { reasonId, note }) =>
  api.post(QR.reject(orderId), { reasonId, ...(note ? { note } : {}) }).then(data)

const qrService = {
  dineUrlFor, getCodes, rotateCode, getSettings, updateSettings, getLimits,
  getPendingOrders, getRejectionReasons, acceptOrder, rejectOrder,
}

export default qrService
