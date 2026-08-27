import React, { useCallback, useMemo, useRef, useState } from 'react'
import { toast } from 'react-toastify'
import { toCsv } from '../../utils/csv'
import {
  COLUMNS, DEFAULT_TAX, TEMPLATE_ROWS, checkFile, download,
} from '../../utils/itemImport'
import importService from '../../services/importService'
import posService from '../../services/posService'
import './ImportDrawer.css'

/**
 * Bulk import, in four states: choose → check → run → results.
 *
 * The check state is the point. Anyone can post an array; what makes an import
 * trustworthy is being told, before committing, exactly what a file will do —
 * how many items it creates, which already exist, which rows cannot be read,
 * and whether the tax group it names will price the whole menu at 0%.
 *
 * Nothing is written until the third state. The first two are entirely local.
 *
 * What a row MEANS lives in utils/itemImport, shared with step 3 of the
 * first-time setup wizard: two screens reading the same file must not disagree
 * about which columns are required or what CGST:2.5|SGST:2.5 means.
 */

const STATE = { CHOOSE: 'choose', CHECK: 'check', RUN: 'run', DONE: 'done' }

const ImportDrawer = ({ onClose, onImported }) => {
  const [state, setState] = useState(STATE.CHOOSE)
  const [text, setText] = useState('')
  const [parsed, setParsed] = useState(null)
  const [emptyTaxGroups, setEmptyTaxGroups] = useState([])
  const [onDuplicate, setOnDuplicate] = useState('skip')
  const [publish, setPublish] = useState(false)
  const [branches, setBranches] = useState([])
  const [branchId, setBranchId] = useState('')
  const [result, setResult] = useState(null)
  const [checking, setChecking] = useState(false)
  const fileRef = useRef(null)

  const check = useCallback(async (raw) => {
    const { valid, invalid, fileErrors, counts: summary } = checkFile(raw)
    if (valid.length === 0 && invalid.length === 0) {
      toast.error(fileErrors[0] || 'That file has no rows')
      return
    }

    setParsed({ valid, invalid, fileErrors, summary })
    setState(STATE.CHECK)

    // Two things the browser cannot know on its own.
    setChecking(true)
    try {
      const groups = [...new Set(valid.map((v) => v.taxGroup))]
      if (groups.length) setEmptyTaxGroups(await importService.previewChecks(groups))
    } catch {
      // A failed check must not block the import — it is advice, not a gate.
      setEmptyTaxGroups([])
    } finally {
      setChecking(false)
    }

    try {
      setBranches(await posService.getPosBranches())
    } catch { setBranches([]) }
  }, [])

  const onFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => { setText(String(reader.result)); check(String(reader.result)) }
    reader.readAsText(file)
  }

  const run = async () => {
    setState(STATE.RUN)
    try {
      const items = await importService.importItems(
        parsed.valid.map(({ line, ...row }) => row), onDuplicate,
      )

      let menu = null
      if (publish && branchId) {
        // Only what actually landed — publishing a row that failed pass one
        // would just fail again with a worse message.
        // Carries each row's OWN food type. Dropping it here — and sending one
        // default for the whole file — is what published every item on a mixed
        // menu as Veg.
        const byName = new Map(parsed.valid.map((v) => [v.name, v.foodType]))
        const landed = items.rows
          .filter((r) => r.status === 'created' || r.status === 'updated' || r.status === 'skipped')
          .map((r) => ({ name: r.name, foodType: byName.get(r.name) || undefined }))
        if (landed.length) {
          menu = await importService.publishMenuEntries({
            branchDetailId: branchId, defaultFoodType: 'VEG', items: landed,
          })
        }
      }

      setResult({ items, menu })
      setState(STATE.DONE)
      onImported?.()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'The import could not be run')
      setState(STATE.CHECK)
    }
  }

  const counts = useMemo(() => parsed?.summary || null, [parsed])

  const failedRows = result?.items?.rows?.filter((r) => r.status === 'failed') || []

  return (
    <div className="imp-overlay" onClick={state === STATE.RUN ? undefined : onClose}>
      <div className="imp-drawer" role="dialog" aria-modal="true" aria-label="Import items"
           onClick={(e) => e.stopPropagation()}>

        <div className="imp-head">
          <div>
            <h3>Import items</h3>
            <p>Master Data → Items</p>
          </div>
          {state !== STATE.RUN && (
            <button className="imp-x" onClick={onClose} aria-label="Close">×</button>
          )}
        </div>

        {/* ── choose ─────────────────────────────────────────────── */}
        {state === STATE.CHOOSE && (
          <>
            <div className="imp-body">
              <div className="imp-drop" onClick={() => fileRef.current?.click()}>
                <strong>Choose a CSV</strong>
                name, category, unit, price and tax group are required
                <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onFile} />
              </div>
              <div className="imp-or">or paste rows</div>
              <textarea
                className="imp-paste" spellcheck="false" value={text}
                placeholder={'name,category,unit,price,tax_group\nPlain Tea,Tea,Glass,15,GST 5%'}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
            <div className="imp-foot">
              <button className="fd-link-btn imp-spacer"
                      onClick={() => download('items-template.csv', toCsv(COLUMNS, TEMPLATE_ROWS))}>
                Download template
              </button>
              <button className="fd-btn fd-btn-outline" onClick={onClose}>Cancel</button>
              <button className="fd-btn fd-btn-primary" disabled={!text.trim()}
                      onClick={() => check(text)}>
                Check file
              </button>
            </div>
          </>
        )}

        {/* ── check ──────────────────────────────────────────────── */}
        {state === STATE.CHECK && counts && (
          <>
            <div className="imp-body">
              <div className="imp-chips">
                <span className="imp-chip ok">
                  {counts.valid} {counts.valid === 1 ? 'item' : 'items'} will be{' '}
                  {onDuplicate === 'update' ? 'created or updated' : 'created'}
                </span>
                <span className="imp-chip">{counts.categories} {counts.categories === 1 ? 'category' : 'categories'}</span>
                <span className="imp-chip">{counts.units} {counts.units === 1 ? 'unit' : 'units'}</span>
                {checking && <span className="imp-chip">checking tax groups…</span>}
                {emptyTaxGroups.map((g) => (
                  <span key={g} className="imp-chip warn">
                    Tax group “{g}” has no tax types — these prices will compute 0% tax
                  </span>
                ))}
                <span className="imp-chip">{counts.taxTypes} tax {counts.taxTypes === 1 ? 'type' : 'types'}</span>
                {counts.defaulted > 0 && (
                  <span className="imp-chip warn">
                    {counts.defaulted} {counts.defaulted === 1 ? 'row states' : 'rows state'} no tax rate
                    — {DEFAULT_TAX.replace(/\|/g, ' + ')} will be applied
                  </span>
                )}
                {counts.invalid > 0 && (
                  <span className="imp-chip bad">{counts.invalid} {counts.invalid === 1 ? 'row' : 'rows'} cannot be read</span>
                )}
              </div>

              <div className="imp-preview">
                <table className="fd-table">
                  <thead>
                    <tr><th>#</th><th>Name</th><th>Category</th><th>Price</th><th>Food type</th><th>Outcome</th></tr>
                  </thead>
                  <tbody>
                    {parsed.invalid.map((r) => (
                      <tr key={`e${r.line}`} className="imp-row-bad">
                        <td>{r.line}</td><td>{r.name}</td><td colSpan={3} />
                        <td><span className="imp-dot r" />{r.error}</td>
                      </tr>
                    ))}
                    {parsed.valid.map((r) => (
                      <tr key={r.line}>
                        <td>{r.line}</td><td>{r.name}</td><td>{r.category}</td>
                        <td>{r.price}</td>
                        <td>{r.foodType || <span className="muted">Veg</span>}</td>
                        <td><span className="imp-dot g" />Create</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <label className="imp-opt">
                <input type="checkbox" checked={onDuplicate === 'update'}
                       onChange={(e) => setOnDuplicate(e.target.checked ? 'update' : 'skip')} />
                <span>
                  <strong>Update items that already exist</strong>
                  <em>Off by default: a re-run should not overwrite a price somebody has corrected by hand.</em>
                </span>
              </label>

              {branches.length > 0 && (
                <label className="imp-opt">
                  <input type="checkbox" checked={publish}
                         onChange={(e) => { setPublish(e.target.checked); if (!branchId) setBranchId(branches[0].Id || branches[0].id) }} />
                  <span>
                    <strong>Also publish to a branch as menu entries</strong>
                    <em>Items are tenancy-wide; nothing sells until it is on a branch’s menu.</em>
                    {publish && (
                      <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                        {branches.map((b) => (
                          <option key={b.Id || b.id} value={b.Id || b.id}>
                            {b.BranchName || b.Name}
                          </option>
                        ))}
                      </select>
                    )}
                  </span>
                </label>
              )}
            </div>
            <div className="imp-foot">
              <span className="imp-spacer muted">Nothing has been saved yet</span>
              <button className="fd-btn fd-btn-outline" onClick={() => setState(STATE.CHOOSE)}>Back</button>
              <button className="fd-btn fd-btn-primary" disabled={counts.valid === 0} onClick={run}>
                Import {counts.valid} {counts.valid === 1 ? 'item' : 'items'}
              </button>
            </div>
          </>
        )}

        {/* ── run ────────────────────────────────────────────────── */}
        {state === STATE.RUN && (
          <div className="imp-body imp-running">
            <div className="imp-bar"><span /></div>
            <p>Importing {parsed.valid.length} items…</p>
            <p className="muted">Each row is saved on its own, so anything already done stays done.</p>
          </div>
        )}

        {/* ── results ────────────────────────────────────────────── */}
        {state === STATE.DONE && result && (
          <>
            <div className="imp-body">
              <div className="imp-results">
                <div className="imp-res ok"><span className="n">{result.items.summary.created}</span><span className="l">created</span></div>
                {result.items.summary.updated > 0 && (
                  <div className="imp-res"><span className="n">{result.items.summary.updated}</span><span className="l">updated</span></div>
                )}
                <div className="imp-res warn"><span className="n">{result.items.summary.skipped}</span><span className="l">skipped</span></div>
                <div className="imp-res bad"><span className="n">{result.items.summary.failed}</span><span className="l">failed</span></div>
              </div>

              {result.menu && (
                <div className="imp-next">
                  <span aria-hidden="true">✓</span>
                  <span>
                    <strong>{result.menu.summary.created} published to the menu.</strong> They are on
                    the till now. Open one in Master Data → Items to re-price it, or in Menu Master
                    to change its channels and variants — an imported item behaves exactly like one
                    typed in by hand.
                  </span>
                </div>
              )}

              <div className="imp-preview">
                <table className="fd-table">
                  <thead><tr><th>#</th><th>Name</th><th>Result</th></tr></thead>
                  <tbody>
                    {result.items.rows.map((r) => (
                      <tr key={r.row} className={r.status === 'failed' ? 'imp-row-bad' : undefined}>
                        <td>{r.row}</td><td>{r.name}</td>
                        <td>
                          <span className={`imp-dot ${r.status === 'failed' ? 'r' : r.status === 'skipped' ? 'a' : 'g'}`} />
                          {r.reason || (r.status === 'created' ? 'Created' : r.status === 'updated' ? 'Updated' : r.status)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="imp-foot">
              <span className="imp-spacer muted">
                {failedRows.length > 0 ? `${failedRows.length} ${failedRows.length === 1 ? 'row needs' : 'rows need'} fixing` : 'All rows accounted for'}
              </span>
              {failedRows.length > 0 && (
                <button className="fd-btn fd-btn-outline" onClick={() => download(
                  'failed-rows.csv',
                  toCsv(['name', 'reason'], failedRows.map((r) => [r.name, r.reason])),
                )}>
                  Download failed rows
                </button>
              )}
              <button className="fd-btn fd-btn-primary" onClick={onClose}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default ImportDrawer
