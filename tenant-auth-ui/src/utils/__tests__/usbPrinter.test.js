import * as printer from '../bluetoothPrinter'

// A printer as WebUSB presents one: a device with a configuration, a
// printer-class interface, and a bulk OUT endpoint that takes bytes.
const fakeUsb = ({ productName = 'KPC307-UEWB', serialNumber = '300E31A54F81', printable = true, openFails = false } = {}) => {
  const endpoints = [{ endpointNumber: 1, direction: 'in', type: 'bulk' }]
  if (printable) endpoints.push({ endpointNumber: 2, direction: 'out', type: 'bulk' })
  const alternate = { alternateSetting: 0, interfaceClass: 7, endpoints }
  const iface = { interfaceNumber: 0, claimed: false, alternate, alternates: [alternate] }
  const usb = {
    vendorId: 0x4b43,
    productId: 0x3830,
    productName,
    serialNumber,
    opened: false,
    configuration: null,
    sent: [],
    open: jest.fn(async () => {
      if (openFails) throw Object.assign(new Error('Access denied.'), { name: 'SecurityError' })
      usb.opened = true
    }),
    selectConfiguration: jest.fn(async () => { usb.configuration = { interfaces: [iface] } }),
    claimInterface: jest.fn(async () => { iface.claimed = true }),
    selectAlternateInterface: jest.fn(async () => {}),
    transferOut: jest.fn(async (endpoint, data) => {
      usb.sent.push([endpoint, data.length])
      return { status: 'ok', bytesWritten: data.length }
    }),
    close: jest.fn(async () => { usb.opened = false; iface.claimed = false }),
  }
  return usb
}

const installUsb = (overrides = {}) => {
  const listeners = {}
  const usb = {
    requestDevice: jest.fn(),
    getDevices: jest.fn(async () => []),
    addEventListener: jest.fn((type, fn) => { listeners[type] = fn }),
    removeEventListener: jest.fn(),
    fire: (type, event) => listeners[type] && listeners[type](event),
    ...overrides,
  }
  Object.defineProperty(window.navigator, 'usb', { value: usb, configurable: true, writable: true })
  return usb
}

beforeEach(() => {
  window.localStorage.clear()
  delete window.navigator.usb
  printer.resetPrinterForTests()
  printer.setPrinterMode(printer.PRINTER_MODE.USB)
})

describe('USB printer', () => {
  test('without WebUSB it says what to use instead', () => {
    const support = printer.printerSupport(printer.PRINTER_MODE.USB)
    expect(support.ok).toBe(false)
    expect(support.message).toMatch(/Chrome or Edge/)
  })

  test('asks for a printer, claims its print interface and prints in chunks to the OUT endpoint', async () => {
    const device = fakeUsb()
    const usb = installUsb({ requestDevice: jest.fn(async () => device) })

    const state = await printer.connectPrinter()
    expect(usb.requestDevice.mock.calls[0][0].filters).toContainEqual({ classCode: 7 })
    expect(device.selectConfiguration).toHaveBeenCalledWith(1)
    expect(device.claimInterface).toHaveBeenCalledWith(0)
    expect(state).toMatchObject({ mode: 'usb', status: 'connected', name: 'KPC307-UEWB' })

    await printer.sendToPrinter(new Uint8Array(250), { pauseMs: 0 })
    expect(device.sent).toEqual([[2, 100], [2, 100], [2, 50]])
  })

  test('unplugged and plugged back in, it prints again without a tap', async () => {
    const first = fakeUsb()
    const usb = installUsb({ requestDevice: jest.fn(async () => first) })
    await printer.connectPrinter()

    usb.fire('disconnect', { device: fakeUsb({ serialNumber: 'someone-else' }) })
    expect(printer.getPrinterState().status).toBe('connected')
    usb.fire('disconnect', { device: first })
    expect(printer.getPrinterState().status).toBe('disconnected')

    const again = fakeUsb()
    usb.getDevices.mockResolvedValue([fakeUsb({ serialNumber: 'other' }), again])
    await printer.sendToPrinter(new Uint8Array(5), { pauseMs: 0 })
    expect(usb.requestDevice).toHaveBeenCalledTimes(1)
    expect(again.sent).toEqual([[2, 5]])
    expect(printer.getPrinterState().status).toBe('connected')
  })

  test('a device that is not a printer, and one that will not open, each explain themselves', async () => {
    installUsb({ requestDevice: jest.fn(async () => fakeUsb({ printable: false })) })
    await expect(printer.connectPrinter()).rejects.toMatchObject({ code: 'usbNoEndpoint' })

    installUsb({ requestDevice: jest.fn(async () => fakeUsb({ openFails: true })) })
    await expect(printer.connectPrinter()).rejects.toMatchObject({ code: 'usbBusy' })
    expect(printer.getPrinterState().error).toMatch(/SecurityError: Access denied/)
  })

  test('printing with no printer chosen says how to fix it, and Disconnect forgets it', async () => {
    installUsb()
    await expect(printer.sendToPrinter(new Uint8Array(5))).rejects.toMatchObject({ code: 'notConnected' })

    const device = fakeUsb()
    installUsb({ requestDevice: jest.fn(async () => device) })
    await printer.connectPrinter()
    printer.disconnectPrinter()
    expect(device.close).toHaveBeenCalled()
    expect(window.localStorage.getItem('pos.printer.usbDevice')).toBeNull()
    expect(printer.getPrinterState()).toMatchObject({ status: 'disconnected', name: '' })
  })
})
