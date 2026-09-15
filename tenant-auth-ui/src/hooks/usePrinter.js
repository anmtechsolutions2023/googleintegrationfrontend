import { useEffect, useState } from 'react'
import { getPrinterState, subscribePrinter } from '../utils/bluetoothPrinter'

/**
 * The printer on this device: { mode, status, name, error }.
 * Every screen showing it re-renders when any of them connects or disconnects.
 */
const usePrinter = () => {
  const [printer, setPrinter] = useState(getPrinterState)
  useEffect(() => subscribePrinter(setPrinter), [])
  return printer
}

export default usePrinter
