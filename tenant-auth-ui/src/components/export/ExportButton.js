import React, { useEffect, useRef, useState } from 'react'
import { useExports } from '../../hooks/useExports'
import ExportDialog from './ExportDialog'
import './export.css'

const DownloadIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" />
  </svg>
)

/**
 * "Export CSV" — drawn only for exports the server offers this person. Opens
 * the shared dialog with the screen's period, branch and filters chosen.
 *
 * Given several keys (the Ledger offers documents, line items and payments)
 * it becomes a small menu of the ones this person may take; given one, or
 * left with one after the permission check, it is a plain button.
 *
 * @param {Object} props
 * @param {string|string[]} props.exportKey - e.g. 'ledger-documents'.
 * @param {Object} [props.context] - See ExportDialog.
 * @param {string} [props.label] - Button text; defaults to "Export CSV".
 * @param {string} [props.className] - Button classes, to match the toolbar it sits in.
 */
const ExportButton = ({ exportKey, context, label = 'Export CSV', className = 'fd-btn fd-btn-outline' }) => {
  const { find, canUnmask } = useExports()
  const [openKey, setOpenKey] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const wrap = useRef(null)

  const defs = (Array.isArray(exportKey) ? exportKey : [exportKey]).map(find).filter(Boolean)

  useEffect(() => {
    if (!menuOpen) return undefined
    const close = (e) => { if (!wrap.current?.contains(e.target)) setMenuOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', onKey) }
  }, [menuOpen])

  if (!defs.length) return null
  const open = defs.find((d) => d.key === openKey)

  return (
    <span className="fd-export-wrap" ref={wrap}>
      {defs.length === 1 ? (
        <button type="button" className={`${className} fd-export-btn`} onClick={() => setOpenKey(defs[0].key)}>
          <DownloadIcon />{label}
        </button>
      ) : (
        <>
          <button
            type="button" className={`${className} fd-export-btn`}
            aria-haspopup="menu" aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <DownloadIcon />{label} <span aria-hidden="true">▾</span>
          </button>
          {menuOpen && (
            <span className="fd-export-menu" role="menu">
              {defs.map((d) => (
                <button
                  key={d.key} type="button" role="menuitem"
                  onClick={() => { setMenuOpen(false); setOpenKey(d.key) }}
                >
                  <b>{d.label}</b>
                  <span>One row per {d.grain}</span>
                </button>
              ))}
            </span>
          )}
        </>
      )}
      {open && <ExportDialog def={open} canUnmask={canUnmask} context={context} onClose={() => setOpenKey(null)} />}
    </span>
  )
}

export default ExportButton
