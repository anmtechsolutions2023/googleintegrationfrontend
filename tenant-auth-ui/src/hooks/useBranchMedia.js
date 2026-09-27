import { useEffect, useMemo, useState } from 'react'
import posService from '../services/posService'

/**
 * The branch's logo and payment QR, as data URIs a renderer can actually draw.
 *
 * WHY THE PATH IN `shop` CANNOT BE USED AS AN <img src>
 *
 * Three reasons, any one of which alone would sink it:
 *
 *   1. AUTHENTICATION. GET /api/pos/media/:kind is behind authenticateToken, and
 *      an <img> sends no Authorization header — the token is a JS-readable cookie
 *      the API client turns into one, and the browser has no reason to attach it.
 *   2. ORIGIN. The API is a different origin from the app (REACT_APP_API_URL:
 *      :3001 against the dev server's :3000), so a relative src asks the FRONTEND
 *      for a path it has never heard of.
 *   3. SHAPE. The endpoint answers a JSON envelope, not image bytes.
 *
 * All three render as the same thing on a bill: a broken-image icon under a
 * "Scan to pay" caption. So the path is only ever the signal of WHICH kinds this
 * branch holds, and the bytes are fetched here through the authenticated client.
 *
 * IT ALSO FIXES THE THERMAL PATH. utils/escposImage draws the image to a canvas to
 * dither it, and reading a canvas back taints on a cross-origin image. A data URI
 * is same-origin by definition, so getImageData simply works.
 *
 * WHY A HOOK RATHER THAN A COPY PER SCREEN
 * Three screens need this — the till's print path, the Receipt Format preview and
 * Business Profile's branding tab — and the first two must agree exactly, or the
 * preview shows a bill the printer will not produce. That is the whole point of
 * the seam this codebase already keeps between the resolved format and the two
 * renderers; a second implementation of "which bytes" would undo it.
 *
 * @param {string} branchId
 * @param {Object|null} shop - The masthead from the resolved format, carrying the
 *   `logoUrl` / `paymentQrUrl` paths.
 * @param {*} [refreshKey] - Changes to force a re-fetch. The path carries a `v=`
 *   stamp so a REPLACED image re-fetches on its own; this is for callers that
 *   refresh the whole format on a cadence and want the images to follow.
 * @returns {Object} The same masthead with `logoUrl` / `paymentQrUrl` replaced by
 *   data URIs — or '' until they arrive, which both renderers already gate on.
 */
export const useBranchMedia = (branchId, shop, refreshKey) => {
  const [media, setMedia] = useState({ logo: '', paymentQr: '' })

  const logoPath = shop?.logoUrl || ''
  const qrPath = shop?.paymentQrUrl || ''

  useEffect(() => {
    let cancelled = false
    const wanted = [['logo', logoPath], ['paymentQr', qrPath]]
      .filter(([, path]) => path)
      .map(([kind]) => kind)

    if (!branchId || wanted.length === 0) {
      setMedia({ logo: '', paymentQr: '' })
      return undefined
    }

    Promise.all(wanted.map((kind) => posService.getBranchMedia(branchId, kind)
      .then((m) => [kind, m?.dataUri || ''])
      // One image failing must not cost the other, and neither costs the bill. A
      // picture is decoration; a bill that did not print because a logo would not
      // load is a customer standing at a counter.
      .catch(() => [kind, ''])))
      .then((pairs) => {
        if (cancelled) return
        setMedia({ logo: '', paymentQr: '', ...Object.fromEntries(pairs) })
      })

    return () => { cancelled = true }
  }, [branchId, logoPath, qrPath, refreshKey])

  // Memoised on the values rather than on `shop`: the format object is replaced on
  // every refresh, and a fresh masthead object each time would re-run the print
  // effect and the bitmap decode for a bill that has not changed.
  return useMemo(() => (shop ? {
    ...shop,
    logoUrl: media.logo,
    paymentQrUrl: media.paymentQr,
  } : shop), [shop, media])
}

export default useBranchMedia
