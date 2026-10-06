import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { downloadExport } from '../../services/exportService'
import { downloadErrorMessage } from '../../services/posService'
import { downloadSampleZip, downloadTemplate } from '../../utils/menuFile'

const Item = ({ id, busy, title, hint, onClick, danger }) => (
  <button type="button" role="menuitem" className={`mn-menu-item${danger ? ' danger' : ''}`} onClick={onClick} disabled={!!busy}>
    <b>{busy === id ? 'Working…' : title}</b>
    {hint && <span>{hint}</span>}
  </button>
)

/**
 * Dishes › "Menu file ▾" — everything that moves a whole menu in or out.
 *
 * Starting or updating from a file comes first (import, the sample, a blank
 * template), then backing up, and last — separated, red, admins only — clearing
 * the menu. A reset is rare and cannot be undone, so it is the furthest item
 * from the pointer and never a button on the page. At phone width the list
 * opens as a bottom sheet.
 */
const MenuFileMenu = ({ canWrite, canClear, onClear, onAddPhotos }) => {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState('')
  const wrap = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    const onDown = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  const run = (key, fn, fallback) => async () => {
    setBusy(key)
    try {
      const name = await fn()
      if (name) toast.success(`Saved ${name}`)
      setOpen(false)
    } catch (err) {
      toast.error(await downloadErrorMessage(err, err?.message || fallback))
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="mn-menu-wrap" ref={wrap}>
      <button type="button" className="mn-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Menu file <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <>
          <div className="mn-menu-scrim" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="mn-menu" role="menu" aria-label="Menu file">
            <span className="mn-menu-grip" aria-hidden="true" />
            <div className="mn-menu-group">Start or update from a file</div>
            {canWrite && (
              <Item busy={busy} id="import" title="Import menu file…" hint="menu.csv, add-ons and hours — checked before anything is saved"
                onClick={() => navigate('/menu/dishes/import')} />
            )}
            <Item busy={busy} id="sample" title="Download sample menu" hint="31 ready dishes with add-ons and hours (.zip of 3 CSVs)"
              onClick={run('sample', downloadSampleZip, 'The sample menu could not be downloaded')} />
            <Item busy={busy} id="template" title="Download blank template" hint="Just the columns, with one example row"
              onClick={run('template', downloadTemplate, 'The template could not be downloaded')} />
            {canWrite && onAddPhotos && (
              <Item busy={busy} id="photos" title="Add photos…" hint="Many at once, matched to dishes by file name (MNS-01.jpg or butter-chicken.jpg)"
                onClick={() => { setOpen(false); onAddPhotos() }} />
            )}

            <div className="mn-menu-group">Back up</div>
            <Item busy={busy} id="menu" title="Export menu file" hint="Every dish, in the format Import reads"
              onClick={run('menu', () => downloadExport('menu'), 'The menu could not be exported')} />
            <Item busy={busy} id="addons" title="Export add-ons" hint="addons.csv"
              onClick={run('addons', () => downloadExport('menu-addons'), 'The add-ons could not be exported')} />
            <Item busy={busy} id="hours" title="Export hours" hint="hours.csv — when each category is served"
              onClick={run('hours', () => downloadExport('menu-hours'), 'The hours could not be exported')} />

            {canClear && (
              <>
                <div className="mn-menu-group">Admins only</div>
                <Item busy={busy} id="clear" danger title="Clear the menu…" hint="Start again: take every dish off, remove the unused ones"
                  onClick={() => { setOpen(false); onClear() }} />
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default MenuFileMenu
