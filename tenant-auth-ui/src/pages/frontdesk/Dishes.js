import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import menuService from '../../services/menuService'
import { useCan } from '../../hooks/useCan'
import { SCOPES } from '../../constants'
import { downloadTemplate, downloadSampleZip } from '../../utils/menuFile'
import MenuFileMenu from './MenuFileMenu'
import ClearMenuDialog from './ClearMenuDialog'
import AddPhotosDialog from './AddPhotosDialog'
import DishPhoto from '../../components/DishPhoto'
import { preparePhoto } from '../../utils/dishPhoto'
import './menu.css'

const money = (n) => (n === null || n === undefined ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`)
const isVegName = (diet) => /veg|vegan|jain/i.test(diet || '') && !/non/i.test(diet || '')

/**
 * Menu › Dishes — one line per dish, whatever branches it is sold at.
 *
 * The way in to everything else: Add dish opens the one-page editor, a row
 * opens that dish, and "Menu file" moves a whole menu in or out — import, the
 * sample, a template, exports and (admins only) clearing the menu.
 * Bulk actions cover the jobs done to many dishes at once — hide for the
 * season, tag, list on a portal.
 */
const Dishes = () => {
  const navigate = useNavigate()
  const canWrite = useCan(SCOPES.POS_CONFIG_WRITE)
  // useCan always lets an admin through, so this is admins only.
  const canClear = useCan(SCOPES.TENANT_ADMIN)
  const [clearing, setClearing] = useState(false)
  const [cleared, setCleared] = useState(null)
  const [data, setData] = useState({ dishes: [], portals: [], channels: [] })
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [diet, setDiet] = useState('')
  const [status, setStatus] = useState('Active')
  const [selected, setSelected] = useState(new Set())
  const [bulkTag, setBulkTag] = useState('')
  const [bulkPortal, setBulkPortal] = useState('')
  const [bulkChannel, setBulkChannel] = useState('')
  const [busy, setBusy] = useState(false)
  const [noPhoto, setNoPhoto] = useState(false)
  const [addingPhotos, setAddingPhotos] = useState(false)
  // "+ photo" on a row: one hidden file input, aimed at the row clicked.
  const photoInput = useRef(null)
  const [photoFor, setPhotoFor] = useState(null)
  const [uploadingFor, setUploadingFor] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await menuService.listDishes())
    } catch (err) {
      toast.error(err?.response?.data?.message || 'The menu could not be loaded')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  const categories = useMemo(() => {
    const counts = new Map()
    data.dishes.forEach((d) => counts.set(d.category || 'Uncategorised', (counts.get(d.category || 'Uncategorised') || 0) + 1))
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [data.dishes])
  const diets = useMemo(() => [...new Set(data.dishes.map((d) => d.diet).filter(Boolean))].sort(), [data.dishes])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.dishes.filter((d) => (!category || (d.category || 'Uncategorised') === category)
      && (!diet || d.diet === diet)
      && (!status || d.status === status)
      && (!noPhoto || !d.photoVersion)
      && (!q || [d.name, d.code, ...(d.tags || [])].some((v) => String(v || '').toLowerCase().includes(q))))
  }, [data.dishes, query, category, diet, status, noPhoto])
  const withoutPhoto = useMemo(() => data.dishes.filter((d) => !d.photoVersion && d.status === 'Active').length, [data.dishes])

  const pickPhotoFor = (dish) => {
    setPhotoFor(dish)
    photoInput.current?.click()
  }
  const onRowPhoto = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !photoFor) return
    setUploadingFor(photoFor.itemId)
    try {
      const { dataUri, thumbDataUri } = await preparePhoto(file)
      await menuService.putDishPhoto(photoFor.itemId, dataUri, thumbDataUri)
      toast.success(`Photo saved for ${photoFor.name}`)
      await load()
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'The photo could not be saved')
    } finally {
      setUploadingFor(null)
    }
  }

  const toggle = (id) => setSelected((cur) => {
    const next = new Set(cur)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const allShownSelected = shown.length > 0 && shown.every((d) => selected.has(d.itemId))
  const toggleAll = () => setSelected(allShownSelected ? new Set() : new Set(shown.map((d) => d.itemId)))

  const runBulk = async (action, extra = {}) => {
    setBusy(true)
    try {
      const res = await menuService.bulkDishes({ itemIds: [...selected], action, ...extra })
      toast.success(`${res.updated} ${res.updated === 1 ? 'dish' : 'dishes'} updated`)
      setSelected(new Set())
      setBulkTag('')
      await load()
    } catch (err) {
      toast.error(err?.response?.data?.message || 'The change could not be made')
    } finally {
      setBusy(false)
    }
  }

  const totalCategories = categories.length
  const activeCount = useMemo(() => data.dishes.filter((d) => d.status === 'Active').length, [data.dishes])
  const hiddenCount = data.dishes.length - activeCount
  // Nothing on the menu: no dishes at all, or every one hidden while the list
  // shows what is on the menu (as after a clear).
  const menuEmpty = !loading && (data.dishes.length === 0 || (activeCount === 0 && status === 'Active' && !query))

  const onCleared = async (result, backupName) => {
    setClearing(false)
    setCleared({ ...result, backupName })
    setSelected(new Set())
    setStatus('Active')
    setCategory('')
    toast.success('Menu cleared')
    await load()
  }

  const fileAction = (fn, fallback) => async () => {
    try {
      toast.success(`Saved ${await fn()}`)
    } catch (err) {
      toast.error(err?.message || fallback)
    }
  }

  return (
    <div className="mn-page">
      <div className="mn-head">
        <div>
          <h1>Dishes</h1>
          <p className="mn-lead">
            {data.dishes.length} {data.dishes.length === 1 ? 'dish' : 'dishes'} · {totalCategories} {totalCategories === 1 ? 'category' : 'categories'}.
            Everything about a dish — price, options, where it is sold — on one page.
          </p>
        </div>
        <div className="mn-actions">
          <MenuFileMenu canWrite={canWrite} canClear={canClear} onClear={() => setClearing(true)} onAddPhotos={() => setAddingPhotos(true)} />
          {canWrite && <Link to="/menu/dishes/new" className="mn-btn pri">+ Add dish</Link>}
        </div>
      </div>

      <div className="mn-toolbar">
        <label htmlFor="mn-search" className="sr-only" style={{ position: 'absolute', left: -9999 }}>Search dishes</label>
        <input id="mn-search" className="mn-search" placeholder="Search name, code or tag" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="mn-select" value={diet} onChange={(e) => setDiet(e.target.value)} aria-label="Diet">
          <option value="">All diets</option>
          {diets.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className="mn-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="Active">On the menu</option>
          <option value="Hidden">Hidden</option>
          <option value="">All</option>
        </select>
      </div>

      <div className="mn-chips" role="group" aria-label="Category">
        <button type="button" className={`mn-chip${category ? '' : ' is-on'}`} aria-pressed={!category} onClick={() => setCategory('')}>All {data.dishes.length}</button>
        {categories.map(([name, n]) => (
          <button key={name} type="button" className={`mn-chip${category === name ? ' is-on' : ''}`} aria-pressed={category === name} onClick={() => setCategory(name)}>
            {name} {n}
          </button>
        ))}
        {withoutPhoto > 0 && (
          <button type="button" className={`mn-chip gap${noPhoto ? ' is-on' : ''}`} aria-pressed={noPhoto} onClick={() => setNoPhoto((v) => !v)}
            title="Dishes on the menu without a photo — guests see a plain text row for these">
            No photo {withoutPhoto}
          </button>
        )}
      </div>

      {canWrite && (
        <input ref={photoInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onRowPhoto} aria-label="Choose a dish photo" />
      )}
      {addingPhotos && (
        <AddPhotosDialog
          dishes={data.dishes}
          onClose={() => setAddingPhotos(false)}
          onSaved={async () => { setAddingPhotos(false); await load() }}
        />
      )}

      {canWrite && selected.size > 0 && (
        <div className="mn-bulk" role="region" aria-label="Bulk actions">
          <b>{selected.size} selected</b>
          <span style={{ flex: '1 1 auto' }} />
          <button type="button" className="mn-btn sm" disabled={busy} onClick={() => runBulk('hide')}>Hide</button>
          <button type="button" className="mn-btn sm" disabled={busy} onClick={() => runBulk('show')}>Show</button>
          <input className="mn-input sm" style={{ width: 150 }} placeholder="Tag" value={bulkTag} onChange={(e) => setBulkTag(e.target.value)} aria-label="Tag to add or remove" />
          <button type="button" className="mn-btn sm" disabled={busy || !bulkTag.trim()} onClick={() => runBulk('addTag', { value: bulkTag.trim() })}>Add tag</button>
          <button type="button" className="mn-btn sm" disabled={busy || !bulkTag.trim()} onClick={() => runBulk('removeTag', { value: bulkTag.trim() })}>Remove tag</button>
          {data.portals.length > 0 && (
            <>
              <select className="mn-select" value={bulkPortal} onChange={(e) => setBulkPortal(e.target.value)} aria-label="Portal" style={{ minHeight: 34 }}>
                <option value="">Portal…</option>
                {data.portals.map((p) => <option key={p.Id} value={p.Id}>{p.Name}</option>)}
              </select>
              <button type="button" className="mn-btn sm" disabled={busy || !bulkPortal} onClick={() => runBulk('list', { portalId: bulkPortal })}>List</button>
              <button type="button" className="mn-btn sm" disabled={busy || !bulkPortal} onClick={() => runBulk('unlist', { portalId: bulkPortal })}>Unlist</button>
            </>
          )}
          {(data.channels || []).length > 0 && (
            <>
              <select className="mn-select" value={bulkChannel} onChange={(e) => setBulkChannel(e.target.value)} aria-label="Channel" style={{ minHeight: 34 }}>
                <option value="">Channel…</option>
                {data.channels.map((c) => <option key={c.Id} value={c.Id}>{c.Name}</option>)}
              </select>
              <button type="button" className="mn-btn sm" disabled={busy || !bulkChannel} onClick={() => runBulk('addChannel', { channelId: bulkChannel })}
                title="Sell on this channel at every branch the dish is sold at">Add channel</button>
              <button type="button" className="mn-btn sm" disabled={busy || !bulkChannel} onClick={() => runBulk('removeChannel', { channelId: bulkChannel })}
                title="Stop selling on this channel at every branch">Remove channel</button>
            </>
          )}
        </div>
      )}

      {cleared && (
        <div className="mn-banner" role="status">
          <span>
            <b>Menu cleared.</b>{' '}
            {cleared.mode === 'empty'
              ? `${cleared.deleted} ${cleared.deleted === 1 ? 'dish' : 'dishes'} deleted, ${cleared.hidden} hidden.`
              : `${cleared.hidden} ${cleared.hidden === 1 ? 'dish' : 'dishes'} taken off the menu.`}
            {cleared.backupName && <> Backup saved as <span className="mn-mono">{cleared.backupName}</span>.</>}
          </span>
          {hiddenCount > 0 && (
            <button type="button" className="mn-link" onClick={() => setStatus('Hidden')}>
              Show the {hiddenCount} hidden {hiddenCount === 1 ? 'dish' : 'dishes'}
            </button>
          )}
          <button type="button" className="mn-modal-x" aria-label="Dismiss" onClick={() => setCleared(null)}>×</button>
        </div>
      )}

      {clearing && (
        <ClearMenuDialog
          dishCount={data.dishes.length}
          categoryCount={totalCategories}
          onClose={() => setClearing(false)}
          onCleared={onCleared}
        />
      )}

      {loading ? (
        <div className="mn-card" style={{ padding: 24 }}>Loading the menu…</div>
      ) : menuEmpty ? (
        <section className="mn-empty" aria-labelledby="mn-empty-title">
          <div>
            <h2 id="mn-empty-title">Your menu is empty</h2>
            <p className="mn-lead">
              {canWrite
                ? 'Start from our sample, bring back a backup, or load your own file. Whatever you import is checked and shown to you before anything is saved.'
                : 'No dish is on the menu yet. Someone who manages the menu can add dishes or import a menu file.'}
            </p>
          </div>
          {canWrite && (
            <div className="mn-empty-cards">
              <div className="mn-card mn-empty-card feature">
                <b>Use our sample menu</b>
                <span className="mn-muted">31 dishes in 9 categories, with variants, add-ons, hours and Zomato / Swiggy prices. Change anything after.</span>
                <Link to="/menu/dishes/import?sample=1" className="mn-btn pri">Load the sample menu</Link>
                <button type="button" className="mn-link" onClick={fileAction(downloadSampleZip, 'The sample menu could not be downloaded')}>or download it to edit first (.zip)</button>
              </div>
              {cleared?.backupName && (
                <div className="mn-card mn-empty-card">
                  <b>Restore the backup</b>
                  <span className="mn-muted">
                    The menu as it was before you cleared it, from <span className="mn-mono">{cleared.backupName}</span> — matched by code, so hidden dishes come back with their history.
                  </span>
                  <Link to="/menu/dishes/import" className="mn-btn">Import the backup</Link>
                </div>
              )}
              <div className="mn-card mn-empty-card">
                <b>Import your own file</b>
                <span className="mn-muted">A menu.csv from a spreadsheet, another outlet's export, or the blank template filled in.</span>
                <Link to="/menu/dishes/import" className="mn-btn">Import menu file</Link>
                <button type="button" className="mn-link" onClick={fileAction(downloadTemplate, 'The template could not be downloaded')}>Download blank template</button>
              </div>
              <div className="mn-card mn-empty-card">
                <b>Add dishes by hand</b>
                <span className="mn-muted">One page per dish. Categories, tags and tax groups are created as you type them.</span>
                <Link to="/menu/dishes/new" className="mn-btn">+ Add dish</Link>
              </div>
            </div>
          )}
        </section>
      ) : (
        <div className="mn-table-wrap">
          <table className="mn-table cards">
            <thead>
              <tr>
                {canWrite && <th><input type="checkbox" checked={allShownSelected} onChange={toggleAll} aria-label="Select all shown" /></th>}
                <th>Dish</th><th>Category</th><th>Price</th><th>Options</th><th>Sold at</th>
                {data.portals.map((p) => <th key={p.Id}>{p.Name}</th>)}
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((d) => (
                <tr key={d.itemId} className="is-click" onClick={() => navigate(`/menu/dishes/${d.itemId}`)}>
                  {canWrite && (
                    <td onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(d.itemId)} onChange={() => toggle(d.itemId)} aria-label={`Select ${d.name}`} />
                    </td>
                  )}
                  <td data-wide="">
                    <div className="mn-dish">
                      {d.photoVersion ? (
                        <DishPhoto itemId={d.itemId} version={d.photoVersion} className="mn-thumb-box" fallback={<span className="mn-thumb-box" style={{ background: '#f1f2f5' }} />} />
                      ) : canWrite ? (
                        <button type="button" className="mn-thumb-add" disabled={uploadingFor === d.itemId}
                          onClick={(e) => { e.stopPropagation(); pickPhotoFor(d) }} aria-label={`Add a photo of ${d.name}`}>
                          {uploadingFor === d.itemId ? '…' : '+ photo'}
                        </button>
                      ) : <span className="mn-thumb-box" style={{ background: '#f1f2f5' }} aria-hidden="true" />}
                      <span className={`mn-dot ${isVegName(d.diet) ? 'mn-veg' : 'mn-nonveg'}`} title={d.diet || ''} />
                      <span>
                        <Link to={`/menu/dishes/${d.itemId}`} onClick={(e) => e.stopPropagation()} style={{ fontWeight: 700, color: '#1f2937', textDecoration: 'none' }}>{d.name}</Link>
                        <span className="mn-mono" style={{ display: 'block' }}>{d.code}</span>
                      </span>
                    </div>
                  </td>
                  <td data-hide-sm="">{d.category}</td>
                  <td>
                    <b>{money(d.price)}</b>
                    {d.branchPrices > 0 && <span className="mn-muted" style={{ display: 'block' }}>{d.branchPrices} branch {d.branchPrices === 1 ? 'price' : 'prices'}</span>}
                  </td>
                  <td data-hide-sm="" className="mn-muted">
                    {[...d.variants.map((v) => (v.surcharge ? `${v.name} +${v.surcharge}` : v.name)), ...d.addonGroups].join(' · ') || '—'}
                  </td>
                  <td data-hide-sm="" className="mn-muted">{d.branchCount} {d.branchCount === 1 ? 'branch' : 'branches'} · {d.channelCount} channels</td>
                  {data.portals.map((p) => {
                    const l = d.portals.find((x) => x.portalId === p.Id)
                    return (
                      <td key={p.Id} data-hide-sm="">
                        <span className={`mn-pill ${l?.listed ? 'on' : 'off'}`}>
                          {l?.listed ? (l.price !== null && l.price !== undefined ? `Listed ${money(l.price)}` : 'Listed') : 'Not listed'}
                        </span>
                      </td>
                    )
                  })}
                  <td><span className={`mn-pill ${d.status === 'Active' ? 'on' : 'off'}`}>{d.status === 'Active' ? 'On' : 'Hidden'}</span></td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr><td colSpan={8} className="mn-muted" style={{ padding: 20 }}>No dish matches.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default Dishes
