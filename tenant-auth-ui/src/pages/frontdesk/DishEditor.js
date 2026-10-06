import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import menuService from '../../services/menuService'
import { preparePhoto } from '../../utils/dishPhoto'
import { useCan } from '../../hooks/useCan'
import { SCOPES } from '../../constants'
import './menu.css'

// ── Small helpers ────────────────────────────────────────────────────────────

const key = (v) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()
const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v))
const round2 = (n) => Math.round(Number(n) * 100) / 100
const isVegName = (diet) => /veg|vegan|jain/i.test(diet || '') && !/non/i.test(diet || '')
/** Portal price suggestion: base + 15%, rounded up to ₹5 — the common markup. */
const suggestPortalPrice = (base) => (base ? Math.ceil((Number(base) * 1.15) / 5) * 5 : null)
const EXEMPT = 'Exempt (0%)'

const NUTRITION = [
  ['ServingSizeG', 'Serving (g)'], ['Calories', 'Calories'], ['ProteinG', 'Protein (g)'], ['CarbohydrateG', 'Carbs (g)'],
  ['SugarG', 'Sugar (g)'], ['FatG', 'Fat (g)'], ['SaturatedFatG', 'Sat. fat (g)'], ['FibreG', 'Fibre (g)'], ['SodiumMg', 'Sodium (mg)'],
]

/**
 * A text box that suggests what exists and offers to create what does not.
 * The value is always the typed name; the server creates it on save.
 */
const Combo = ({ id, label, value, onChange, options = [], placeholder, hint, createLabel = 'Create', disabled, invalid }) => {
  const [open, setOpen] = useState(false)
  const typed = clean(value)
  const exact = options.find((o) => key(o) === key(typed))
  const matches = options.filter((o) => !typed || key(o).includes(key(typed))).slice(0, 8)
  return (
    <div className="mn-field">
      {label && <label htmlFor={id}>{label}</label>}
      <input
        id={id} className="mn-input" value={value || ''} placeholder={placeholder} disabled={disabled} autoComplete="off"
        aria-invalid={invalid ? 'true' : undefined}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && !disabled && (matches.length > 0 || (typed && !exact)) && (
        <div className="mn-suggest" role="listbox" aria-label={`${label || 'Suggestions'}`}>
          {typed && !exact && (
            <button type="button" className="mn-create" onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(typed); setOpen(false) }}>
              + {createLabel} “{typed}”
            </button>
          )}
          {matches.map((o) => (
            <button key={o} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(o); setOpen(false) }}>{o}</button>
          ))}
        </div>
      )}
      {hint && <span className="mn-hint">{hint}</span>}
    </div>
  )
}

/** Chips plus a combo for adding more. */
const ChipInput = ({ id, label, values, onChange, options, known, disabled, placeholder }) => {
  const [draft, setDraft] = useState('')
  const add = (v) => {
    const t = clean(v)
    if (!t || values.some((x) => key(x) === key(t))) { setDraft(''); return }
    onChange([...values, options.find((o) => key(o) === key(t)) || t])
    setDraft('')
  }
  return (
    <div className="mn-field">
      {label && <span className="mn-label">{label}</span>}
      <div className="mn-tags">
        {values.map((v) => {
          const isNew = !known.some((k) => key(k) === key(v))
          return (
            <span key={v} className={`mn-tag${isNew ? ' new' : ''}`}>
              {v}{isNew ? ' · new' : ''}
              {!disabled && <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}>×</button>}
            </span>
          )
        })}
      </div>
      {!disabled && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 auto', maxWidth: 320 }}>
            <Combo id={id} value={draft} onChange={(v) => { setDraft(v); if (options.some((o) => o === v)) add(v) }} options={options.filter((o) => !values.includes(o))} placeholder={placeholder} createLabel="Add" />
          </div>
          <button type="button" className="mn-btn sm" style={{ marginTop: 4 }} disabled={!clean(draft)} onClick={() => add(draft)}>Add</button>
        </div>
      )}
    </div>
  )
}

const blankDish = (opts) => ({
  code: '', name: '', category: '', description: '', diet: (opts.foodTypes[0] && opts.foodTypes[0].Name) || 'Veg',
  meatType: '', unit: 'Plate', sku: '', barcode: '', hsn: '', sac: '996331',
  price: '', taxGroup: (opts.taxGroups.find((g) => /5\s*%/.test(g.Name)) || opts.taxGroups.find((g) => g.Name !== EXEMPT) || {}).Name || '',
  taxComponents: undefined, taxIncluded: false,
  // A new dish goes on every branch and every channel — untick where not sold.
  branches: opts.branches.map((b) => ({ branchId: b.Id, channelIds: opts.channels.map((c) => c.Id), price: null })),
  variants: [], addonGroups: [], tags: [],
  serves: '', portion: '', prepMin: '', maxPerOrder: '', stockTracked: false,
  nutrition: null, portals: [], status: 'Active',
})

/**
 * Menu › Dishes › one dish — everything about it on one page.
 *
 * Nothing has to exist first. Name a category, unit, tag, variant, add-on
 * group or tax group that is not there yet and it is created when you save —
 * the panel on the right says exactly what will be. Diet, options, tags,
 * serving and nutrition apply to every branch the dish is sold at; prices may
 * differ per branch and per portal.
 */
const DishEditor = () => {
  const { itemId } = useParams()
  const isNew = !itemId
  const navigate = useNavigate()
  const location = useLocation()
  const canWrite = useCan(SCOPES.POS_CONFIG_WRITE)
  const [opts, setOpts] = useState(null)
  const [dish, setDish] = useState(null)
  const [photo, setPhoto] = useState(null) // data URI shown
  const [pendingPhoto, setPendingPhoto] = useState(null) // to upload on save
  const [rates, setRates] = useState([{ name: 'CGST', value: '2.5' }, { name: 'SGST', value: '2.5' }])
  const [showNutrition, setShowNutrition] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const [otherDiet, setOtherDiet] = useState('')
  const fileRef = useRef(null)

  useEffect(() => {
    let live = true
    const copyOf = location.state?.copyOf
    Promise.all([menuService.getMenuOptions(), isNew ? Promise.resolve(null) : menuService.getDish(itemId)])
      .then(([o, d]) => {
        if (!live) return
        setOpts(o)
        if (d) {
          setDish({ ...d, serves: d.serves ?? '', prepMin: d.prepMin ?? '', maxPerOrder: d.maxPerOrder ?? '' })
          setShowNutrition(!!d.nutrition)
          if (d.hasPhoto) menuService.getDishPhoto(itemId).then((p) => live && setPhoto(p.dataUri)).catch(() => {})
        } else if (copyOf) {
          setDish({ ...copyOf, itemId: undefined, hasPhoto: false, code: '', name: `${copyOf.name} (copy)` })
        } else {
          setDish(blankDish(o))
        }
      })
      .catch((err) => toast.error(err?.response?.data?.message || 'The dish could not be loaded'))
    return () => { live = false }
  }, [itemId, isNew, location.state])

  const set = (patch) => setDish((d) => ({ ...d, ...patch }))

  const names = useMemo(() => (opts ? {
    categories: opts.categories.map((c) => c.Name),
    units: opts.units.map((u) => u.Name),
    taxGroups: opts.taxGroups.map((g) => g.Name),
    foodTypes: opts.foodTypes.map((f) => f.Name),
    meatTypes: opts.meatTypes.map((m) => m.Name),
    tags: opts.tags.map((t) => t.Name),
    variants: opts.variants.map((v) => v.Name),
    addonGroups: opts.addonGroups.map((g) => g.Name),
  } : null), [opts])

  const isKnown = (list, v) => !clean(v) || list.some((x) => key(x) === key(v))
  const newTaxGroup = dish && opts && clean(dish.taxGroup) && clean(dish.taxGroup) !== EXEMPT && !isKnown(names.taxGroups, dish.taxGroup)

  // What saving will create along with the dish — the editor's promise that
  // nothing appears by surprise.
  const alsoCreates = useMemo(() => {
    if (!dish || !names) return []
    const out = []
    const one = (label, list, v) => { if (clean(v) && !isKnown(list, v)) out.push(`${label} ${clean(v)}`) }
    one('Category', names.categories, dish.category)
    one('Unit', names.units, dish.unit)
    one('Diet', names.foodTypes, dish.diet)
    one('Meat type', names.meatTypes, dish.meatType)
    if (newTaxGroup) out.push(`Tax group ${clean(dish.taxGroup)} (${rates.map((r) => `${r.name} ${r.value}%`).join(' + ')})`)
    dish.variants.forEach((v) => one('Variant', names.variants, v.name))
    dish.addonGroups.forEach((g) => one('Add-on group', names.addonGroups, g))
    dish.tags.forEach((t) => one('Tag', names.tags, t))
    return out
  }, [dish, names, newTaxGroup, rates])

  if (!dish || !opts) return <div className="mn-page"><div className="mn-card" style={{ padding: 24 }}>Loading…</div></div>

  const base = num(dish.price)
  const taxGroup = opts.taxGroups.find((g) => key(g.Name) === key(dish.taxGroup))
  const components = newTaxGroup ? rates : (taxGroup?.Components || [])
  const rateTotal = components.reduce((s, c) => s + (Number(c.value) || 0), 0)
  const guestPays = base === null ? null : (dish.taxIncluded ? base : round2(base * (1 + rateTotal / 100)))
  const veg = isVegName(dish.diet)

  const problems = []
  if (!clean(dish.name)) problems.push('name')
  if (!clean(dish.category)) problems.push('category')
  if (!clean(dish.unit)) problems.push('unit')
  if (!clean(dish.diet)) problems.push('diet')
  if (base === null || !Number.isFinite(base) || base < 0) problems.push('price')
  if (newTaxGroup && rates.some((r) => !clean(r.name) || !Number.isFinite(Number(r.value)))) problems.push('tax rates')
  if (dish.variants.some((v) => !clean(v.name) || !Number.isFinite(Number(v.surcharge)) || Number(v.surcharge) < 0)) problems.push('variants')

  const branchEntry = (id) => dish.branches.find((b) => b.branchId === id)
  const setBranch = (id, patch) => {
    const has = branchEntry(id)
    if (patch === null) { set({ branches: dish.branches.filter((b) => b.branchId !== id) }); return }
    set({ branches: has ? dish.branches.map((b) => (b.branchId === id ? { ...b, ...patch } : b)) : [...dish.branches, { branchId: id, channelIds: opts.channels.map((c) => c.Id), price: null, ...patch }] })
  }
  const portalEntry = (id) => dish.portals.find((p) => p.portalId === id) || { portalId: id, listed: false, price: null, name: null }
  const setPortal = (id, patch) => {
    const cur = portalEntry(id)
    const next = { ...cur, ...patch }
    set({ portals: dish.portals.some((p) => p.portalId === id) ? dish.portals.map((p) => (p.portalId === id ? next : p)) : [...dish.portals, next] })
  }

  const save = async () => {
    if (problems.length) { setShowErrors(true); toast.error(`Fill in: ${problems.join(', ')}`); return }
    setSaving(true)
    const payload = {
      ...dish,
      price: base,
      code: clean(dish.code) || null,
      meatType: veg ? null : (clean(dish.meatType) || null),
      taxGroup: clean(dish.taxGroup) || null,
      taxComponents: newTaxGroup ? rates.map((r) => ({ name: clean(r.name).toUpperCase(), value: String(Number(r.value)) })) : undefined,
      serves: num(dish.serves),
      prepMin: num(dish.prepMin),
      maxPerOrder: num(dish.maxPerOrder),
      variants: dish.variants.map((v) => ({ name: clean(v.name), surcharge: Number(v.surcharge) || 0 })),
      branches: dish.branches.map((b) => ({ ...b, price: b.price === '' ? null : num(b.price) })),
      portals: dish.portals.map((p) => ({ ...p, price: p.price === '' ? null : num(p.price), name: clean(p.name) || null })),
      nutrition: dish.nutrition && Object.values(dish.nutrition).some((v) => v !== null && v !== '') ? dish.nutrition : null,
    }
    delete payload.itemId
    delete payload.hasPhoto
    delete payload.photoVersion
    try {
      const res = isNew ? await menuService.createDish(payload) : await menuService.updateDish(itemId, payload)
      if (pendingPhoto) {
        try { await menuService.putDishPhoto(res.itemId, pendingPhoto.dataUri, pendingPhoto.thumbDataUri) } catch (err) {
          toast.warn(err?.response?.data?.message || 'The dish was saved, but the photo was not.')
        }
      }
      const created = Object.values(res.alsoCreated || {}).flat()
      toast.success(created.length ? `Saved. Also created: ${created.join(', ')}` : 'Dish saved')
      navigate('/menu/dishes')
    } catch (err) {
      toast.error(err?.response?.data?.message || 'The dish could not be saved')
    } finally {
      setSaving(false)
    }
  }

  const onPhoto = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const prepared = await preparePhoto(file)
      setPhoto(prepared.dataUri)
      setPendingPhoto(prepared)
    } catch (err) {
      toast.error(err.message)
    }
  }
  const removePhoto = async () => {
    if (!isNew && dish.hasPhoto && !pendingPhoto) {
      try { await menuService.deleteDishPhoto(itemId); set({ hasPhoto: false }) } catch { toast.error('The photo could not be removed') ; return }
    }
    setPhoto(null)
    setPendingPhoto(null)
  }

  const ro = !canWrite
  const listedPortals = dish.portals.filter((p) => p.listed)

  return (
    <div className="mn-page">
      <div className="mn-head">
        <div>
          <button type="button" className="mn-link" onClick={() => navigate('/menu/dishes')}>← Dishes</button>
          <h1>{isNew ? 'New dish' : dish.name}</h1>
          {!isNew && dish.code && <span className="mn-mono">{dish.code}</span>}
        </div>
        {!isNew && canWrite && (
          <div className="mn-actions">
            <button type="button" className="mn-btn" onClick={() => navigate('/menu/dishes/new', { state: { copyOf: dish } })}>Duplicate</button>
          </div>
        )}
      </div>

      <div className="mn-editor">
        <fieldset className="mn-form" disabled={ro} style={{ border: 0, padding: 0, margin: 0 }}>

          <section className="mn-sec" aria-labelledby="sec-1">
            <h2 id="sec-1">What it is</h2>
            <div className="mn-grid">
              <div className="mn-field">
                <label htmlFor="d-name">Name</label>
                <input id="d-name" className="mn-input" value={dish.name} onChange={(e) => set({ name: e.target.value })} aria-invalid={showErrors && !clean(dish.name) ? 'true' : undefined} />
              </div>
              <div className="mn-field">
                <label htmlFor="d-code">Code</label>
                <input id="d-code" className="mn-input" value={dish.code || ''} onChange={(e) => set({ code: e.target.value })} placeholder="e.g. MNS-07" />
                <span className="mn-hint">Optional. Matches this dish in the menu file even after a rename.</span>
              </div>
            </div>
            <Combo id="d-cat" label="Category" value={dish.category} onChange={(v) => set({ category: v })} options={names.categories}
              placeholder="Starters, Mains… or a new one" createLabel="Create category" invalid={showErrors && !clean(dish.category)}
              hint="“Mains › Rice” puts it under a parent category." />
            <div className="mn-field">
              <label htmlFor="d-desc">Description</label>
              <textarea id="d-desc" className="mn-input" value={dish.description || ''} onChange={(e) => set({ description: e.target.value })} maxLength={1000} />
            </div>
            <div className="mn-grid">
              <div className="mn-field">
                <span className="mn-label">Diet</span>
                <div className="mn-seg" role="group" aria-label="Diet">
                  {names.foodTypes.map((f) => (
                    <button key={f} type="button" className={key(f) === key(dish.diet) ? 'is-on' : ''} aria-pressed={key(f) === key(dish.diet)} onClick={() => set({ diet: f })}>{f}</button>
                  ))}
                  {!isKnown(names.foodTypes, dish.diet) && <button type="button" className="is-on" aria-pressed="true">{dish.diet} · new</button>}
                </div>
                {!ro && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="mn-input sm" style={{ maxWidth: 200 }} value={otherDiet} onChange={(e) => setOtherDiet(e.target.value)}
                      placeholder="Another diet, e.g. Egg" aria-label="Another diet" />
                    <button type="button" className="mn-btn sm" disabled={!clean(otherDiet)} onClick={() => { set({ diet: clean(otherDiet) }); setOtherDiet('') }}>Use</button>
                  </div>
                )}
              </div>
              <Combo id="d-meat" label="Meat type" value={veg ? '' : dish.meatType} onChange={(v) => set({ meatType: v })} options={names.meatTypes}
                placeholder={veg ? 'Not for a veg dish' : 'Chicken, Mutton, Fish…'} disabled={veg || ro} createLabel="Create" />
            </div>
            <div className="mn-grid">
              <Combo id="d-unit" label="Sold as (unit)" value={dish.unit} onChange={(v) => set({ unit: v })} options={names.units}
                placeholder="Plate, Piece, Glass…" createLabel="Create unit" invalid={showErrors && !clean(dish.unit)} />
              <div className="mn-field">
                <span className="mn-label">Photo</span>
                <div className="mn-photo">
                  {photo ? <img src={photo} alt={dish.name || 'Dish'} /> : <div className="mn-photo-empty">No photo</div>}
                  {!ro && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <button type="button" className="mn-btn sm" onClick={() => fileRef.current?.click()}>{photo ? 'Change photo' : 'Add a photo'}</button>
                      {photo && <button type="button" className="mn-link" onClick={removePhoto}>Remove</button>}
                      <span className="mn-hint">Square works best. Resized here before upload.</span>
                    </div>
                  )}
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onPhoto} aria-label="Choose a photo" />
                </div>
                {photo && (
                  <div className="mn-guest-row" aria-label="How guests see it">
                    <span className="mn-hint" style={{ gridColumn: '1 / -1' }}>How guests see it on the QR menu</span>
                    <span>
                      <b>{dish.name || 'Dish name'}</b>
                      <span>₹{Number(dish.price) || 0}</span>
                      {dish.description && <small>{dish.description}</small>}
                    </span>
                    <img src={photo} alt="" />
                  </div>
                )}
              </div>
            </div>
            <div className="mn-grid">
              <div className="mn-field"><label htmlFor="d-sku">SKU</label><input id="d-sku" className="mn-input" value={dish.sku || ''} onChange={(e) => set({ sku: e.target.value })} /></div>
              <div className="mn-field"><label htmlFor="d-bar">Barcode</label><input id="d-bar" className="mn-input" value={dish.barcode || ''} onChange={(e) => set({ barcode: e.target.value })} /></div>
            </div>
          </section>

          <section className="mn-sec" aria-labelledby="sec-2">
            <h2 id="sec-2">Price and tax</h2>
            <div className="mn-grid g3">
              <div className="mn-field">
                <label htmlFor="d-price">Price (₹)</label>
                <input id="d-price" className="mn-input num" inputMode="decimal" value={dish.price ?? ''} onChange={(e) => set({ price: e.target.value })}
                  aria-invalid={showErrors && problems.includes('price') ? 'true' : undefined} style={{ fontWeight: 700 }} />
                <span className="mn-hint">Every branch and channel, unless changed below.</span>
              </div>
              <Combo id="d-tax" label="Tax group" value={dish.taxGroup} onChange={(v) => set({ taxGroup: v })} options={names.taxGroups}
                placeholder={EXEMPT} createLabel="New tax group" hint="Blank sells it tax-free." />
              <div className="mn-field">
                <span className="mn-label">GST is</span>
                <div className="mn-seg" role="group" aria-label="GST added or included">
                  <button type="button" className={!dish.taxIncluded ? 'is-on' : ''} aria-pressed={!dish.taxIncluded} onClick={() => set({ taxIncluded: false })}>Added on top</button>
                  <button type="button" className={dish.taxIncluded ? 'is-on' : ''} aria-pressed={!!dish.taxIncluded} onClick={() => set({ taxIncluded: true })}>Inside the price</button>
                </div>
              </div>
            </div>
            {newTaxGroup && (
              <div className="mn-card mn-also" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <b>New tax group “{clean(dish.taxGroup)}” — what are its rates?</b>
                {rates.map((r, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input className="mn-input sm" style={{ width: 110 }} value={r.name} aria-label="Rate name" onChange={(e) => setRates(rates.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                    <input className="mn-input sm num" style={{ width: 90 }} value={r.value} aria-label="Rate %" onChange={(e) => setRates(rates.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                    <span className="mn-hint" style={{ alignSelf: 'center' }}>%</span>
                    {rates.length > 1 && <button type="button" className="mn-link" onClick={() => setRates(rates.filter((_, j) => j !== i))}>Remove</button>}
                  </div>
                ))}
                <button type="button" className="mn-link" onClick={() => setRates([...rates, { name: 'IGST', value: '' }])}>+ Add a rate</button>
                <span className="mn-hint">A new group is never saved without its rates, so nothing is silently taxed at 0%.</span>
              </div>
            )}
            <div className="mn-grid">
              <div className="mn-field"><label htmlFor="d-sac">SAC</label><input id="d-sac" className="mn-input" value={dish.sac || ''} onChange={(e) => set({ sac: e.target.value })} placeholder="996331 for restaurant service" /></div>
              <div className="mn-field"><label htmlFor="d-hsn">HSN</label><input id="d-hsn" className="mn-input" value={dish.hsn || ''} onChange={(e) => set({ hsn: e.target.value })} placeholder="For packaged goods" /></div>
            </div>
            {guestPays !== null && Number.isFinite(guestPays) && (
              <div className="mn-muted" style={{ background: '#f8f9fb', borderRadius: 10, padding: '10px 12px', fontSize: 14, color: '#1f2937' }}>
                Guest pays <b>₹{guestPays.toFixed(2)}</b>
                {!dish.taxIncluded && rateTotal > 0 && <> (₹{Number(base).toFixed(2)} + {components.map((c) => `${c.name} ${c.value}%`).join(' + ')})</>}
              </div>
            )}
          </section>

          <section className="mn-sec" aria-labelledby="sec-3">
            <h2 id="sec-3">Options <small>sizes and add-ons</small></h2>
            <div className="mn-field">
              <span className="mn-label">Variants — each adds its own price to this dish</span>
              {dish.variants.length > 0 && (
                <div className="mn-table-wrap">
                  <table className="mn-table">
                    <thead><tr><th>Variant</th><th>Adds</th><th>Guest pays</th><th><span style={{ position: 'absolute', left: -9999 }}>Remove</span></th></tr></thead>
                    <tbody>
                      {dish.variants.map((v, i) => (
                        <tr key={i}>
                          <td style={{ minWidth: 180 }}>
                            <Combo id={`d-var-${i}`} value={v.name} options={names.variants} createLabel="New variant"
                              onChange={(name) => {
                                const known = opts.variants.find((x) => key(x.Name) === key(name))
                                set({ variants: dish.variants.map((x, j) => (j === i ? { ...x, name, surcharge: x.surcharge === '' && known ? known.Price : x.surcharge } : x)) })
                              }} />
                          </td>
                          <td><input className="mn-input sm num" style={{ width: 100 }} inputMode="decimal" value={v.surcharge} aria-label={`${v.name || 'Variant'} adds`}
                            onChange={(e) => set({ variants: dish.variants.map((x, j) => (j === i ? { ...x, surcharge: e.target.value } : x)) })} /></td>
                          <td>{base !== null ? `₹${round2(base + (Number(v.surcharge) || 0))}` : '—'}</td>
                          <td>{!ro && <button type="button" className="mn-link" onClick={() => set({ variants: dish.variants.filter((_, j) => j !== i) })}>Remove</button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {!ro && <button type="button" className="mn-link" onClick={() => set({ variants: [...dish.variants, { name: dish.variants.length ? '' : 'Regular', surcharge: dish.variants.length ? '' : 0 }] })}>+ Add a variant</button>}
            </div>
            <ChipInput id="d-groups" label="Add-on groups" values={dish.addonGroups} onChange={(v) => set({ addonGroups: v })}
              options={names.addonGroups} known={names.addonGroups} disabled={ro} placeholder="Toppings, Dips… or a new group" />
            {dish.addonGroups.length > 0 && (
              <span className="mn-hint">
                {dish.addonGroups.map((g) => {
                  const grp = opts.addonGroups.find((x) => key(x.Name) === key(g))
                  if (!grp) return `${g}: new group — add its add-ons in Options › Add-ons or the add-ons file`
                  return `${grp.Name} (pick ${grp.MinSelection}–${grp.MaxSelection}): ${grp.Addons.map((a) => `${a.Name} ₹${a.Price}`).join(', ') || 'no add-ons yet'}`
                }).join(' · ')}
              </span>
            )}
          </section>

          <section className="mn-sec" aria-labelledby="sec-4">
            <h2 id="sec-4">Where it is sold</h2>
            <div className="mn-table-wrap">
              <table className="mn-table">
                <thead>
                  <tr><th>Branch</th><th>On</th>{opts.channels.map((c) => <th key={c.Id}>{c.Name}</th>)}<th>Price</th></tr>
                </thead>
                <tbody>
                  {opts.branches.map((b) => {
                    const e = branchEntry(b.Id)
                    return (
                      <tr key={b.Id}>
                        <td><b>{b.Name}</b></td>
                        <td><input type="checkbox" checked={!!e} aria-label={`Sold at ${b.Name}`} onChange={(ev) => setBranch(b.Id, ev.target.checked ? {} : null)} /></td>
                        {opts.channels.map((c) => (
                          <td key={c.Id}>
                            <input type="checkbox" disabled={!e || ro} checked={!!e && e.channelIds.includes(c.Id)} aria-label={`${b.Name} ${c.Name}`}
                              onChange={(ev) => setBranch(b.Id, { channelIds: ev.target.checked ? [...e.channelIds, c.Id] : e.channelIds.filter((x) => x !== c.Id) })} />
                          </td>
                        ))}
                        <td>
                          <input className="mn-price" inputMode="decimal" disabled={!e || ro} placeholder={base !== null ? String(base) : 'base'}
                            value={e && e.price !== null && e.price !== undefined ? e.price : ''} aria-label={`${b.Name} price`}
                            onChange={(ev) => setBranch(b.Id, { price: ev.target.value === '' ? null : ev.target.value })} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {opts.portals.length > 0 && (
              <div className="mn-table-wrap">
                <table className="mn-table">
                  <thead><tr><th>Online portal</th><th>Listed</th><th>Price there</th><th>Name there</th></tr></thead>
                  <tbody>
                    {opts.portals.map((p) => {
                      const e = portalEntry(p.Id)
                      return (
                        <tr key={p.Id}>
                          <td><b>{p.Name}</b></td>
                          <td><input type="checkbox" checked={!!e.listed} aria-label={`Listed on ${p.Name}`} onChange={(ev) => setPortal(p.Id, { listed: ev.target.checked })} /></td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <input className="mn-price" inputMode="decimal" disabled={!e.listed || ro} placeholder={base !== null ? String(base) : 'base'}
                              value={e.price ?? ''} aria-label={`${p.Name} price`} onChange={(ev) => setPortal(p.Id, { price: ev.target.value === '' ? null : ev.target.value })} />
                            {e.listed && !ro && base !== null && (
                              <button type="button" className="mn-link" style={{ marginLeft: 8 }} onClick={() => setPortal(p.Id, { price: suggestPortalPrice(base) })}>
                                Use ₹{suggestPortalPrice(base)} (+15%)
                              </button>
                            )}
                          </td>
                          <td><input className="mn-input sm" disabled={!e.listed || ro} value={e.name || ''} placeholder="Same as the dish" aria-label={`Name on ${p.Name}`} onChange={(ev) => setPortal(p.Id, { name: ev.target.value })} /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <span className="mn-hint">A blank price uses the base. Listing on a portal also turns on that portal's channel.</span>
          </section>

          <section className="mn-sec" aria-labelledby="sec-5">
            <h2 id="sec-5">Tags</h2>
            <ChipInput id="d-tags" values={dish.tags} onChange={(v) => set({ tags: v })} options={names.tags} known={names.tags} disabled={ro} placeholder="Chef special, Spicy… or a new tag" />
          </section>

          <section className="mn-sec" aria-labelledby="sec-6">
            <h2 id="sec-6">Serving and kitchen</h2>
            <div className="mn-grid g4">
              <div className="mn-field"><label htmlFor="d-serves">Serves</label><input id="d-serves" className="mn-input num" inputMode="numeric" value={dish.serves} onChange={(e) => set({ serves: e.target.value })} /></div>
              <div className="mn-field"><label htmlFor="d-portion">Portion</label><input id="d-portion" className="mn-input" value={dish.portion || ''} onChange={(e) => set({ portion: e.target.value })} placeholder="500 g, 8 pieces" /></div>
              <div className="mn-field"><label htmlFor="d-prep">Prep (min)</label><input id="d-prep" className="mn-input num" inputMode="numeric" value={dish.prepMin} onChange={(e) => set({ prepMin: e.target.value })} /></div>
              <div className="mn-field"><label htmlFor="d-max">Max per order</label><input id="d-max" className="mn-input num" inputMode="numeric" value={dish.maxPerOrder} onChange={(e) => set({ maxPerOrder: e.target.value })} placeholder="No limit" /></div>
            </div>
            <label className="mn-switch">
              <input type="checkbox" checked={!!dish.stockTracked} onChange={(e) => set({ stockTracked: e.target.checked })} />
              <span><b>Count daily portions.</b> It won't sell until today's count is entered.</span>
            </label>
            <label className="mn-switch">
              <input type="checkbox" checked={dish.status === 'Hidden'} onChange={(e) => set({ status: e.target.checked ? 'Hidden' : 'Active' })} />
              <span><b>Hide this dish.</b> Off every menu and portal; its settings and history stay.</span>
            </label>
          </section>

          <section className="mn-sec" aria-labelledby="sec-7">
            <h2 id="sec-7">Nutrition <small>optional, per serving</small></h2>
            {!showNutrition ? (
              <button type="button" className="mn-link" onClick={() => setShowNutrition(true)}>+ Add calories, allergens…</button>
            ) : (
              <>
                <div className="mn-grid g4">
                  {NUTRITION.map(([f, label]) => (
                    <div className="mn-field" key={f}>
                      <label htmlFor={`n-${f}`}>{label}</label>
                      <input id={`n-${f}`} className="mn-input num" inputMode="decimal" value={dish.nutrition?.[f] ?? ''}
                        onChange={(e) => set({ nutrition: { ...(dish.nutrition || {}), [f]: e.target.value === '' ? null : Number(e.target.value) } })} />
                    </div>
                  ))}
                </div>
                <div className="mn-field">
                  <label htmlFor="n-all">Allergens</label>
                  <input id="n-all" className="mn-input" value={dish.nutrition?.Allergens ?? ''} placeholder="Dairy; Gluten; Nuts"
                    onChange={(e) => set({ nutrition: { ...(dish.nutrition || {}), Allergens: e.target.value || null } })} />
                </div>
              </>
            )}
          </section>
        </fieldset>

        <aside className="mn-rail" aria-label="Summary">
          {canWrite && alsoCreates.length > 0 && (
            <div className="mn-sec mn-also">
              <h2 style={{ fontSize: 15 }}>Saving will also create</h2>
              <ul>{alsoCreates.map((c) => <li key={c}>{c}</li>)}</ul>
              <span className="mn-hint">All in one save. Cancel and nothing is created.</span>
            </div>
          )}
          <div className="mn-sec">
            <h2 style={{ fontSize: 15 }}>On the till</h2>
            <div className="mn-preview-tile">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <b>{clean(dish.name) || 'New dish'}</b>
                <span className={`mn-dot ${veg ? 'mn-veg' : 'mn-nonveg'}`} />
              </div>
              <b>{base !== null && Number.isFinite(base) ? `₹${base.toFixed(2)}` : '₹—'}</b>
              {dish.variants.length > 0 && <span className="mn-muted">{dish.variants.map((v) => v.name).filter(Boolean).join(' · ')}</span>}
              {dish.tags.length > 0 && <span className="mn-pill chg" style={{ alignSelf: 'flex-start' }}>{dish.tags[0]}</span>}
            </div>
          </div>
          <div className="mn-sec">
            <h2 style={{ fontSize: 15 }}>Ready to sell?</h2>
            <span style={{ fontSize: 14 }}>{problems.length ? `Still needs: ${problems.join(', ')}` : 'Name, category, price and tax are set'}</span>
            <span style={{ fontSize: 14 }}>Sold at {dish.branches.length} of {opts.branches.length} {opts.branches.length === 1 ? 'branch' : 'branches'}{listedPortals.length ? ` · ${listedPortals.length} ${listedPortals.length === 1 ? 'portal' : 'portals'}` : ''}</span>
            {!photo && listedPortals.length > 0 && <span style={{ fontSize: 14, color: '#9a3412' }}>No photo — portals will show a placeholder</span>}
            {dish.stockTracked && <span style={{ fontSize: 14, color: '#9a3412' }}>Counted daily — enter today's count before service</span>}
            {dish.status === 'Hidden' && <span style={{ fontSize: 14, color: '#9a3412' }}>Hidden — not on any menu</span>}
          </div>
        </aside>
      </div>

      {canWrite && (
        <div className="mn-savebar">
          <span className="mn-muted">{alsoCreates.length ? `Also creates ${alsoCreates.length} new ${alsoCreates.length === 1 ? 'record' : 'records'}` : ''}</span>
          <button type="button" className="mn-btn" onClick={() => navigate('/menu/dishes')} disabled={saving}>Cancel</button>
          <button type="button" className="mn-btn pri" onClick={save} disabled={saving}>{saving ? 'Saving…' : isNew ? 'Save dish' : 'Save changes'}</button>
        </div>
      )}
    </div>
  )
}

export default DishEditor
