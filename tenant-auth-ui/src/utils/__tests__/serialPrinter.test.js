import * as printer from '../bluetoothPrinter'
import { SERIAL_PORT_PROFILE } from '../serialPrinter'

// A port as Web Serial presents one: open() makes `writable` appear, and its
// writer takes chunks.
const fakePort = ({ info = {}, openFails = false } = {}) => {
  const listeners = {}
  const port = {
    writable: null,
    chunks: [],
    getInfo: () => info,
    open: jest.fn(async () => {
      if (openFails) throw Object.assign(new Error('Failed to open serial port.'), { name: 'NetworkError' })
      port.writable = {
        getWriter: () => ({
          write: jest.fn(async (chunk) => { port.chunks.push(chunk) }),
          releaseLock: jest.fn(),
        }),
      }
    }),
    close: jest.fn(async () => { port.writable = null }),
    addEventListener: jest.fn((type, fn) => { listeners[type] = fn }),
    removeEventListener: jest.fn(),
    drop: () => { port.writable = null; if (listeners.disconnect) listeners.disconnect() },
  }
  return port
}

const installSerial = (serial) => {
  Object.defineProperty(window.navigator, 'serial', { value: serial, configurable: true, writable: true })
}

beforeEach(() => {
  window.localStorage.clear()
  delete window.navigator.serial
  delete window.navigator.bluetooth
  printer.resetPrinterForTests()
  printer.setPrinterMode(printer.PRINTER_MODE.SERIAL)
})

describe('Serial printer (Bluetooth Classic, USB)', () => {
  test('without Web Serial it says what to use instead', () => {
    const support = printer.printerSupport(printer.PRINTER_MODE.SERIAL)
    expect(support.ok).toBe(false)
    expect(support.message).toMatch(/Chrome or Edge/)
  })

  test('asks for a port that may be a Bluetooth serial printer, opens it and prints in chunks', async () => {
    const port = fakePort({ info: { bluetoothServiceClassId: SERIAL_PORT_PROFILE } })
    const requestPort = jest.fn(async () => port)
    installSerial({ requestPort, getPorts: jest.fn(async () => [port]) })

    const state = await printer.connectPrinter()
    expect(requestPort.mock.calls[0][0].allowedBluetoothServiceClassIds).toEqual([SERIAL_PORT_PROFILE])
    expect(port.open).toHaveBeenCalledWith({ baudRate: 9600 })
    expect(state).toMatchObject({ mode: 'serial', status: 'connected', name: 'Bluetooth serial printer' })

    await printer.sendToPrinter(new Uint8Array(250), { pauseMs: 0 })
    expect(port.chunks.map((c) => c.length)).toEqual([100, 100, 50])
  })

  test('after a reload it reopens the port the browser still allows, without a tap', async () => {
    const port = fakePort({ info: { usbVendorId: 1155, usbProductId: 22336 } })
    installSerial({ requestPort: jest.fn(async () => port), getPorts: jest.fn(async () => [port]) })
    await printer.connectPrinter()
    port.writable = null

    printer.resetPrinterForTests()
    const requestPort = jest.fn()
    installSerial({ requestPort, getPorts: jest.fn(async () => [fakePort({ info: { usbVendorId: 1 } }), port]) })
    expect(printer.getPrinterState()).toMatchObject({ mode: 'serial', name: 'USB serial printer' })

    await printer.sendToPrinter(new Uint8Array(5), { pauseMs: 0 })
    expect(requestPort).not.toHaveBeenCalled()
    expect(port.open).toHaveBeenCalledTimes(2)
    expect(port.chunks).toHaveLength(1)
  })

  test('a port that is unplugged shows as disconnected, and a busy port explains itself', async () => {
    const port = fakePort()
    installSerial({ requestPort: jest.fn(async () => port), getPorts: jest.fn(async () => []) })
    await printer.connectPrinter()
    port.drop()
    expect(printer.getPrinterState().status).toBe('disconnected')

    installSerial({ requestPort: jest.fn(async () => fakePort({ openFails: true })), getPorts: jest.fn(async () => []) })
    await expect(printer.connectPrinter()).rejects.toMatchObject({ code: 'portBusy' })
    expect(printer.getPrinterState().error).toMatch(/could not open it/)
  })

  test('printing with no port chosen says how to fix it, and Disconnect forgets the port', async () => {
    installSerial({ requestPort: jest.fn(), getPorts: jest.fn(async () => []) })
    await expect(printer.sendToPrinter(new Uint8Array(5))).rejects.toMatchObject({ code: 'notConnected' })

    const port = fakePort()
    installSerial({ requestPort: jest.fn(async () => port), getPorts: jest.fn(async () => [port]) })
    await printer.connectPrinter()
    printer.disconnectPrinter()
    expect(port.close).toHaveBeenCalled()
    expect(window.localStorage.getItem('pos.printer.serialPort')).toBeNull()
    expect(printer.getPrinterState()).toMatchObject({ status: 'disconnected', name: '' })
  })

  test('switching mode lets go of the open port and shows that mode’s printer', async () => {
    window.localStorage.setItem('pos.printer.name', 'KPC307-UEWB-4F81')
    const port = fakePort()
    installSerial({ requestPort: jest.fn(async () => port), getPorts: jest.fn(async () => []) })
    await printer.connectPrinter()

    printer.setPrinterMode(printer.PRINTER_MODE.BLUETOOTH)
    expect(port.close).toHaveBeenCalled()
    expect(printer.getPrinterState()).toMatchObject({ mode: 'bluetooth', status: 'disconnected', name: 'KPC307-UEWB-4F81' })
    expect(printer.isDirectPrinterMode(printer.getPrinterMode())).toBe(true)
  })
})
