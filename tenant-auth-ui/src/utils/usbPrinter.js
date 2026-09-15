// src/utils/usbPrinter.js
//
// A receipt printer on a USB cable, through WebUSB.
//
// WHY NOT WEB SERIAL
// Most USB receipt printers — the KPC307 among them — present themselves as a
// USB printer (interface class 7), not as a serial adapter, so the computer
// makes no serial port for them and Web Serial never lists them. WebUSB talks to
// the printer interface directly and writes ESC/POS to its bulk OUT endpoint.
// A printer behind a USB-to-serial cable is still a serial port: see serialPrinter.js.
//
// WHERE THIS WORKS
//   Chrome or Edge on macOS, ChromeOS, Linux and Android (USB OTG).
//   Windows: only once the printer uses the WinUSB driver — Windows' own
//            printer driver holds the interface and the browser cannot claim it.
//   NOT on iPad / iPhone in any browser.
//
// This module only moves bytes. Connection state, and the words shown when
// something fails, live in bluetoothPrinter.js with the rest of the printer.

const PRINTER_CLASS = 0x07
const VENDOR_CLASS = 0xff

export const usbAvailable = () => typeof navigator !== 'undefined' && !!navigator.usb

/** A label for people, and a key to recognise the same printer after a reload. */
export const describeUsbDevice = (usb) => ({
  key: JSON.stringify({ vendorId: usb.vendorId, productId: usb.productId, serialNumber: usb.serialNumber || '' }),
  label: usb.productName || 'USB printer',
})

/** Shows the browser's USB device list. Must be called from a tap. */
export const chooseUsbDevice = () => navigator.usb.requestDevice({
  filters: [{ classCode: PRINTER_CLASS }, { classCode: VENDOR_CLASS }],
})

/** A printer this browser was allowed before, matched by its saved key; no tap needed. */
export const findGrantedUsbDevice = async (key) => {
  if (!key || !usbAvailable() || typeof navigator.usb.getDevices !== 'function') return null
  const devices = await navigator.usb.getDevices().catch(() => [])
  return devices.find((d) => describeUsbDevice(d).key === key) || null
}

/** The bulk OUT endpoint bytes are printed on — a printer-class interface first. */
const findPrintEndpoint = (configuration) => {
  const candidates = []
  ;(configuration?.interfaces || []).forEach((iface) => {
    iface.alternates.forEach((alternate) => {
      const endpoint = alternate.endpoints.find((e) => e.direction === 'out' && e.type === 'bulk')
      if (endpoint) candidates.push({ iface, alternate, endpoint })
    })
  })
  return candidates.find((c) => c.alternate.interfaceClass === PRINTER_CLASS) || candidates[0] || null
}

export class UsbNoEndpointError extends Error {
  constructor() {
    super('This USB device has no print endpoint')
    this.name = 'UsbNoEndpointError'
  }
}

/** Opens the device, claims its print interface, and returns the endpoint number. */
export const openUsbPrinter = async (usb) => {
  if (!usb.opened) await usb.open()
  if (!usb.configuration) await usb.selectConfiguration(1)
  const found = findPrintEndpoint(usb.configuration)
  if (!found) throw new UsbNoEndpointError()
  const { iface, alternate, endpoint } = found
  if (!iface.claimed) await usb.claimInterface(iface.interfaceNumber)
  if (iface.alternate && iface.alternate.alternateSetting !== alternate.alternateSetting) {
    await usb.selectAlternateInterface(iface.interfaceNumber, alternate.alternateSetting)
  }
  return endpoint.endpointNumber
}

export const closeUsbPrinter = async (usb) => {
  try { await usb.close() } catch { /* already closed or unplugged */ }
}

const pause = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

/** Writes in chunks, with a breath between them for a printer still feeding paper. */
export const writeUsb = async (usb, endpointNumber, bytes, { chunkBytes, pauseMs }) => {
  for (let i = 0; i < bytes.length; i += chunkBytes) {
    // eslint-disable-next-line no-await-in-loop
    const result = await usb.transferOut(endpointNumber, bytes.slice(i, i + chunkBytes))
    if (result && result.status && result.status !== 'ok') throw new Error(`USB transfer ${result.status}`)
    // eslint-disable-next-line no-await-in-loop
    if (pauseMs > 0) await pause(pauseMs)
  }
}
