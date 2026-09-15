import React, { useState } from 'react'
import { toast } from 'react-toastify'
import usePrinter from '../../hooks/usePrinter'
import {
  PRINTER_MODE, connectPrinter, disconnectPrinter, getServiceUuid, isDirectPrinterMode,
  normaliseServiceUuid, printerErrorMessage, printerSupport, sendToPrinter, setPrinterMode, setServiceUuid,
} from '../../utils/bluetoothPrinter'
import { buildReceiptBytes, buildTestPageBytes } from '../../utils/escposReceipt'

const MODE_OPTIONS = [
  {
    mode: PRINTER_MODE.BROWSER,
    title: 'Print dialog',
    desc: 'The browser’s own printing — AirPrint, USB or network printers already set up on this device.',
  },
  {
    mode: PRINTER_MODE.BLUETOOTH,
    title: 'Bluetooth receipt printer (BLE)',
    desc: 'A thermal ESC/POS printer over Bluetooth Low Energy. Bills, kitchen tickets and token slips print and cut straight away, with no dialog. Works on Android and in Bluefy on iPad.',
  },
  {
    mode: PRINTER_MODE.USB,
    title: 'USB receipt printer',
    desc: 'A thermal ESC/POS printer plugged into this computer or Android tablet by USB cable, such as the KPC307. Prints and cuts straight away, with no dialog. Chrome or Edge.',
  },
  {
    mode: PRINTER_MODE.SERIAL,
    title: 'Bluetooth Classic or serial port printer',
    desc: 'For a printer paired in this computer’s Bluetooth settings, or on a USB-to-serial cable, that does not show up in the BLE or USB list. Chrome or Edge on a computer.',
  },
]

/**
 * How THIS device prints: the browser's print dialog, or a receipt printer that
 * takes ESC/POS — over Bluetooth Low Energy, or as a serial port.
 *
 * A device setting, not a branch one — two tills in one branch can have two
 * printers, and an iPad at the counter has no business printing through the
 * manager's laptop settings. So it lives in this browser, and every other
 * setting on this screen stays per branch on the server.
 *
 * @param {Object} props - What the "Print this preview" button sends: the
 *   document, format and shop the preview beside it is drawing.
 */
const PrinterCard = ({ testDoc = null, testFormat = null, testShop = null, testData = null }) => {
  const printer = usePrinter()
  const support = printerSupport(printer.mode)
  const [busy, setBusy] = useState('')
  const [uuid, setUuid] = useState(getServiceUuid())
  const direct = isDirectPrinterMode(printer.mode)
  const serial = printer.mode === PRINTER_MODE.SERIAL
  const usb = printer.mode === PRINTER_MODE.USB
  const connected = printer.status === 'connected'
  const uuidProblem = uuid.trim() && !normaliseServiceUuid(uuid)
    ? 'That is not a Bluetooth service UUID. It looks like 000018f0-0000-1000-8000-00805f9b34fb, or just 18f0.'
    : null

  const run = async (key, work) => {
    setBusy(key)
    try {
      await work()
    } catch (error) {
      if (error?.code !== 'NotFoundError') toast.error(printerErrorMessage(error))
    } finally {
      setBusy('')
    }
  }

  const connect = () => run('connect', async () => {
    const next = await connectPrinter()
    toast.success(`Printer connected: ${next.name}`)
  })

  const send = (key, bytes) => run(key, async () => {
    await sendToPrinter(bytes)
    toast.success(`Sent to ${printer.name || 'the printer'}`)
  })

  const testPage = () => send('test', buildTestPageBytes({
    printerName: printer.name, paperWidth: testFormat?.paperWidth || '80',
  }))

  const previewBytes = testDoc && testData
    ? () => buildReceiptBytes(testDoc, { format: testFormat, shop: testShop || {}, data: testData })
    : null

  const saveUuid = () => {
    if (uuidProblem) return
    const saved = setServiceUuid(uuid)
    setUuid(saved)
    toast.success(saved ? 'Saved. Connect again to use it.' : 'Cleared. The usual printer channels are tried.')
  }

  return (
    <section className="fd-setting-card fd-printer-card" aria-labelledby="fd-printer-title">
      <h2 id="fd-printer-title">Printer on this device</h2>
      <p className="fd-setting-desc">
        Chosen for this tablet or computer only — each counter picks its own printer. It is saved in
        this browser, not on the branch.
      </p>

      <div className="fd-setting-options" role="radiogroup" aria-label="How this device prints">
        {MODE_OPTIONS.map((option) => (
          <label key={option.mode} className={`fd-setting-option ${printer.mode === option.mode ? 'is-active' : ''}`}>
            <input
              type="radio" name="fd-printer-mode" checked={printer.mode === option.mode}
              onChange={() => setPrinterMode(option.mode)}
            />
            <span>
              <strong>{option.title}</strong>
              <em>{option.desc}</em>
            </span>
          </label>
        ))}
      </div>

      {direct && (
        <div className="fd-printer-body">
          {!support.ok ? (
            <p className="fd-printer-note is-warn" role="alert">{support.message}</p>
          ) : (
            <>
              <div className="fd-printer-status">
                <span className={`fd-printer-dot ${connected ? 'is-on' : ''}`} aria-hidden="true" />
                <span className="fd-printer-state">
                  {connected
                    ? <>Connected to <strong>{printer.name}</strong></>
                    : printer.status === 'connecting'
                      ? 'Connecting…'
                      : printer.name
                        ? <>Not connected · last used <strong>{printer.name}</strong></>
                        : 'No printer connected'}
                </span>
                <span className="fd-printer-actions">
                  {!connected && (
                    <button
                      type="button" className="fd-btn fd-btn-primary fd-btn-sm"
                      onClick={connect} disabled={!!busy || printer.status === 'connecting'}
                    >
                      {busy === 'connect' ? 'Connecting…' : printer.name ? 'Reconnect' : 'Connect printer'}
                    </button>
                  )}
                  {connected && (
                    <button type="button" className="fd-btn fd-btn-outline fd-btn-sm" onClick={testPage} disabled={!!busy}>
                      {busy === 'test' ? 'Printing…' : 'Print test page'}
                    </button>
                  )}
                  {connected && previewBytes && (
                    <button
                      type="button" className="fd-btn fd-btn-outline fd-btn-sm"
                      onClick={() => send('preview', previewBytes())} disabled={!!busy}
                    >
                      {busy === 'preview' ? 'Printing…' : 'Print this preview'}
                    </button>
                  )}
                  {(connected || printer.name) && (
                    <button type="button" className="fd-btn fd-btn-outline fd-btn-sm" onClick={disconnectPrinter} disabled={!!busy}>
                      {connected ? 'Disconnect' : 'Forget'}
                    </button>
                  )}
                </span>
              </div>

              {printer.error && <p className="fd-printer-note is-bad" role="alert">{printer.error}</p>}

              {serial ? (
                <details className="fd-printer-help">
                  <summary>Printer not found or not printing?</summary>
                  <ul>
                    <li>Pair the printer in this computer&apos;s Bluetooth settings first (on a Mac: System Settings → Bluetooth), or connect its USB-to-serial cable. A printer on a plain USB cable belongs under “USB receipt printer” instead.</li>
                    <li>In the list, pick the port named after the printer — not cu.BLTH or cu.Bluetooth-Incoming-Port. On a Mac it is listed twice: choose the one starting with <strong>cu.</strong> (for example cu.KPC307-UEWB-4F81). If that will not open, try the other one.</li>
                    <li>If it will not open, close any other tab or app using the printer, switch the printer off and on, and connect again.</li>
                    <li>After the page is reloaded, printing reconnects on its own; if it does not, tap Connect printer again.</li>
                  </ul>
                </details>
              ) : usb ? (
                <details className="fd-printer-help">
                  <summary>Printer not found or not printing?</summary>
                  <ul>
                    <li>Plug the printer in with its USB cable and switch it on, with paper loaded and the cover shut.</li>
                    <li>In the list, pick the printer by name — for example KPC307-UEWB.</li>
                    <li>If it will not connect, unplug it and plug it back in, close any other tab using it, and connect again.</li>
                    <li>On Windows the browser can reach the printer only once its driver is switched to WinUSB (for example with Zadig), which stops ordinary Windows printing to it.</li>
                    <li>After the page is reloaded, printing reconnects on its own.</li>
                  </ul>
                </details>
              ) : (
                <details className="fd-printer-help">
                  <summary>Printer not found or not printing?</summary>
                  <ul>
                    <li>Switch the printer on and keep it within a few metres of this device.</li>
                    <li>In the list, pick the name printed on its self-test page — for example one starting with KPC307.</li>
                    <li>Not in the list at all, even though it is paired? It is probably connected to this computer already, or Bluetooth Classic only, and this list cannot show it. With a USB cable choose “USB receipt printer”; otherwise “Bluetooth Classic or serial port printer”.</li>
                    <li>A Bluetooth printer takes one connection at a time. Disconnect it from any other phone or tablet first.</li>
                    <li>After the page is reloaded, tap Connect printer again.</li>
                  </ul>
                  <div className="fd-printer-uuid">
                    <label htmlFor="fd-printer-uuid">Printer service UUID</label>
                    <input
                      id="fd-printer-uuid" value={uuid} placeholder="e.g. 000018f0-0000-1000-8000-00805f9b34fb"
                      autoComplete="off" spellCheck={false} aria-invalid={uuidProblem ? true : undefined}
                      aria-describedby="fd-printer-uuid-note"
                      onChange={(e) => setUuid(e.target.value)}
                    />
                    <button type="button" className="fd-btn fd-btn-outline fd-btn-sm" onClick={saveUuid} disabled={!!uuidProblem}>
                      Save
                    </button>
                  </div>
                  <small id="fd-printer-uuid-note" className={uuidProblem ? 'is-bad' : ''}>
                    {uuidProblem || 'Only needed when the printer connects but nothing prints. Find it with a Bluetooth scanner app such as nRF Connect: the service holding a characteristic marked WRITE.'}
                  </small>
                </details>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}

export default PrinterCard
