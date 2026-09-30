import React, { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/**
 * A scannable QR image for a URL, drawn in the browser.
 *
 * Rendered to a PNG data URL rather than a canvas so the same <img> prints,
 * downloads and scales cleanly on the A4 sheet. Error correction M: a card on a
 * restaurant table gets scuffed and splashed, and M survives about 15% damage
 * while keeping the code small enough to scan from across the table.
 */
const QrImage = ({ value, size = 148, label }) => {
  const [src, setSrc] = useState(null)

  useEffect(() => {
    let alive = true
    QRCode.toDataURL(value, { errorCorrectionLevel: 'M', margin: 1, width: size * 2 })
      .then((url) => { if (alive) setSrc(url) })
      .catch(() => { if (alive) setSrc(null) })
    return () => { alive = false }
  }, [value, size])

  if (!src) return <div className="fd-qr-placeholder" role="img" aria-label={label} style={{ width: size, height: size }} />
  return <img src={src} alt={label} width={size} height={size} />
}

/** Saves a table's code as a PNG, named after the table. */
export const downloadQr = async (value, fileName) => {
  const url = await QRCode.toDataURL(value, { errorCorrectionLevel: 'M', margin: 2, width: 1024 })
  const a = document.createElement('a')
  a.href = url
  a.download = `${fileName}.png`
  a.click()
}

export default QrImage
