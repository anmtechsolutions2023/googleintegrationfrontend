import React, { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-toastify'
import menuService from '../../services/menuService'
import { matchPhotoFile, preparePhoto } from '../../utils/dishPhoto'

const MAX_FILES = 100

/**
 * Dishes › Menu file › Add photos… — many dish photos at once.
 *
 * Each file is matched to a dish by its name: the dish code (MNS-01.jpg)
 * first, then the dish name (butter-chicken.jpg). The review shows every
 * match, lets a wrong or missing one be picked by hand, and says which
 * photos replace one already there. Saving resizes each file here and sends
 * them one at a time, so one bad file costs only itself.
 */
const AddPhotosDialog = ({ dishes, onClose, onSaved }) => {
  const [rows, setRows] = useState([])
  const [over, setOver] = useState(false)
  const [saving, setSaving] = useState(null) // { done, total }
  const byId = useMemo(() => new Map(dishes.map((d) => [d.itemId, d])), [dishes])
  const sorted = useMemo(() => [...dishes].sort((a, b) => a.name.localeCompare(b.name)), [dishes])

  // Previews are object URLs of the chosen files; all released on close.
  const previews = useRef([])
  useEffect(() => () => previews.current.forEach((u) => URL.revokeObjectURL(u)), [])
  const previewOf = (file) => {
    const url = URL.createObjectURL(file)
    previews.current.push(url)
    return url
  }

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [saving, onClose])

  const take = (fileList) => {
    const files = [...fileList].filter((f) => /^image\/(png|jpeg|webp)$/.test(f.type))
    const skipped = fileList.length - files.length
    if (skipped > 0) toast.warn(`${skipped} file${skipped === 1 ? ' is' : 's are'} not a PNG, JPEG or WebP image and ${skipped === 1 ? 'was' : 'were'} left out.`)
    setRows((cur) => {
      const room = MAX_FILES - cur.length
      if (files.length > room) toast.warn(`Up to ${MAX_FILES} photos at a time — the first ${Math.max(room, 0)} were added.`)
      return [...cur, ...files.slice(0, Math.max(room, 0)).map((file, i) => {
        const m = matchPhotoFile(file.name, dishes)
        return { key: `${Date.now()}-${cur.length + i}`, file, preview: previewOf(file), itemId: m ? m.dish.itemId : '', by: m ? m.by : null, error: null }
      })]
    })
  }

  const setDish = (key, itemId) => setRows((cur) => cur.map((r) => (r.key === key ? { ...r, itemId, by: itemId ? 'hand' : null } : r)))
  const remove = (key) => setRows((cur) => cur.filter((r) => r.key !== key))

  // Two files aimed at one dish: the later one wins, and says so.
  const claimed = new Map()
  rows.forEach((r) => { if (r.itemId) claimed.set(r.itemId, r.key) })
  const ready = rows.filter((r) => r.itemId && claimed.get(r.itemId) === r.key)
  const unmatched = rows.filter((r) => !r.itemId).length

  const save = async () => {
    setSaving({ done: 0, total: ready.length })
    const failed = []
    for (let i = 0; i < ready.length; i += 1) {
      const r = ready[i]
      try {
        const { dataUri, thumbDataUri } = await preparePhoto(r.file)
        await menuService.putDishPhoto(r.itemId, dataUri, thumbDataUri)
      } catch (err) {
        failed.push({ key: r.key, error: err?.response?.data?.message || err.message || 'Not saved' })
      }
      setSaving({ done: i + 1, total: ready.length })
    }
    const saved = ready.length - failed.length
    if (failed.length === 0) {
      toast.success(`${saved} ${saved === 1 ? 'photo' : 'photos'} saved`)
      onSaved()
      return
    }
    // Keep only what failed on screen, with why.
    if (saved) toast.success(`${saved} ${saved === 1 ? 'photo' : 'photos'} saved`)
    toast.error(`${failed.length} could not be saved — see the list`)
    const why = new Map(failed.map((f) => [f.key, f.error]))
    setRows((cur) => cur.filter((r) => why.has(r.key)).map((r) => ({ ...r, error: why.get(r.key) })))
    setSaving(null)
  }

  const statusOf = (r) => {
    if (r.error) return <span className="mn-pill bad">{r.error}</span>
    if (!r.itemId) return <span className="mn-pill bad">No match</span>
    if (claimed.get(r.itemId) !== r.key) return <span className="mn-pill off">Another file wins</span>
    return byId.get(r.itemId)?.photoVersion ? <span className="mn-pill chg">Replaces photo</span> : <span className="mn-pill on">New</span>
  }

  return (
    <div className="mn-modal-backdrop" onClick={() => !saving && onClose()}>
      <div className="mn-modal" style={{ width: 760 }} role="dialog" aria-modal="true" aria-labelledby="mn-photos-title" onClick={(e) => e.stopPropagation()}>
        <div className="mn-modal-head">
          <div>
            <span className="mn-hint">Menu file › Add photos…</span>
            <h2 id="mn-photos-title">{rows.length ? `Add photos — ${rows.length} ${rows.length === 1 ? 'file' : 'files'}` : 'Add photos'}</h2>
            <span className="mn-muted">Matched by file name: the dish code (MNS-02.jpg) or the dish name (manchow-soup.jpg).</span>
          </div>
          <button type="button" className="mn-modal-x" onClick={onClose} aria-label="Close" disabled={!!saving}>×</button>
        </div>

        <div className="mn-modal-body">
          <section
            className={`mn-drop${over ? ' is-over' : ''}`}
            style={{ padding: rows.length ? '14px 18px' : undefined }}
            onDragOver={(e) => { e.preventDefault(); setOver(true) }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files) }}
          >
            {!rows.length && <b style={{ fontSize: 16 }}>Drop dish photos here</b>}
            <label className={`mn-btn ${rows.length ? '' : 'pri'}`} style={{ cursor: 'pointer' }}>
              {rows.length ? 'Add more photos' : 'Choose photos'}
              <input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => { take(e.target.files); e.target.value = '' }} />
            </label>
            {!rows.length && <span className="mn-muted">Up to {MAX_FILES} at a time. Each is resized here before it is sent.</span>}
          </section>

          {rows.length > 0 && (
            <div className="mn-table-wrap">
              <table className="mn-table mn-photo-table">
                <thead><tr><th>Photo</th><th>File</th><th>Dish</th><th /><th /></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key}>
                      <td><img src={r.preview} alt="" /></td>
                      <td className="mn-mono" style={{ wordBreak: 'break-all' }}>{r.file.name}</td>
                      <td>
                        <select className="mn-select" style={{ minHeight: 38, maxWidth: 240, ...(r.itemId ? {} : { borderColor: '#f59e0b', background: '#fffbeb' }) }}
                          value={r.itemId} onChange={(e) => setDish(r.key, e.target.value)} aria-label={`Dish for ${r.file.name}`} disabled={!!saving}>
                          <option value="">Choose a dish…</option>
                          {sorted.map((d) => <option key={d.itemId} value={d.itemId}>{d.name}{d.code ? ` (${d.code})` : ''}</option>)}
                        </select>
                        {r.by && r.by !== 'hand' && <span className="mn-hint" style={{ display: 'block' }}>matched by {r.by}</span>}
                      </td>
                      <td>{statusOf(r)}</td>
                      <td><button type="button" className="mn-modal-x" aria-label={`Leave out ${r.file.name}`} onClick={() => remove(r.key)} disabled={!!saving}>×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mn-modal-foot" style={{ alignItems: 'center' }}>
          <span className="mn-hint" style={{ marginRight: 'auto' }}>
            {saving ? `Saving ${saving.done} of ${saving.total}…` : unmatched ? `${unmatched} ${unmatched === 1 ? 'file needs' : 'files need'} a dish.` : ''}
          </span>
          <button type="button" className="mn-btn" onClick={onClose} disabled={!!saving}>Cancel</button>
          <button type="button" className="mn-btn pri" onClick={save} disabled={!!saving || ready.length === 0}>
            {saving ? 'Saving…' : `Save ${ready.length} ${ready.length === 1 ? 'photo' : 'photos'}`}
          </button>
        </div>
      </div>
    </div>
  )
}

export default AddPhotosDialog
