import React, { useState } from 'react'
import { toast } from 'react-toastify'
import usePrinter from '../../hooks/usePrinter'
import {
  connectPrinter, isDirectPrinterMode, printerErrorMessage, printerSupport,
} from '../../utils/bluetoothPrinter'

/**
 * The receipt printer's state (Bluetooth LE or serial), where printing happens.
 *
 * The browser drops a printer connection on every page reload, and choosing
 * the printer again needs a tap — a bill settled after a reload cannot do that
 * for itself. So the till shows whether the printer is there, and one tap
 * reconnects it. Nothing at all is shown on a device that prints through the
 * browser's dialog.
 */
const PrinterButton = () => {
  const printer = usePrinter()
  const [busy, setBusy] = useState(false)
  if (!isDirectPrinterMode(printer.mode)) return null

  if (printer.status === 'connected') {
    return (
      <span className="fd-printer-btn is-on" role="status" title={`Receipts print to ${printer.name}`}>
        <span className="fd-printer-dot is-on" aria-hidden="true" />
        Printer: {printer.name}
      </span>
    )
  }

  const connecting = busy || printer.status === 'connecting'
  const connect = async () => {
    const support = printerSupport(printer.mode)
    if (!support.ok) { toast.error(support.message); return }
    setBusy(true)
    try {
      const next = await connectPrinter()
      toast.success(`Printer connected: ${next.name}`)
    } catch (error) {
      // Closing the chooser is a decision, not a fault.
      if (error?.code !== 'NotFoundError') toast.error(printerErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <button type="button" className="fd-printer-btn is-off" onClick={connect} disabled={connecting}>
      <span className="fd-printer-dot" aria-hidden="true" />
      {connecting ? 'Connecting…' : 'Connect printer'}
    </button>
  )
}

export default PrinterButton
