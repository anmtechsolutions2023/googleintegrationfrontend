import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import menuService from '../../services/menuService'
import { useCan } from '../../hooks/useCan'
import { SCOPES } from '../../constants'
import ExportButton from '../../components/export/ExportButton'
import './menu.css'

const money = (n) => (n === null || n === undefined ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`)
const isVegName = (diet) => /veg|vegan|jain/i.test(diet || '') && !/non/i.test(diet || '')

/**
 * Menu › Dishes — one line per dish, whatever branches it is sold at.
 *
 * The way in to everything else: Add dish opens the one-page editor, a row
 * opens that dish, Import takes a whole menu file, Export gives it back.
 * Bulk actions cover the jobs done to many dishes at once — hide for the
 * season, tag, list on a portal.
 */
const Dishes = () => {
  const navigate = useNavigate()
  const canWrite = useCan(SCOPES.POS_CONFIG_WRITE)
  const [data, setData] = useState({ dishes: [], portals: [] })
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [diet, setDiet] = useState('')
  const [status, setStatus] = useState('Active')
  const [selected, setSelected] = useState(new Set())
  const [bulkTag, setBulkTag] = useState('')
  const [bulkPortal, setBulkPortal] = useState('')
  const [busy, setBusy] = useState(false)

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
      && (!q || [d.name, d.code, ...(d.tags || [])].some((v) => String(v || '').toLowerCase().includes(q))))
  }, [data.dishes, query, category, diet, status])

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
          {canWrite && <Link to="/menu/dishes/import" className="mn-btn">Import menu</Link>}
          <ExportButton exportKey={['menu', 'menu-addons', 'menu-hours']} className="mn-btn" />
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
      </div>

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
        </div>
      )}

      {loading ? (
        <div className="mn-card" style={{ padding: 24 }}>Loading the menu…</div>
      ) : data.dishes.length === 0 ? (
        <div className="mn-card" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
          <b style={{ fontSize: 18 }}>No dishes yet</b>
          <span className="mn-muted">Add one by hand, or load a whole menu from a file — our sample menu has 31 dishes you can start from and change.</span>
          {canWrite && (
            <div className="mn-actions">
              <Link to="/menu/dishes/new" className="mn-btn pri">+ Add dish</Link>
              <Link to="/menu/dishes/import" className="mn-btn">Import a menu file</Link>
            </div>
          )}
        </div>
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
                      <span className={`mn-dot ${isVegName(d.diet) ? 'mn-veg' : 'mn-nonveg'}`} title={d.diet || ''} />
                      <span>
                        <Link to={`/menu/dishes/${d.itemId}`} onClick={(e) => e.stopPropagation()} style={{ fontWeight: 700, color: '#1f2937', textDecoration: 'none' }}>{d.name}</Link>
                        <span className="mn-mono" style={{ display: 'block' }}>{[d.code, d.hasPhoto ? 'photo' : null].filter(Boolean).join(' · ')}</span>
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
