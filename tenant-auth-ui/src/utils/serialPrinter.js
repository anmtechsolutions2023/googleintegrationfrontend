// src/utils/serialPrinter.js
//
// A receipt printer reached as a serial port, through Web Serial.
//
// WHY THIS SITS BESIDE bluetoothPrinter.js
// Many thermal printers — the KPC307 among them — speak Bluetooth Classic, not
// Bluetooth Low Energy. Web Bluetooth cannot see those at all: they never appear
// in its list. Web Serial can reach them, either through the serial port the
// computer creates when it pairs the printer, or by opening the Bluetooth serial
// channel itself. The same route serves a printer on a USB cable.
//
// WHERE THIS WORKS
//   Chrome or Edge on Windows, macOS, Linux, ChromeOS.
//   NOT on iPad / iPhone in any browser — there a BLE printer is needed.
//
// This module only moves bytes. Connection state, and the words shown when
// something fails, live in bluetoothPrinter.js with the rest of the printer.

// Serial Port Profile: the Bluetooth Classic channel receipt printers print on.
export const SERIAL_PORT_PROFILE = '00001101-0000-1000-8000-00805f9b34fb'

// Ignored over Bluetooth; the usual default for a thermal printer on USB.
const BAUD_RATE = 9600

export const serialAvailable = () => typeof navigator !== 'undefined' && !!navigator.serial

/**
 * A website may not read a serial port's name, so a port is labelled by kind and
 * recognised again by what getInfo() reports about it.
 */
export const describePort = (port) => {
  const info = (port && typeof port.getInfo === 'function' && port.getInfo()) || {}
  const label = info.bluetoothServiceClassId
    ? 'Bluetooth serial printer'
    : info.usbVendorId ? 'USB serial printer' : 'Serial printer'
  return { key: JSON.stringify(info), label }
}

/** Shows the browser's port list. Must be called from a tap. */
export const choosePort = () => navigator.serial.requestPort({
  allowedBluetoothServiceClassIds: [SERIAL_PORT_PROFILE],
})

/** A port this browser was allowed before, matched by its saved key; no tap needed. */
export const findGrantedPort = async (key) => {
  if (!key || !serialAvailable() || typeof navigator.serial.getPorts !== 'function') return null
  const ports = await navigator.serial.getPorts().catch(() => [])
  return ports.find((p) => describePort(p).key === key) || null
}

export const isPortOpen = (port) => !!port?.writable

export const openPort = async (port) => {
  if (!isPortOpen(port)) await port.open({ baudRate: BAUD_RATE })
}

export const closePort = async (port) => {
  try { await port.close() } catch { /* already closed */ }
}

const pause = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

/** Writes in chunks, with a breath between them for a printer still feeding paper. */
export const writePort = async (port, bytes, { chunkBytes, pauseMs }) => {
  const writer = port.writable.getWriter()
  try {
    for (let i = 0; i < bytes.length; i += chunkBytes) {
      // eslint-disable-next-line no-await-in-loop
      await writer.write(bytes.slice(i, i + chunkBytes))
      // eslint-disable-next-line no-await-in-loop
      if (pauseMs > 0) await pause(pauseMs)
    }
  } finally {
    writer.releaseLock()
  }
}
