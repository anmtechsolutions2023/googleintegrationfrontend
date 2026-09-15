import * as printer from '../bluetoothPrinter'

// A printer as Web Bluetooth presents one: a device, a GATT server, services by
// UUID, characteristics with properties.
const fakePrinter = ({ services = {}, name = 'KPC307-UEWB-4F81' } = {}) => {
  const listeners = {}
  const device = {
    name,
    gatt: { connected: false },
    addEventListener: jest.fn((type, fn) => { listeners[type] = fn }),
    removeEventListener: jest.fn(),
    drop: () => { device.gatt.connected = false; if (listeners.gattserverdisconnected) listeners.gattserverdisconnected() },
  }
  device.gatt.connect = jest.fn(async () => {
    device.gatt.connected = true
    return {
      getPrimaryService: jest.fn(async (uuid) => {
        if (!services[uuid]) throw Object.assign(new Error('not found'), { name: 'NotFoundError' })
        return { getCharacteristics: async () => services[uuid] }
      }),
    }
  })
  device.gatt.disconnect = jest.fn(() => { device.gatt.connected = false })
  return device
}

const writable = (props = { writeWithoutResponse: true }) => ({
  properties: props,
  writeValueWithoutResponse: jest.fn(async () => {}),
  writeValueWithResponse: jest.fn(async () => {}),
  writeValue: jest.fn(async () => {}),
})

const installBluetooth = (bluetooth) => {
  Object.defineProperty(window.navigator, 'bluetooth', { value: bluetooth, configurable: true, writable: true })
}

beforeEach(() => {
  window.localStorage.clear()
  delete window.navigator.bluetooth
  printer.resetPrinterForTests()
})

describe('Bluetooth printer', () => {
  test('without Web Bluetooth it says what to use instead', () => {
    const support = printer.bluetoothSupport()
    expect(support.ok).toBe(false)
    expect(support.message).toMatch(/Bluefy/)
  })

  test('connects to the first writable channel among the known printer services', async () => {
    const channel = writable()
    const device = fakePrinter({ services: {
      '49535343-fe7d-4ae5-8fa9-9fafd205e455': [{ properties: { notify: true } }, channel],
    } })
    const requestDevice = jest.fn(async () => device)
    installBluetooth({ requestDevice })

    const state = await printer.connectPrinter()
    expect(state).toMatchObject({ status: 'connected', name: 'KPC307-UEWB-4F81' })
    expect(requestDevice.mock.calls[0][0].acceptAllDevices).toBe(true)
    expect(requestDevice.mock.calls[0][0].optionalServices).toEqual(printer.KNOWN_PRINTER_SERVICES)
    expect(window.localStorage.getItem('pos.printer.name')).toBe('KPC307-UEWB-4F81')

    await printer.sendToPrinter(new Uint8Array(250), { pauseMs: 0 })
    expect(channel.writeValueWithoutResponse.mock.calls.map(([c]) => c.length)).toEqual([100, 100, 50])
  })

  test('a saved service UUID is tried first', async () => {
    printer.setServiceUuid('ABCD')
    const requestDevice = jest.fn(async () => fakePrinter({ services: { '0000abcd-0000-1000-8000-00805f9b34fb': [writable()] } }))
    installBluetooth({ requestDevice })
    await printer.connectPrinter()
    expect(requestDevice.mock.calls[0][0].optionalServices[0]).toBe('0000abcd-0000-1000-8000-00805f9b34fb')
  })

  test('writes with response when that is all the channel takes', async () => {
    const channel = writable({ write: true })
    installBluetooth({ requestDevice: async () => fakePrinter({ services: { '000018f0-0000-1000-8000-00805f9b34fb': [channel] } }) })
    await printer.connectPrinter()
    await printer.sendToPrinter(new Uint8Array(10))
    expect(channel.writeValueWithResponse).toHaveBeenCalledTimes(1)
    expect(channel.writeValueWithoutResponse).not.toHaveBeenCalled()
  })

  test('reconnects on its own after the printer drops, without a tap', async () => {
    const channel = writable()
    const device = fakePrinter({ services: { '000018f0-0000-1000-8000-00805f9b34fb': [channel] } })
    installBluetooth({ requestDevice: jest.fn(async () => device) })
    await printer.connectPrinter()
    device.drop()
    expect(printer.getPrinterState().status).toBe('disconnected')

    await printer.sendToPrinter(new Uint8Array(5), { pauseMs: 0 })
    expect(device.gatt.connect).toHaveBeenCalledTimes(2)
    expect(channel.writeValueWithoutResponse).toHaveBeenCalledTimes(1)
  })

  test('printing with no printer chosen says how to fix it', async () => {
    installBluetooth({ requestDevice: jest.fn() })
    await expect(printer.sendToPrinter(new Uint8Array(5))).rejects.toMatchObject({ code: 'notConnected' })
    expect(printer.printerErrorMessage({ code: 'x', name: 'PrinterError' })).toMatch(/Could not reach/)
  })

  test('closing the chooser, and a printer with no known channel, each explain themselves', async () => {
    installBluetooth({ requestDevice: jest.fn(async () => { throw Object.assign(new Error('cancel'), { name: 'NotFoundError' }) }) })
    await expect(printer.connectPrinter()).rejects.toMatchObject({ code: 'NotFoundError', message: 'No printer was chosen.' })

    installBluetooth({ requestDevice: jest.fn(async () => fakePrinter({ services: {} })) })
    await expect(printer.connectPrinter()).rejects.toMatchObject({ code: 'noChannel' })
    expect(printer.getPrinterState().error).toMatch(/service UUID/)
  })

  test('the mode is kept on this device and every screen hears the change', () => {
    const seen = []
    const stop = printer.subscribePrinter((s) => seen.push(s.mode))
    printer.setPrinterMode(printer.PRINTER_MODE.BLUETOOTH)
    expect(printer.getPrinterMode()).toBe('bluetooth')
    expect(seen).toEqual(['browser', 'bluetooth'])
    printer.setPrinterMode(printer.PRINTER_MODE.BROWSER)
    expect(window.localStorage.getItem('pos.printer.mode')).toBeNull()
    stop()
  })

  test('service UUIDs are accepted short or long, and nothing else', () => {
    expect(printer.normaliseServiceUuid('18F0')).toBe('000018f0-0000-1000-8000-00805f9b34fb')
    expect(printer.normaliseServiceUuid('0x18f0')).toBe('000018f0-0000-1000-8000-00805f9b34fb')
    expect(printer.normaliseServiceUuid('E7810A71-73AE-499D-8C15-FAA9AEF0C3F2')).toBe('e7810a71-73ae-499d-8c15-faa9aef0c3f2')
    expect(printer.normaliseServiceUuid('printer')).toBeNull()
  })
})
