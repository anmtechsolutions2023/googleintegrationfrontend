// src/utils/bluetoothPrinter.js
//
// The receipt printer on this device, reached one of three ways:
//   - Bluetooth Low Energy, through Web Bluetooth (below);
//   - a serial port — Bluetooth Classic, or a USB-to-serial cable — through
//     Web Serial (serialPrinter.js);
//   - a USB printer on a cable, through WebUSB (usbPrinter.js).
// All three share the state every screen shows, so the till button, the
// settings card and printing itself need not care which one is in use.
//
// WHERE BLE WORKS
//   Chrome or Edge on Android, Windows, macOS, ChromeOS — built in.
//   iPad / iPhone — NOT in Safari or Chrome: iOS gives websites no Bluetooth.
//                   A Web Bluetooth browser such as Bluefy does.
// Only on a secure page (https, or localhost while developing), and choosing the
// printer needs a tap: a website may not scan for devices on its own.
//
// A PRINTER MISSING FROM THE BLE LIST
// is usually Bluetooth Classic, or already connected to the computer. Web
// Bluetooth cannot see it; the serial or USB mode reaches it.
//
// WHICH BLE CHANNEL
// There is no standard "printer" service over BLE. Each module maker exposes a
// serial-like service of its own, with one characteristic that takes bytes. The
// common ones are listed below and the first writable characteristic found is
// used. A printer that exposes none of them can still work: its service UUID
// (read with a scanner app such as nRF Connect) is entered in settings and
// tried first.
//
// THE CONNECTION IS PER DEVICE, NOT PER ACCOUNT
// The printer is a thing on this counter, so the choice is kept in this
// browser's storage, never on the server. The live connection itself cannot
// survive a page reload — the browser drops it — so the choice is remembered and
// reconnecting is one tap (or none, where the browser still holds permission).

import {
  choosePort, closePort, describePort, findGrantedPort, isPortOpen, openPort, serialAvailable, writePort,
} from './serialPrinter'
import {
  UsbNoEndpointError, chooseUsbDevice, closeUsbPrinter, describeUsbDevice, findGrantedUsbDevice,
  openUsbPrinter, usbAvailable, writeUsb,
} from './usbPrinter'

export const PRINTER_MODE = Object.freeze({
  BROWSER: 'browser', BLUETOOTH: 'bluetooth', SERIAL: 'serial', USB: 'usb',
})

const STORAGE = {
  mode: 'pos.printer.mode',
  name: 'pos.printer.name',
  service: 'pos.printer.serviceUuid',
  serialName: 'pos.printer.serialName',
  serialPort: 'pos.printer.serialPort',
  usbName: 'pos.printer.usbName',
  usbDevice: 'pos.printer.usbDevice',
}

export const KNOWN_PRINTER_SERVICES = Object.freeze([
  '000018f0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
  '0000ae30-0000-1000-8000-00805f9b34fb',
])

// Small writes with a breath between them. A BLE packet carries a few hundred
// bytes at best, and a printer that is still feeding paper drops what it
// cannot buffer — which prints as a bill with a line missing, not an error.
const CHUNK_BYTES = 100
const PAUSE_MS = 20

const read = (key) => {
  try { return window.localStorage.getItem(key) } catch { return null }
}
const write = (key, value) => {
  try {
    if (value === null || value === undefined || value === '') window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch { /* storage unavailable: the setting lasts for this page only */ }
}

// ── Errors people can act on ────────────────────────────────────────────────
export class PrinterError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'PrinterError'
    this.code = code
  }
}

const MESSAGES = {
  unsupported: 'This browser cannot use Bluetooth. On an iPad open Restro OS in the Bluefy browser; on Android or a computer use Chrome or Edge.',
  serialUnsupported: 'This browser cannot open serial printers. Use Chrome or Edge on a Windows, Mac, Linux or ChromeOS computer. An iPad or iPhone cannot — it needs a Bluetooth Low Energy printer.',
  usbUnsupported: 'This browser cannot reach USB printers. Use Chrome or Edge on a computer or an Android tablet. An iPad or iPhone cannot — it needs a Bluetooth Low Energy printer.',
  insecure: 'Printers can only be reached from a secure page. Open Restro OS from its https address.',
  cancelled: 'No printer was chosen.',
  noChannel: 'Connected, but the printer offers no print channel this app recognises. Enter its BLE service UUID under “Printer not found or not printing?” and connect again.',
  notConnected: 'The receipt printer is not connected. Tap Connect printer, then print again.',
  unreachable: 'Could not reach the printer. Check it is switched on, nearby, and not connected to another device.',
  portBusy: 'Found the printer but could not open it. Check it is switched on and paired, close any other tab or app using it, then connect again.',
  usbBusy: 'Found the USB printer but could not use it. Unplug it and plug it back in, close any other tab using it, then connect again. On Windows the printer needs the WinUSB driver.',
  usbNoEndpoint: 'That USB device is not a printer this app can print to. Choose the receipt printer in the list.',
  writeFailed: 'The printer stopped responding part-way. Check the paper and the connection, then print again.',
}

/** Words for any failure this module or the browser can throw. */
export const printerErrorMessage = (error) => {
  if (error instanceof PrinterError) return error.message
  const name = error?.name
  if (name === 'NotFoundError') return MESSAGES.cancelled
  if (name === 'SecurityError') return MESSAGES.insecure
  return MESSAGES.unreachable
}

/** The browser's own reason, appended so "busy" can be told apart from "gone". */
const withReason = (message, error) => (error?.message ? `${message} (${error.name}: ${error.message})` : message)

// ── Settings ────────────────────────────────────────────────────────────────
const MODES = Object.values(PRINTER_MODE)

export const getPrinterMode = () => {
  const saved = read(STORAGE.mode)
  return MODES.includes(saved) ? saved : PRINTER_MODE.BROWSER
}

/** True when this device prints straight to a receipt printer rather than the dialog. */
export const isDirectPrinterMode = (mode) => MODES.includes(mode) && mode !== PRINTER_MODE.BROWSER

const nameKey = (mode) => {
  if (mode === PRINTER_MODE.SERIAL) return STORAGE.serialName
  if (mode === PRINTER_MODE.USB) return STORAGE.usbName
  return STORAGE.name
}

/** A 16-bit short form ("18f0") or a full UUID, lower-cased; null otherwise. */
export const normaliseServiceUuid = (value) => {
  const s = String(value || '').trim().toLowerCase().replace(/^0x/, '')
  if (/^[0-9a-f]{4}$/.test(s)) return `0000${s}-0000-1000-8000-00805f9b34fb`
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s)) return s
  return null
}

export const getServiceUuid = () => normaliseServiceUuid(read(STORAGE.service)) || ''

const insecurePage = () => typeof window !== 'undefined' && window.isSecureContext === false

const supportFrom = (available, unsupportedMessage) => {
  if (!available) return { ok: false, reason: 'unsupported', message: unsupportedMessage }
  if (insecurePage()) return { ok: false, reason: 'insecure', message: MESSAGES.insecure }
  return { ok: true, reason: null, message: null }
}

export const bluetoothSupport = () => supportFrom(typeof navigator !== 'undefined' && !!navigator.bluetooth, MESSAGES.unsupported)
export const serialSupport = () => supportFrom(serialAvailable(), MESSAGES.serialUnsupported)
export const usbSupport = () => supportFrom(usbAvailable(), MESSAGES.usbUnsupported)

/** Whether this browser can reach the kind of printer `mode` names. */
export const printerSupport = (mode) => {
  if (mode === PRINTER_MODE.SERIAL) return serialSupport()
  if (mode === PRINTER_MODE.USB) return usbSupport()
  return bluetoothSupport()
}

// ── State, for the screens that show it ─────────────────────────────────────
let device = null
let characteristic = null
let port = null
let usbDevice = null
let usbEndpoint = null
const initialState = () => {
  const mode = getPrinterMode()
  return { mode, status: 'disconnected', name: read(nameKey(mode)) || '', error: null }
}
let state = initialState()
const listeners = new Set()

const setState = (patch) => {
  state = { ...state, ...patch }
  listeners.forEach((fn) => fn(state))
}

export const getPrinterState = () => state

/** Calls `fn` with the state now and after every change; returns unsubscribe. */
export const subscribePrinter = (fn) => {
  listeners.add(fn)
  fn(state)
  return () => listeners.delete(fn)
}

const onDisconnected = () => {
  characteristic = null
  setState({ status: 'disconnected' })
}

const onPortLost = () => setState({ status: 'disconnected' })

// An unplugged USB device never comes back as the same object: plugging it in
// again makes a new one, found through getDevices().
const onUsbLost = (event) => {
  if (!usbDevice || event?.device !== usbDevice) return
  usbDevice = null
  usbEndpoint = null
  setState({ status: 'disconnected' })
}

/** Lets go of any live connection, of any kind, without forgetting the choice. */
const dropConnections = () => {
  if (device) {
    device.removeEventListener('gattserverdisconnected', onDisconnected)
    try { if (device.gatt?.connected) device.gatt.disconnect() } catch { /* already gone */ }
  }
  if (port) {
    port.removeEventListener?.('disconnect', onPortLost)
    if (isPortOpen(port)) closePort(port)
  }
  if (usbDevice) {
    if (usbDevice.opened) closeUsbPrinter(usbDevice)
  }
  if (usbAvailable()) navigator.usb.removeEventListener?.('disconnect', onUsbLost)
  device = null
  characteristic = null
  port = null
  usbDevice = null
  usbEndpoint = null
}

export const setPrinterMode = (mode) => {
  const next = MODES.includes(mode) ? mode : PRINTER_MODE.BROWSER
  write(STORAGE.mode, next === PRINTER_MODE.BROWSER ? null : next)
  if (next === state.mode) return
  dropConnections()
  setState({ mode: next, status: 'disconnected', name: read(nameKey(next)) || '', error: null })
}

export const setServiceUuid = (value) => {
  const uuid = normaliseServiceUuid(value)
  write(STORAGE.service, uuid)
  return uuid || ''
}

const servicesToTry = () => {
  const custom = getServiceUuid()
  return custom ? [custom, ...KNOWN_PRINTER_SERVICES.filter((u) => u !== custom)] : [...KNOWN_PRINTER_SERVICES]
}

const isConnected = () => {
  if (state.mode === PRINTER_MODE.SERIAL) return isPortOpen(port)
  if (state.mode === PRINTER_MODE.USB) return !!(usbDevice?.opened && usbEndpoint !== null)
  return !!(device && characteristic)
}

// ── Bluetooth Low Energy ────────────────────────────────────────────────────
/** The first characteristic that takes writes, in the order services are listed. */
const findWritable = async (server, services) => {
  for (const uuid of services) {
    // eslint-disable-next-line no-await-in-loop
    const service = await server.getPrimaryService(uuid).catch(() => null)
    if (service) {
      // eslint-disable-next-line no-await-in-loop
      const chars = await service.getCharacteristics().catch(() => [])
      const writable = chars.find((c) => c.properties && (c.properties.writeWithoutResponse || c.properties.write))
      if (writable) return writable
    }
  }
  return null
}

const attach = async (chosen) => {
  const server = await chosen.gatt.connect()
  const found = await findWritable(server, servicesToTry())
  if (!found) {
    try { chosen.gatt.disconnect() } catch { /* already gone */ }
    throw new PrinterError('noChannel', MESSAGES.noChannel)
  }
  if (device && device !== chosen) device.removeEventListener('gattserverdisconnected', onDisconnected)
  chosen.removeEventListener('gattserverdisconnected', onDisconnected)
  chosen.addEventListener('gattserverdisconnected', onDisconnected)
  device = chosen
  characteristic = found
  const name = chosen.name || 'Bluetooth printer'
  write(STORAGE.name, name)
  setState({ status: 'connected', name, error: null })
}

// ── Serial (Bluetooth Classic, USB-to-serial) ───────────────────────────────
const attachPort = async (chosen) => {
  try {
    await openPort(chosen)
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Serial printer port did not open', error)
    throw new PrinterError('portBusy', withReason(MESSAGES.portBusy, error))
  }
  if (port && port !== chosen) {
    port.removeEventListener?.('disconnect', onPortLost)
    closePort(port)
  }
  chosen.removeEventListener?.('disconnect', onPortLost)
  chosen.addEventListener?.('disconnect', onPortLost)
  port = chosen
  const { key, label } = describePort(chosen)
  write(STORAGE.serialPort, key)
  write(STORAGE.serialName, label)
  setState({ status: 'connected', name: label, error: null })
}

// ── USB printer ─────────────────────────────────────────────────────────────
const attachUsb = async (chosen) => {
  let endpoint
  try {
    endpoint = await openUsbPrinter(chosen)
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('USB printer did not open', error)
    if (error instanceof UsbNoEndpointError) throw new PrinterError('usbNoEndpoint', MESSAGES.usbNoEndpoint)
    throw new PrinterError('usbBusy', withReason(MESSAGES.usbBusy, error))
  }
  if (usbDevice && usbDevice !== chosen && usbDevice.opened) closeUsbPrinter(usbDevice)
  navigator.usb.removeEventListener?.('disconnect', onUsbLost)
  navigator.usb.addEventListener?.('disconnect', onUsbLost)
  usbDevice = chosen
  usbEndpoint = endpoint
  const { key, label } = describeUsbDevice(chosen)
  write(STORAGE.usbDevice, key)
  write(STORAGE.usbName, label)
  setState({ status: 'connected', name: label, error: null })
}

/**
 * Asks the browser to show nearby devices (or serial ports, or USB devices) and
 * connects to the one chosen. Must be called from a tap.
 */
export const connectPrinter = async () => {
  const { mode } = state
  const support = printerSupport(mode)
  if (!support.ok) throw new PrinterError(support.reason, support.message)
  setState({ status: 'connecting', error: null })
  try {
    if (mode === PRINTER_MODE.SERIAL) {
      await attachPort(await choosePort())
    } else if (mode === PRINTER_MODE.USB) {
      await attachUsb(await chooseUsbDevice())
    } else {
      const chosen = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: servicesToTry(),
      })
      await attach(chosen)
    }
    return state
  } catch (error) {
    const message = printerErrorMessage(error)
    setState({ status: isConnected() ? 'connected' : 'disconnected', error: message })
    throw error instanceof PrinterError ? error : new PrinterError(error?.name || 'failed', message)
  }
}

/** Opens `candidate` with `attachFn`, showing the state while it does. */
const reattach = async (candidate, attachFn) => {
  if (!candidate) throw new PrinterError('notConnected', MESSAGES.notConnected)
  setState({ status: 'connecting' })
  try {
    await attachFn(candidate)
  } catch (error) {
    setState({ status: 'disconnected' })
    if (error instanceof PrinterError) throw error
    throw new PrinterError('notConnected', MESSAGES.notConnected)
  }
}

/**
 * A connection to write to. Reconnects silently to a printer chosen earlier in
 * this page's life, or one the browser remembers — neither needs a tap.
 */
const ensureConnected = async () => {
  if (isConnected() && (state.mode !== PRINTER_MODE.BLUETOOTH || device?.gatt?.connected)) return

  if (state.mode === PRINTER_MODE.SERIAL) {
    await reattach(port || await findGrantedPort(read(STORAGE.serialPort)), attachPort)
    return
  }
  if (state.mode === PRINTER_MODE.USB) {
    await reattach(usbDevice || await findGrantedUsbDevice(read(STORAGE.usbDevice)), attachUsb)
    return
  }

  let candidate = device
  if (!candidate && typeof navigator !== 'undefined' && navigator.bluetooth?.getDevices) {
    const known = await navigator.bluetooth.getDevices().catch(() => [])
    const name = read(STORAGE.name)
    candidate = known.find((d) => d.name && d.name === name) || null
  }
  await reattach(candidate, attach)
}

const pause = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

/**
 * Sends bytes to the printer, reconnecting first when it can.
 * @param {Uint8Array} bytes
 * @param {{chunkBytes?:number, pauseMs?:number}} [opts]
 */
export const sendToPrinter = async (bytes, { chunkBytes = CHUNK_BYTES, pauseMs = PAUSE_MS } = {}) => {
  await ensureConnected()

  if (state.mode === PRINTER_MODE.SERIAL || state.mode === PRINTER_MODE.USB) {
    try {
      if (state.mode === PRINTER_MODE.SERIAL) await writePort(port, bytes, { chunkBytes, pauseMs })
      else await writeUsb(usbDevice, usbEndpoint, bytes, { chunkBytes, pauseMs })
    } catch {
      throw new PrinterError('writeFailed', MESSAGES.writeFailed)
    }
    return
  }

  const target = characteristic
  const withoutResponse = !!target.properties.writeWithoutResponse && typeof target.writeValueWithoutResponse === 'function'
  try {
    for (let i = 0; i < bytes.length; i += chunkBytes) {
      const chunk = bytes.slice(i, i + chunkBytes)
      if (withoutResponse) {
        // eslint-disable-next-line no-await-in-loop
        await target.writeValueWithoutResponse(chunk)
        // eslint-disable-next-line no-await-in-loop
        if (pauseMs > 0) await pause(pauseMs)
      } else if (typeof target.writeValueWithResponse === 'function') {
        // eslint-disable-next-line no-await-in-loop
        await target.writeValueWithResponse(chunk)
      } else {
        // eslint-disable-next-line no-await-in-loop
        await target.writeValue(chunk)
      }
    }
  } catch {
    throw new PrinterError('writeFailed', MESSAGES.writeFailed)
  }
}

/** Drops the connection and forgets this mode's printer on this device. */
export const disconnectPrinter = () => {
  dropConnections()
  if (state.mode === PRINTER_MODE.SERIAL) {
    write(STORAGE.serialName, null)
    write(STORAGE.serialPort, null)
  } else if (state.mode === PRINTER_MODE.USB) {
    write(STORAGE.usbName, null)
    write(STORAGE.usbDevice, null)
  } else {
    write(STORAGE.name, null)
  }
  setState({ status: 'disconnected', name: '', error: null })
}

/** Test seam: forget everything held in memory. */
export const resetPrinterForTests = () => {
  device = null
  characteristic = null
  port = null
  usbDevice = null
  usbEndpoint = null
  listeners.clear()
  state = initialState()
}
