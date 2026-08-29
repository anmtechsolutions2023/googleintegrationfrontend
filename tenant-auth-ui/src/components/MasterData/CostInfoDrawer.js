import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { toast } from 'react-toastify'
import costInfoService, { groupName, groupId, typeName, typeId } from '../../services/costInfoService'
import './CostInfoDrawer.css'

// ── Guided "Cost Info" drawer — single-window, progressive builder ───────────
// The whole chain in one surface, revealed level by level:
//   ① Tax Group   → searchable combobox, creates a group inline
//   ② Group Map   → the group's tax types as chips (add / remove)
//   ③ Tax Detail  → an inline panel to create/attach a tax type (name + rate)
// A sticky footer shows the live effective rate straight from the server, so the
// drawer always agrees with what actually prices bills.
//
// One component, two contexts: `mode="edit"` for the Add-Item flow (returns the
// new costInfoId via onSaved); `mode="audit"` opens read-first later on.
const CostInfoDrawer = ({ open, onClose, onSaved, mode = 'edit', costInfoId = null }) => {
  const editing = !!costInfoId
  const [groups, setGroups] = useState([])
  const [taxTypes, setTaxTypes] = useState([])
  const [mappers, setMappers] = useState([])
  const [taxGroupId, setTaxGroupId] = useState(null)
  const [query, setQuery] = useState('')
  const [comboOpen, setComboOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [inclusive, setInclusive] = useState(false)
  const [rate, setRate] = useState(null)         // { effectiveRate, components:[{id,name,rate}] }
  const [rateLoading, setRateLoading] = useState(false)
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [saving, setSaving] = useState(false)

  // ③ Tax Detail inline panel
  const [addingType, setAddingType] = useState(false)
  const [typeNameInput, setTypeNameInput] = useState('')
  const [typeRateInput, setTypeRateInput] = useState('')
  const [mapBusy, setMapBusy] = useState(false)

  const comboRef = useRef(null)

  // (Re)load reference data and reset each time the drawer opens. When opened on
  // an existing Cost Info, repopulate its amount / tax-inclusive / group so the
  // user can review and edit it (the group's tax types follow via the group).
  useEffect(() => {
    if (!open) return
    setTaxGroupId(null); setQuery(''); setComboOpen(false)
    setAmount(''); setInclusive(false); setRate(null)
    setAddingType(false); setTypeNameInput(''); setTypeRateInput('')
    Promise.all([
      costInfoService.getTaxGroups(),
      costInfoService.getTaxTypes(),
      costInfoService.getMappers(),
    ])
      .then(([g, t, m]) => {
        setGroups(Array.isArray(g) ? g : [])
        setTaxTypes(Array.isArray(t) ? t : [])
        setMappers(Array.isArray(m) ? m : [])
      })
      .catch(() => toast.error('Could not load tax data'))

    if (costInfoId) {
      costInfoService.getCostInfo(costInfoId)
        .then((ci) => {
          if (!ci) return
          setAmount(ci.Amount != null ? String(ci.Amount) : '')
          setInclusive(ci.IsTaxIncluded === 1 || ci.IsTaxIncluded === true || ci.IsTaxIncluded === '1')
          if (ci.TaxGroupId) setTaxGroupId(ci.TaxGroupId)  // pulls in the group's chips + rate
        })
        .catch(() => toast.error('Could not load this Cost Info'))
    }
  }, [open, costInfoId])

  // Re-read the group's live rate (its component chips come from here) and the
  // mapper rows (needed to remove a chip). Called on group change + after edits.
  const refreshGroup = useCallback(async (gid) => {
    if (!gid) { setRate(null); return }
    setRateLoading(true)
    try {
      const [r, m] = await Promise.all([
        costInfoService.getTaxGroupRate(gid),
        costInfoService.getMappers(),
      ])
      setRate(r)
      setMappers(Array.isArray(m) ? m : [])
    } catch {
      setRate(null)
    } finally {
      setRateLoading(false)
    }
  }, [])

  useEffect(() => { refreshGroup(taxGroupId) }, [taxGroupId, refreshGroup])

  // Close the combobox on an outside click.
  useEffect(() => {
    const onDoc = (e) => { if (comboRef.current && !comboRef.current.contains(e.target)) setComboOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const selectedGroup = useMemo(
    () => groups.find((g) => groupId(g) === taxGroupId) || null,
    [groups, taxGroupId],
  )
  const q = query.trim().toLowerCase()
  const filtered = useMemo(() => groups.filter((g) => groupName(g).toLowerCase().includes(q)), [groups, q])
  const exactExists = groups.some((g) => groupName(g).toLowerCase() === q)

  const components = rate?.components || []
  const mapperIdFor = (taxTypeId) => {
    const row = mappers.find((m) => m.TaxGroupId === taxGroupId && m.TaxTypeId === taxTypeId)
    return row ? (row.id ?? row.Id) : null
  }

  const pick = (g) => { setTaxGroupId(groupId(g)); setQuery(''); setComboOpen(false) }

  const handleCreateGroup = useCallback(async (name) => {
    setCreatingGroup(true)
    try {
      const rec = await costInfoService.createTaxGroup(name)
      let id = groupId(rec)
      if (id && groupName(rec)) {
        // Good response — show it immediately without a refetch.
        setGroups((prev) => [...prev, rec])
      } else {
        // Thin response — refetch so the new group appears with a proper id/name.
        const list = await costInfoService.getTaxGroups()
        const fresh = Array.isArray(list) ? list : []
        setGroups(fresh)
        const match = fresh.find((g) => groupName(g).toLowerCase() === name.trim().toLowerCase())
        id = match ? groupId(match) : id
      }
      setTaxGroupId(id)
      setQuery(''); setComboOpen(false)
      toast.success(`Tax group "${name}" created`)
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Could not create tax group')
    } finally {
      setCreatingGroup(false)
    }
  }, [])

  // ③ Attach a tax type to the group — reuse an existing type by name, else create it.
  const handleAddTaxType = async () => {
    const name = typeNameInput.trim()
    if (!name) { toast.warn('Enter a tax type name'); return }
    const existing = taxTypes.find((t) => typeName(t).toLowerCase() === name.toLowerCase())
    if (!existing) {
      const r = Number(typeRateInput)
      if (!(r >= 0 && r <= 100)) { toast.warn('Enter a rate between 0 and 100'); return }
    }
    setMapBusy(true)
    try {
      let ttId = existing ? typeId(existing) : null
      if (!existing) {
        const rec = await costInfoService.createTaxType({ name, value: typeRateInput })
        ttId = typeId(rec)
        setTaxTypes((prev) => [...prev, rec])
      }
      await costInfoService.createMapper({ taxGroupId, taxTypeId: ttId })
      await refreshGroup(taxGroupId)
      setAddingType(false); setTypeNameInput(''); setTypeRateInput('')
      toast.success('Tax type added')
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Could not add tax type')
    } finally {
      setMapBusy(false)
    }
  }

  const handleRemoveType = async (component) => {
    const mid = mapperIdFor(component.id)
    if (!mid) { toast.error('Could not find this mapping to remove'); return }
    setMapBusy(true)
    try {
      await costInfoService.deleteMapper(mid)
      await refreshGroup(taxGroupId)
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Could not remove tax type')
    } finally {
      setMapBusy(false)
    }
  }

  const canSave = Number(amount) > 0 && !!taxGroupId && !saving

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      const payload = { amount, taxGroupId, isTaxIncluded: inclusive }
      const rec = editing
        ? await costInfoService.updateCostInfo(costInfoId, payload)
        : await costInfoService.createCostInfo(payload)
      toast.success(editing ? 'Cost Info updated' : 'Cost Info saved')
      // On update the id is unchanged; fall back to it if the response is thin.
      if (typeof onSaved === 'function') onSaved(costInfoService.idOf(rec) || costInfoId, rec)
      onClose()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Could not save Cost Info')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="ci-drawer-backdrop" role="dialog" aria-label="Cost Info">
      <div className="ci-drawer">
        <header className="ci-drawer-head">
          <h3>{editing ? 'Edit Cost Info' : mode === 'audit' ? 'Cost Info' : 'Set up Cost Info'}</h3>
          <button className="ci-drawer-x" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="ci-drawer-body">
          {/* The Cost Info itself */}
          <div className="ci-costrow">
            <div className="ci-field">
              <label htmlFor="ci-amount">Amount</label>
              <input id="ci-amount" type="number" min="0" step="0.01"
                value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div className="ci-field">
              <span className="ci-label">Tax</span>
              <div className="ci-radio-row" role="radiogroup" aria-label="Tax inclusive or exclusive">
                <label className={!inclusive ? 'on' : ''}>
                  <input type="radio" name="ci-incl" checked={!inclusive} onChange={() => setInclusive(false)} /> Exclusive
                </label>
                <label className={inclusive ? 'on' : ''}>
                  <input type="radio" name="ci-incl" checked={inclusive} onChange={() => setInclusive(true)} /> Inclusive
                </label>
              </div>
            </div>
          </div>

          {/* ① Tax Group */}
          <section className="ci-level">
            <div className="ci-level-head">
              <span className="ci-step">1</span>
              <span className="ci-level-title">Tax Group</span>
              {selectedGroup && <span className="ci-level-done">✓</span>}
            </div>

            {selectedGroup && !comboOpen ? (
              <div className="ci-selected">
                <span className="ci-selected-name">{groupName(selectedGroup)}</span>
                <button className="ci-link" onClick={() => { setComboOpen(true); setQuery('') }}>Change</button>
              </div>
            ) : (
              <div className="ci-combo" ref={comboRef}>
                <input className="ci-combo-input" value={query}
                  onChange={(e) => { setQuery(e.target.value); setComboOpen(true) }}
                  onFocus={() => setComboOpen(true)}
                  placeholder="Search or create a tax group" aria-label="Tax group" />
                {comboOpen && (
                  <ul className="ci-combo-menu" role="listbox">
                    {filtered.map((g) => (
                      <li key={groupId(g)} role="option" className="ci-combo-item" onClick={() => pick(g)}>
                        {groupName(g)}
                      </li>
                    ))}
                    {query.trim() && !exactExists && (
                      <li className="ci-combo-create" onClick={() => !creatingGroup && handleCreateGroup(query.trim())}>
                        {creatingGroup ? 'Creating…' : <>＋ Create “{query.trim()}”</>}
                      </li>
                    )}
                    {filtered.length === 0 && !query.trim() && (
                      <li className="ci-combo-empty">No tax groups yet — type a name to create one</li>
                    )}
                  </ul>
                )}
              </div>
            )}
          </section>

          {/* ② Group Map — the group's tax types (unlocks once a group exists) */}
          {selectedGroup && (
            <section className="ci-level">
              <div className="ci-level-head">
                <span className="ci-step">2</span>
                <span className="ci-level-title">Group Map — tax types</span>
              </div>

              <div className="ci-chips">
                {components.length === 0 && !rateLoading && (
                  <span className="ci-chips-empty">
                    No tax types — this group charges <b>0%</b>. That is a valid, exempt
                    group; add a type below only if it should be taxed.
                  </span>
                )}
                {components.map((c) => (
                  <span className="ci-chip" key={c.id}>
                    <span className="ci-chip-name">{c.name}</span>
                    <span className="ci-chip-rate">{c.rate}%</span>
                    <button
                      className="ci-chip-x" aria-label={`Remove ${c.name}`}
                      onClick={() => handleRemoveType(c)} disabled={mapBusy}
                    >×</button>
                  </span>
                ))}
              </div>

              {/* ③ Tax Detail — inline, not a new modal */}
              {addingType ? (
                <div className="ci-addtype">
                  <div className="ci-addtype-row">
                    <input
                      className="ci-addtype-name" aria-label="Tax type name"
                      value={typeNameInput} onChange={(e) => setTypeNameInput(e.target.value)}
                      placeholder="Tax type (e.g. CGST)" list="ci-taxtype-suggest"
                    />
                    <datalist id="ci-taxtype-suggest">
                      {taxTypes.map((t) => <option key={typeId(t)} value={typeName(t)} />)}
                    </datalist>
                    <div className="ci-addtype-rate">
                      <input
                        type="number" min="0" max="100" step="0.01" aria-label="Rate"
                        value={typeRateInput} onChange={(e) => setTypeRateInput(e.target.value)} placeholder="0"
                      />
                      <span>%</span>
                    </div>
                  </div>
                  <div className="ci-addtype-actions">
                    <button className="ci-link" onClick={() => setAddingType(false)} disabled={mapBusy}>Cancel</button>
                    <button className="btn btn-primary btn-sm" onClick={handleAddTaxType} disabled={mapBusy}>
                      {mapBusy ? 'Adding…' : 'Add'}
                    </button>
                  </div>
                  <p className="ci-soon">A matching existing tax type is reused; otherwise it's created.</p>
                </div>
              ) : (
                <button className="ci-addtype-open" onClick={() => setAddingType(true)}>＋ Add tax type</button>
              )}
            </section>
          )}
        </div>

        {/* Sticky live effective-tax footer + actions */}
        <footer className="ci-drawer-foot">
          <div className="ci-rate" aria-live="polite">
            {!taxGroupId ? (
              <span className="ci-rate-muted">Pick a tax group to see the effective rate</span>
            ) : rateLoading ? (
              <span className="ci-rate-muted">Calculating…</span>
            ) : rate && rate.effectiveRate > 0 ? (
              <span>
                <b>Effective tax {rate.effectiveRate}%</b>
                {components.length > 0 && (
                  <span className="ci-rate-parts"> = {components.map((c) => `${c.name} ${c.rate}%`).join(' + ')}</span>
                )}
              </span>
            ) : (
              // A group with no tax types IS the exemption — the pricing chain
              // already treats it as a valid 0%. The old wording said "no tax
              // types on this group YET", which reads as setup somebody
              // abandoned rather than a decision they made.
              <span className="ci-rate-exempt">
                <b>Effective tax 0%</b> — exempt
              </span>
            )}
          </div>
          <div className="ci-drawer-actions">
            <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={!canSave}>
              {saving ? 'Saving…' : editing ? 'Update Cost Info' : 'Save Cost Info'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

export default CostInfoDrawer
