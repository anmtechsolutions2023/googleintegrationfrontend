import React, { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import menuService from '../../services/menuService'
import { downloadErrorMessage } from '../../services/posService'

const PHRASE = 'CLEAR MENU'
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

/**
 * Dishes › Menu file › Clear the menu… — admins only.
 *
 * Step 1 chooses how far: take every dish off the menu (nothing deleted, undone
 * by showing them again) or start from an empty menu (delete what can be
 * deleted, hide what is on bills, offers or open tables, clear the old menu's
 * hours and today's counts). Step 2 shows the server's own count — the clear
 * run and rolled back — and asks for the phrase typed out. The backup is
 * downloaded before anything is cleared, and always for an empty menu.
 */
const ClearMenuDialog = ({ dishCount, categoryCount, onClose, onCleared }) => {
  const [step, setStep] = useState(1)
  const [mode, setMode] = useState('hide')
  const [removeUnused, setRemoveUnused] = useState(true)
  const [wantBackup, setWantBackup] = useState(true)
  const [preview, setPreview] = useState(null)
  const [phrase, setPhrase] = useState('')
  const [busy, setBusy] = useState('')

  const backup = mode === 'empty' || wantBackup
  const body = { mode, removeUnused: mode === 'empty' && removeUnused }

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const review = async () => {
    setBusy('preview')
    try {
      setPreview(await menuService.previewClearMenu(body))
      setPhrase('')
      setStep(2)
    } catch (err) {
      toast.error(err?.response?.data?.message || 'The menu could not be counted')
    } finally {
      setBusy('')
    }
  }

  const clear = async () => {
    let backupName = null
    if (backup) {
      setBusy('backup')
      try {
        backupName = await menuService.backupMenu()
      } catch (err) {
        setBusy('')
        toast.error(`Nothing was cleared — ${await downloadErrorMessage(err, 'the backup could not be downloaded')}`)
        return
      }
    }
    setBusy('clear')
    try {
      const result = await menuService.clearMenu({ ...body, confirm: phrase })
      onCleared(result, backupName)
    } catch (err) {
      toast.error(err?.response?.data?.message || 'The menu could not be cleared')
      setBusy('')
    }
  }

  const p = preview
  const kept = p ? p.keptBecause : null
  const hiddenWhy = kept ? [
    kept.sold && `${kept.sold} on past bills`,
    kept.offers && `${kept.offers} named by an offer`,
    kept.openOrders && `${kept.openOrders} on an open table`,
  ].filter(Boolean).join(', ') : ''
  const removed = p ? p.removed : null
  const removedAny = removed && (removed.categories + removed.tags + removed.variants + removed.addonGroups) > 0
  const ready = phrase.trim().toUpperCase() === PHRASE

  return (
    <div className="mn-modal-backdrop" onClick={() => !busy && onClose()}>
      <div className="mn-modal" role="dialog" aria-modal="true" aria-labelledby="mn-clear-title" onClick={(e) => e.stopPropagation()}>
        <div className="mn-modal-head">
          <div>
            <span className="mn-hint">Step {step} of 2</span>
            <h2 id="mn-clear-title">
              {step === 1 ? 'Clear the menu' : mode === 'empty' ? 'Start from an empty menu?' : 'Take every dish off the menu?'}
            </h2>
            <span className="mn-muted">
              {step === 1 ? `${plural(dishCount, 'dish', 'dishes')} · ${plural(categoryCount, 'category', 'categories')}` : 'Counted just now, from your menu as it stands'}
            </span>
          </div>
          <button type="button" className="mn-modal-x" onClick={onClose} aria-label="Close" disabled={!!busy}>×</button>
        </div>

        {step === 1 ? (
          <div className="mn-modal-body">
            <fieldset className="mn-choices">
              <legend className="mn-label">How far?</legend>
              <label className={`mn-choice${mode === 'hide' ? ' is-on' : ''}`}>
                <input type="radio" name="mn-clear-mode" value="hide" checked={mode === 'hide'} onChange={() => setMode('hide')} />
                <span>
                  <b>Take every dish off the menu</b>
                  <span className="mn-muted">Nothing is deleted. Dishes leave the till, QR menu and portals; show them again to bring the menu back.</span>
                </span>
              </label>
              <label className={`mn-choice${mode === 'empty' ? ' is-on danger' : ''}`}>
                <input type="radio" name="mn-clear-mode" value="empty" checked={mode === 'empty'} onChange={() => setMode('empty')} />
                <span>
                  <b>Start from an empty menu <span className="mn-pill bad">Can't be undone</span></b>
                  <span className="mn-muted">Deletes dishes that were never sold. Sold dishes are hidden, never deleted. Category hours and today's portion counts are cleared.</span>
                </span>
              </label>
            </fieldset>

            {mode === 'empty' && (
              <label className="mn-switch">
                <input type="checkbox" checked={removeUnused} onChange={(e) => setRemoveUnused(e.target.checked)} />
                <span>Also remove categories, tags, variants and add-on groups no dish uses any more</span>
              </label>
            )}
            <label className="mn-switch">
              <input type="checkbox" checked={backup} disabled={mode === 'empty'} onChange={(e) => setWantBackup(e.target.checked)} />
              <span>
                <b>Download a backup first</b> — menu.csv, addons.csv and hours.csv, ready to import back.
                {mode === 'empty' && <span className="mn-hint" style={{ display: 'block' }}>Always on for this option.</span>}
              </span>
            </label>

            <div className="mn-kept">
              <b>Always kept</b>
              <ul>
                <li>Past orders, bills, invoices, returns and every report</li>
                <li>Branches, channels, portals, tax groups and units</li>
                <li>Photos of dishes that are kept (hidden)</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="mn-modal-body">
            <div className="mn-will">
              <b>This will</b>
              <ul>
                {mode === 'empty' && <li>Delete <b>{p.deleted}</b> {p.deleted === 1 ? 'dish' : 'dishes'} nothing else points at</li>}
                {p.hidden > 0 && (
                  <li>Hide <b>{p.hidden}</b> {p.hidden === 1 ? 'dish' : 'dishes'}{mode === 'empty' && hiddenWhy ? ` (${hiddenWhy})` : ''}</li>
                )}
                {mode === 'empty' && removedAny && (
                  <li>Remove <b>{removed.categories}</b> categories, <b>{removed.tags}</b> tags, <b>{removed.variants}</b> variants and <b>{removed.addonGroups}</b> add-on groups no longer used</li>
                )}
                {p.listingsRemoved > 0 && <li>Take {plural(p.listingsRemoved, 'portal listing', 'portal listings')} down until you list dishes again</li>}
                {mode === 'empty'
                  ? <li>Clear today's portion counts and category hours{p.hoursCleared ? ` (${plural(p.hoursCleared, 'hour window', 'hour windows')})` : ''}</li>
                  : <li>Keep category hours and portion counts, so showing the dishes brings the menu back whole</li>}
                {p.dishes === 0 && <li>Nothing — the menu has no dishes</li>}
              </ul>
            </div>
            {backup && <span className="mn-hint">Your backup downloads first; if it can't be saved, nothing is cleared.</span>}
            <div className="mn-field">
              <label htmlFor="mn-clear-phrase">Type <b className="mn-mono" style={{ color: '#b91c1c' }}>{PHRASE}</b> to confirm</label>
              <input id="mn-clear-phrase" className="mn-input" autoComplete="off" value={phrase} onChange={(e) => setPhrase(e.target.value)} autoFocus />
            </div>
          </div>
        )}

        <div className="mn-modal-foot">
          {step === 1 ? (
            <>
              <button type="button" className="mn-btn" onClick={onClose}>Cancel</button>
              <button type="button" className="mn-btn pri" onClick={review} disabled={busy === 'preview'}>
                {busy === 'preview' ? 'Counting…' : 'Next — review'}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="mn-btn" onClick={() => setStep(1)} disabled={!!busy}>Back</button>
              <button type="button" className="mn-btn danger" onClick={clear} disabled={!ready || !!busy || p.dishes === 0}>
                {busy === 'backup' ? 'Saving backup…' : busy === 'clear' ? 'Clearing…' : backup ? 'Back up and clear' : 'Clear the menu'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default ClearMenuDialog
