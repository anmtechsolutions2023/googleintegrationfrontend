import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { toast } from 'react-toastify'
import PrinterCard from '../PrinterCard'
import PrinterButton from '../PrinterButton'
import { resetPrinterForTests } from '../../../utils/bluetoothPrinter'

jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const channel = () => ({
  properties: { writeWithoutResponse: true },
  writeValueWithoutResponse: jest.fn(async () => {}),
})

const installPrinter = (writer = channel()) => {
  const device = {
    name: 'KPC307-UEWB-4F81',
    gatt: { connected: false },
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }
  device.gatt.connect = jest.fn(async () => {
    device.gatt.connected = true
    return { getPrimaryService: async () => ({ getCharacteristics: async () => [writer] }) }
  })
  device.gatt.disconnect = jest.fn(() => { device.gatt.connected = false })
  Object.defineProperty(window.navigator, 'bluetooth', {
    value: { requestDevice: jest.fn(async () => device) }, configurable: true, writable: true,
  })
  return writer
}

beforeEach(() => {
  jest.clearAllMocks()
  window.localStorage.clear()
  delete window.navigator.bluetooth
  resetPrinterForTests()
})

describe('Printer on this device', () => {
  test('prints through the dialog until told otherwise, and the till shows nothing', () => {
    render(<><PrinterCard /><PrinterButton /></>)
    expect(screen.getByRole('radio', { name: /Print dialog/ })).toBeChecked()
    expect(screen.queryByRole('button', { name: /Connect printer/ })).not.toBeInTheDocument()
  })

  test('a browser with no Bluetooth is told what to use, and the choice is remembered', () => {
    render(<PrinterCard />)
    fireEvent.click(screen.getByRole('radio', { name: /Bluetooth receipt printer/ }))
    expect(screen.getByRole('alert')).toHaveTextContent(/Bluefy/)
    expect(window.localStorage.getItem('pos.printer.mode')).toBe('bluetooth')
  })

  test('connects, prints a test page, and the till button follows', async () => {
    const writer = installPrinter()
    window.localStorage.setItem('pos.printer.mode', 'bluetooth')
    resetPrinterForTests()
    render(<><PrinterCard /><PrinterButton /></>)

    expect(screen.getAllByRole('button', { name: 'Connect printer' })).toHaveLength(2)
    fireEvent.click(screen.getAllByRole('button', { name: 'Connect printer' })[0])

    expect(await screen.findByText('KPC307-UEWB-4F81', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Printer: KPC307-UEWB-4F81')

    fireEvent.click(screen.getByRole('button', { name: 'Print test page' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Sent to KPC307-UEWB-4F81'))
    expect(writer.writeValueWithoutResponse).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
    expect(screen.getByText('No printer connected')).toBeInTheDocument()
  })

  test('a Bluetooth Classic printer connects as a serial port, and the till button follows', async () => {
    const port = {
      writable: null,
      getInfo: () => ({}),
      open: jest.fn(async () => { port.writable = { getWriter: () => ({ write: jest.fn(async () => {}), releaseLock: jest.fn() }) } }),
      close: jest.fn(async () => { port.writable = null }),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }
    Object.defineProperty(window.navigator, 'serial', {
      value: { requestPort: jest.fn(async () => port), getPorts: jest.fn(async () => [port]) }, configurable: true, writable: true,
    })
    render(<><PrinterCard /><PrinterButton /></>)

    fireEvent.click(screen.getByRole('radio', { name: /Bluetooth Classic or serial/ }))
    expect(window.localStorage.getItem('pos.printer.mode')).toBe('serial')
    expect(screen.queryByLabelText('Printer service UUID')).not.toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: 'Connect printer' })[0])
    expect(await screen.findByText('Serial printer', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Printer: Serial printer')
    delete window.navigator.serial
  })

  test('a USB printer connects by its product name and prints a test page', async () => {
    const alternate = { alternateSetting: 0, interfaceClass: 7, endpoints: [{ endpointNumber: 2, direction: 'out', type: 'bulk' }] }
    const iface = { interfaceNumber: 0, claimed: false, alternate, alternates: [alternate] }
    const device = {
      vendorId: 0x4b43, productId: 0x3830, productName: 'KPC307-UEWB', serialNumber: '300E31A54F81',
      opened: false, configuration: null,
      open: jest.fn(async () => { device.opened = true }),
      selectConfiguration: jest.fn(async () => { device.configuration = { interfaces: [iface] } }),
      claimInterface: jest.fn(async () => { iface.claimed = true }),
      transferOut: jest.fn(async (_ep, data) => ({ status: 'ok', bytesWritten: data.length })),
      close: jest.fn(async () => { device.opened = false }),
    }
    Object.defineProperty(window.navigator, 'usb', {
      value: { requestDevice: jest.fn(async () => device), getDevices: jest.fn(async () => [device]), addEventListener: jest.fn(), removeEventListener: jest.fn() },
      configurable: true, writable: true,
    })
    render(<><PrinterCard /><PrinterButton /></>)

    fireEvent.click(screen.getByRole('radio', { name: /USB receipt printer/ }))
    expect(window.localStorage.getItem('pos.printer.mode')).toBe('usb')

    fireEvent.click(screen.getAllByRole('button', { name: 'Connect printer' })[0])
    expect(await screen.findByText('KPC307-UEWB', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Printer: KPC307-UEWB')

    fireEvent.click(screen.getByRole('button', { name: 'Print test page' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Sent to KPC307-UEWB'))
    expect(device.transferOut).toHaveBeenCalled()
    delete window.navigator.usb
  })

  test('a service UUID that is not one is refused before saving', () => {
    installPrinter()
    window.localStorage.setItem('pos.printer.mode', 'bluetooth')
    resetPrinterForTests()
    render(<PrinterCard />)
    fireEvent.change(screen.getByLabelText('Printer service UUID'), { target: { value: 'printer' } })
    expect(screen.getByText(/not a Bluetooth service UUID/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Printer service UUID'), { target: { value: '18f0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(window.localStorage.getItem('pos.printer.serviceUuid')).toBe('000018f0-0000-1000-8000-00805f9b34fb')
  })
})
