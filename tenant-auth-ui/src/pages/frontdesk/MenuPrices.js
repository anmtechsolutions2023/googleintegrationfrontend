import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import menuService from '../../services/menuService'
import { useCan } from '../../hooks/useCan'
import { SCOPES } from '../../constants'
import ExportButton from '../../components/export/ExportButton'
import './menu.css'

const fmt = (n) => (n === null || n === undefined || n === '' ? '' : String(n))
const ROUNDING = {
  up5: { label: 'up to ₹5', fn: (n) => Math.ceil(n / 5) * 5 },
  up10: { label: 'up to ₹10', fn: (n) => Math.ceil(n / 10) * 10 },
  one: { label: 'to ₹1', fn: (n) => Math.round(n) },
  none: { label: 'not rounded', fn: (n) => Math.round(n * 100) / 100 },
}

/**
 * Menu › Prices & channels — every price in one grid.
 *
 * Grey = inherited from the base price; amber = changed and not saved. A rule
 * fills many cells at once ("Zomato = base + 15%, rounded up to ₹5"); nothing
 * is saved until the review, and then it is all saved together.
 */
const MenuPrices = () => {
  const canWrite = useCan(SCOPES.POS_CONFIG_WRITE)
  const [grid, setGrid] = useState(null)
  const [edits, setEdits] = useState({}) // `${itemId}|${col}` → { price?, listed? }
  const [selected, setSelected] = useState(new Set())
  const [query, setQuery] = useState('')
  const [rule, setRule] = useState({ col: '', from: 'base', amount: '15', unit: '%', round: 'up5' })
  const [reviewing, setReviewing] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const g = await menuService.getMenuPrices()
      setGrid(g)
      setEdits({})
      setRule((r) => ({ ...r, col: r.col || (g.portals[0] ? `p:${g.portals[0].Id}` : 'base') }))
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Prices could not be loaded')
    }
  }, [])
  useEffect(() => { load() }, [load])

  const columns = useMemo(() => (grid ? [
    { col: 'base', label: 'Base price' },
    ...grid.branches.map((b) => ({ col: `b:${b.Id}`, label: b.Name, branchId: b.Id })),
    ...grid.portals.map((p) => ({ col: `p:${p.Id}`, label: p.Name, portalId: p.Id })),
  ] : []), [grid])

  if (!grid) return <div className="mn-page"><div className="mn-card" style={{ padding: 24 }}>Loading prices…</div></div>

  const current = (row, col) => {
    if (col === 'base') return { price: row.price }
    if (col.startsWith('b:')) {
      const b = row.branches[col.slice(2)]
      return b ? { sold: true, price: b.price } : { sold: false, price: null }
    }
    const p = row.portals[col.slice(2)]
    return { listed: !!p?.listed, price: p?.price ?? null }
  }
  const value = (row, col) => ({ ...current(row, col), ...(edits[`${row.itemId}|${col}`] || {}) })
  const edit = (row, col, patch) => setEdits((e) => {
    const k = `${row.itemId}|${col}`
    const next = { ...(e[k] || {}), ...patch }
    const cur = current(row, col)
    const same = Object.keys(next).every((f) => String(next[f] ?? '') === String(cur[f] ?? ''))
    const copy = { ...e }
    if (same) delete copy[k]; else copy[k] = next
    return copy
  })

  const q = query.trim().toLowerCase()
  const rows = grid.rows.filter((r) => !q || [r.name, r.code, r.category].some((v) => String(v || '').toLowerCase().includes(q)))

  const applyRule = () => {
    const amount = Number(rule.amount)
    if (!Number.isFinite(amount)) { toast.error('The rule needs a number'); return }
    const targets = rows.filter((r) => selected.size === 0 || selected.has(r.itemId))
    let n = 0
    targets.forEach((r) => {
      if (rule.col.startsWith('b:') && !current(r, rule.col).sold) return
      const start = rule.from === 'base' ? Number(r.price) : Number(value(r, rule.col).price ?? r.price)
      if (!Number.isFinite(start)) return
      const raw = rule.unit === '%' ? start * (1 + amount / 100) : start + amount
      const price = ROUNDING[rule.round].fn(raw)
      edit(r, rule.col, rule.col.startsWith('p:') ? { price, listed: true } : { price })
      n += 1
    })
    toast.info(`${n} ${n === 1 ? 'cell' : 'cells'} filled — review to save`)
  }

  const changes = Object.entries(edits).map(([k, v]) => {
    const [itemId, col] = k.split('|')
    const row = grid.rows.find((r) => r.itemId === itemId)
    const colDef = columns.find((c) => c.col === col)
    return { row, colDef, before: current(row, col), after: { ...current(row, col), ...v }, v }
  })

  const save = async () => {
    setSaving(true)
    try {
      const payload = changes.map(({ row, colDef, v }) => {
        const price = v.price === undefined ? undefined : (v.price === '' || v.price === null ? null : Number(v.price))
        if (colDef.portalId) return { itemId: row.itemId, portalId: colDef.portalId, ...(price !== undefined ? { price } : {}), ...(v.listed !== undefined ? { listed: v.listed } : {}) }
        if (colDef.branchId) return { itemId: row.itemId, branchId: colDef.branchId, price: price ?? null }
        return { itemId: row.itemId, price }
      })
      const res = await menuService.saveMenuPrices(payload)
      toast.success(`Saved — ${res.updated} ${res.updated === 1 ? 'dish' : 'dishes'} updated`)
      setReviewing(false)
      setSelected(new Set())
      await load()
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Prices could not be saved')
    } finally {
      setSaving(false)
    }
  }

  const word = (c, s) => {
    if (c.colDef.portalId) return s.listed ? `listed, ${s.price === null || s.price === '' || s.price === undefined ? 'base price' : `₹${s.price}`}` : 'not listed'
    return s.price === null || s.price === '' || s.price === undefined ? (c.colDef.branchId ? 'base' : '—') : `₹${s.price}`
  }
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.itemId))

  return (
    <div className="mn-page" style={{ paddingBottom: changes.length ? 80 : 0 }}>
      <div className="mn-head">
        <div>
          <h1>Prices &amp; channels</h1>
          <p className="mn-lead">Type in any cell. Grey = the base price. Amber = changed, not saved yet.</p>
        </div>
        <div className="mn-actions">
          <ExportButton exportKey="menu" label="Export menu file" className="mn-btn" />
          <Link to="/menu/dishes/import" className="mn-btn">Import prices</Link>
        </div>
      </div>

      {canWrite && (
        <section className="mn-card mn-rule" aria-label="Price rule">
          <b style={{ alignSelf: 'center' }}>{selected.size ? `${selected.size} selected:` : 'All shown:'}</b>
          <div className="mn-field"><label htmlFor="r-col">Set</label>
            <select id="r-col" className="mn-select" value={rule.col} onChange={(e) => setRule({ ...rule, col: e.target.value })}>
              {columns.map((c) => <option key={c.col} value={c.col}>{c.label}{c.portalId ? ' price' : c.branchId ? ' price' : ''}</option>)}
            </select>
          </div>
          <div className="mn-field"><label htmlFor="r-from">to</label>
            <select id="r-from" className="mn-select" value={rule.from} onChange={(e) => setRule({ ...rule, from: e.target.value })}>
              <option value="base">Base price</option><option value="current">Its current price</option>
            </select>
          </div>
          <div className="mn-field"><label htmlFor="r-amt">plus</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input id="r-amt" className="mn-input sm num" style={{ width: 70 }} value={rule.amount} onChange={(e) => setRule({ ...rule, amount: e.target.value })} />
              <select className="mn-select" aria-label="Percent or rupees" value={rule.unit} onChange={(e) => setRule({ ...rule, unit: e.target.value })}><option>%</option><option>₹</option></select>
            </div>
          </div>
          <div className="mn-field"><label htmlFor="r-round">rounded</label>
            <select id="r-round" className="mn-select" value={rule.round} onChange={(e) => setRule({ ...rule, round: e.target.value })}>
              {Object.entries(ROUNDING).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
            </select>
          </div>
          <button type="button" className="mn-btn pri" onClick={applyRule}>Fill cells</button>
          <span className="mn-hint" style={{ flex: '1 1 220px' }}>Fills the cells; nothing is saved until you review. A negative amount lowers prices.</span>
        </section>
      )}

      <div className="mn-toolbar">
        <input className="mn-search" placeholder="Search dishes" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search dishes" />
      </div>

      <div className="mn-table-wrap">
        <table className="mn-table" style={{ minWidth: 640 + columns.length * 110 }}>
          <thead>
            <tr>
              {canWrite && <th><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.itemId)))} aria-label="Select all" /></th>}
              <th style={{ position: 'sticky', left: 0, background: '#f8f9fb' }}>Dish</th>
              {columns.map((c) => <th key={c.col}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.itemId}>
                {canWrite && <td><input type="checkbox" checked={selected.has(r.itemId)} aria-label={`Select ${r.name}`}
                  onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(r.itemId)) n.delete(r.itemId); else n.add(r.itemId); return n })} /></td>}
                <td style={{ position: 'sticky', left: 0, background: '#fff' }}>
                  <b>{r.name}</b><span className="mn-mono" style={{ display: 'block' }}>{[r.category, r.taxIncluded ? 'MRP' : null, r.status === 'Hidden' ? 'hidden' : null].filter(Boolean).join(' · ')}</span>
                </td>
                {columns.map((c) => {
                  const v = value(r, c.col)
                  const changed = !!edits[`${r.itemId}|${c.col}`]
                  if (c.branchId && !v.sold) return <td key={c.col} className="mn-muted">Not sold</td>
                  if (c.portalId) {
                    return (
                      <td key={c.col} style={{ whiteSpace: 'nowrap' }}>
                        <input type="checkbox" disabled={!canWrite} checked={!!v.listed} aria-label={`${r.name} on ${c.label}`} onChange={(e) => edit(r, c.col, { listed: e.target.checked })} />{' '}
                        <input className={`mn-price${changed ? ' chg' : ''}${v.price === null || v.price === '' ? ' inh' : ''}`} disabled={!canWrite || !v.listed}
                          value={fmt(v.price)} placeholder={fmt(r.price)} inputMode="decimal" aria-label={`${r.name} ${c.label} price`}
                          onChange={(e) => edit(r, c.col, { price: e.target.value === '' ? null : e.target.value })} />
                      </td>
                    )
                  }
                  return (
                    <td key={c.col}>
                      <input className={`mn-price${changed ? ' chg' : ''}${c.branchId && (v.price === null || v.price === '') ? ' inh' : ''}`} disabled={!canWrite}
                        value={fmt(v.price)} placeholder={c.branchId ? fmt(r.price) : ''} inputMode="decimal" aria-label={`${r.name} ${c.label}`}
                        onChange={(e) => edit(r, c.col, { price: e.target.value === '' ? (c.branchId ? null : '') : e.target.value })} />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {reviewing && (
        <section className="mn-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }} aria-label="Review changes">
          <h2 style={{ margin: 0, fontSize: 17 }}>Review — {changes.length} {changes.length === 1 ? 'change' : 'changes'}</h2>
          <div className="mn-table-wrap">
            <table className="mn-table">
              <thead><tr><th>Dish</th><th>Where</th><th>Was</th><th>Now</th></tr></thead>
              <tbody>
                {changes.map((c) => (
                  <tr key={`${c.row.itemId}${c.colDef.col}`}><td>{c.row.name}</td><td>{c.colDef.label}</td><td className="mn-muted">{word(c, c.before)}</td><td><b>{word(c, c.after)}</b></td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <span className="mn-hint">Saved together, all or nothing. Changed portal prices are marked to send to the portal. Every change is in the audit log.</span>
        </section>
      )}

      {canWrite && changes.length > 0 && (
        <div className="mn-savebar">
          <span className="mn-muted">{changes.length} unsaved {changes.length === 1 ? 'change' : 'changes'}</span>
          <button type="button" className="mn-btn" onClick={() => { setEdits({}); setReviewing(false) }} disabled={saving}>Discard</button>
          {!reviewing
            ? <button type="button" className="mn-btn pri" onClick={() => setReviewing(true)}>Review {changes.length}</button>
            : <button type="button" className="mn-btn pri" onClick={save} disabled={saving}>{saving ? 'Saving…' : `Save ${changes.length}`}</button>}
        </div>
      )}
    </div>
  )
}

export default MenuPrices
