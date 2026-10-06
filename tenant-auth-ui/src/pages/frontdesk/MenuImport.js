import React, { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import menuService from '../../services/menuService'
import { readBrowserFiles, readFiles, payloadOf, loadSample, SAMPLE_FILES } from '../../utils/menuFile'
import { toCsv } from '../../utils/csv'
import { downloadCsv } from '../../utils/writeOffs'
import ExportButton from '../../components/export/ExportButton'
import './menu.css'

const CREATED_LABEL = {
  categories: 'Categories', units: 'Units', diets: 'Diets', meatTypes: 'Meat types', tags: 'Tags',
  variants: 'Variants', addonGroups: 'Add-on groups', addons: 'Add-ons', taxGroups: 'Tax groups',
}
const ACTION = {
  new: { label: 'New dish', cls: 'on' },
  changed: { label: 'Changed', cls: 'chg' },
  unchanged: { label: 'No change', cls: 'off' },
  error: { label: 'Error', cls: 'bad' },
}

const FileLine = ({ kind, file }) => {
  if (!file) return null
  const what = { menu: 'dishes', addons: 'add-ons', hours: 'hour windows' }[kind]
  const n = kind === 'menu' ? file.valid.length : file.rows.length
  return (
    <div className="mn-card" style={{ padding: '10px 14px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
      <b>{file.name}</b>
      <span className="mn-muted">{n} {what}</span>
      {kind === 'menu' && file.counts && (
        <span className="mn-muted">
          · {file.counts.categories} categories · {file.counts.taxGroups} tax groups
          {file.counts.portals.map((p) => ` · ${p.listed} on ${p.key}`).join('')}
          {file.counts.hidden ? ` · ${file.counts.hidden} hidden` : ''}
        </span>
      )}
      {kind === 'menu' && file.invalid.length > 0 && <span className="mn-pill bad">{file.invalid.length} rows can't be read</span>}
    </div>
  )
}

/**
 * Menu › Import — a whole menu from a file.
 *
 * Choose the menu file (and, optionally, the add-ons and hours files — any
 * order, the header says which is which), check it, read the review, apply.
 * The check is the server running the real import and rolling it back, so
 * the review is exactly what applying will do.
 *
 * ?sample=1 (from the empty menu's "Load the sample menu") loads the sample
 * straight away, so the next click is "Check file".
 */
const MenuImport = () => {
  const [sorted, setSorted] = useState(null)
  const [review, setReview] = useState(null)
  const [done, setDone] = useState(null)
  const [busy, setBusy] = useState('')
  const [filter, setFilter] = useState('all')
  const [over, setOver] = useState(false)
  const [searchParams] = useSearchParams()
  const sampleAsked = useRef(searchParams.get('sample') === '1')

  const take = async (files) => {
    try {
      const read = readFiles(await readBrowserFiles(files))
      read.unknown.forEach((u) => toast.error(`${u.name}: ${u.error}`))
      setSorted((cur) => ({
        menu: read.menu || cur?.menu || null,
        addons: read.addons || cur?.addons || null,
        hours: read.hours || cur?.hours || null,
      }))
      setReview(null)
    } catch (err) {
      toast.error(err.message)
    }
  }

  const takeSample = async () => {
    setBusy('sample')
    try {
      setSorted(await loadSample())
      setReview(null)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy('')
    }
  }

  useEffect(() => {
    if (!sampleAsked.current) return
    sampleAsked.current = false
    takeSample()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const check = async () => {
    setBusy('check')
    try {
      setReview(await menuService.previewMenuImport(payloadOf(sorted)))
      setFilter('all')
    } catch (err) {
      toast.error(err?.response?.data?.message || 'The file could not be checked')
    } finally {
      setBusy('')
    }
  }

  const apply = async () => {
    setBusy('apply')
    try {
      setDone(await menuService.applyMenuImport(payloadOf(sorted)))
    } catch (err) {
      toast.error(err?.response?.data?.message || 'The file could not be applied')
    } finally {
      setBusy('')
    }
  }

  const downloadErrors = () => {
    const bad = new Set(review.rows.filter((r) => r.action === 'error').map((r) => r.line))
    const rows = sorted.menu.valid.filter((r) => bad.has(r.__line))
    const headers = Object.keys(rows[0] || {}).filter((k) => k !== '__line')
    downloadCsv('menu-errors.csv', toCsv([...headers, 'error'], rows.map((r) => [
      ...headers.map((h) => r[h]), review.rows.find((x) => x.line === r.__line)?.error || '',
    ])))
  }

  const step = done ? 3 : review ? 2 : 1
  const created = review ? Object.entries(review.created || {}).filter(([, v]) => v.length) : []
  const rows = review ? review.rows.filter((r) => filter === 'all' || r.action === filter) : []
  const applyCount = review ? review.summary.new + review.summary.changed : 0

  return (
    <div className="mn-page">
      <div className="mn-head">
        <div>
          <Link to="/menu/dishes" className="mn-link" style={{ textDecoration: 'none' }}>← Dishes</Link>
          <h1>Import a menu</h1>
          <p className="mn-lead">One row per dish. Anything the file names that doesn't exist yet — categories, tags, variants, tax groups — is created. Nothing is written until you apply.</p>
        </div>
      </div>

      <div className="mn-steps">
        <span className={step === 1 ? 'is-on' : 'is-done'}><i>1</i>Choose file</span><span aria-hidden="true">—</span>
        <span className={step === 2 ? 'is-on' : step > 2 ? 'is-done' : ''}><i>2</i>Review</span><span aria-hidden="true">—</span>
        <span className={step === 3 ? 'is-on' : ''}><i>3</i>Done</span>
      </div>

      {done ? (
        <section className="mn-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={{ margin: 0 }}>Menu imported</h2>
          <div className="mn-stats">
            <div className="mn-card mn-stat"><b>{done.summary.new}</b>New dishes</div>
            <div className="mn-card mn-stat"><b>{done.summary.changed}</b>Changed</div>
            <div className="mn-card mn-stat"><b>{done.summary.unchanged}</b>Unchanged</div>
            <div className="mn-card mn-stat"><b>{done.summary.errors}</b>Skipped (errors)</div>
          </div>
          {done.addons && (done.addons.created + done.addons.updated) > 0 && <span className="mn-muted">{done.addons.created + done.addons.updated} add-ons saved.</span>}
          {done.hours && done.hours.windows !== undefined && <span className="mn-muted">Hours set for {done.hours.categories} categories.</span>}
          <div className="mn-actions">
            <Link to="/menu/dishes" className="mn-btn pri">See the dishes</Link>
            <Link to="/menu/prices" className="mn-btn">Prices &amp; channels</Link>
            <button type="button" className="mn-btn" onClick={() => { setDone(null); setReview(null); setSorted(null) }}>Import another file</button>
          </div>
        </section>
      ) : (
        <>
          <section
            className={`mn-drop${over ? ' is-over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setOver(true) }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files) }}
          >
            <b style={{ fontSize: 16 }}>Drop your menu file here</b>
            <span className="mn-muted">menu.csv, plus addons.csv and hours.csv if you have them — any order.</span>
            <div className="mn-actions" style={{ justifyContent: 'center' }}>
              <label className="mn-btn pri" style={{ cursor: 'pointer' }}>
                Choose files
                <input type="file" accept=".csv,text/csv" multiple hidden onChange={(e) => { take(e.target.files); e.target.value = '' }} />
              </label>
              <button type="button" className="mn-btn warn" onClick={takeSample} disabled={busy === 'sample'}>
                {busy === 'sample' ? 'Loading…' : 'Use our sample menu (31 dishes)'}
              </button>
            </div>
            <div className="mn-actions" style={{ justifyContent: 'center' }}>
              <a className="mn-link" href={SAMPLE_FILES.menu} download="menu-sample.csv">Download sample menu.csv</a>
              <a className="mn-link" href={SAMPLE_FILES.addons} download="addons-sample.csv">addons.csv</a>
              <a className="mn-link" href={SAMPLE_FILES.hours} download="hours-sample.csv">hours.csv</a>
              <ExportButton exportKey="menu" label="Export your current menu" className="mn-link" />
            </div>
          </section>

          {sorted && (
            <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <FileLine kind="menu" file={sorted.menu} />
              <FileLine kind="addons" file={sorted.addons} />
              <FileLine kind="hours" file={sorted.hours} />
              {!review && (
                <div className="mn-actions">
                  <button type="button" className="mn-btn pri" onClick={check} disabled={busy === 'check' || (!sorted.menu && !sorted.addons && !sorted.hours)}>
                    {busy === 'check' ? 'Checking…' : 'Check file'}
                  </button>
                  <button type="button" className="mn-btn ghost" onClick={() => setSorted(null)}>Start again</button>
                  <span className="mn-hint">The check runs the import and undoes it — nothing is saved.</span>
                </div>
              )}
            </section>
          )}

          {review && (
            <>
              <div className="mn-stats">
                <div className="mn-card mn-stat"><b>{review.summary.new}</b>New dishes</div>
                <div className="mn-card mn-stat"><b>{review.summary.changed}</b>Dishes changed</div>
                <div className="mn-card mn-stat"><b>{review.summary.unchanged}</b>Unchanged</div>
                <div className="mn-card mn-stat" style={review.summary.errors ? { borderColor: '#f59e0b', background: '#fffbeb' } : undefined}><b>{review.summary.errors}</b>Rows with errors</div>
              </div>

              {created.length > 0 && (
                <section className="mn-card" style={{ padding: 16, borderColor: '#0f3460', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <h2 style={{ margin: 0, fontSize: 16 }}>This file will also create</h2>
                  {created.map(([k, v]) => <span key={k} style={{ fontSize: 14 }}><b>{CREATED_LABEL[k] || k}</b> {v.join(', ')}</span>)}
                </section>
              )}
              {(review.addons?.errors?.length > 0 || review.hours?.error) && (
                <section className="mn-card" style={{ padding: 14, borderColor: '#f59e0b' }}>
                  {review.addons.errors.map((e) => <div key={e.line} className="mn-error">addons.csv row {e.line}: {e.error}</div>)}
                  {review.hours?.error && <div className="mn-error">hours.csv: {review.hours.error}</div>}
                </section>
              )}

              <div className="mn-chips" role="group" aria-label="Show rows">
                {[['all', `All ${review.summary.total}`], ['new', `New ${review.summary.new}`], ['changed', `Changed ${review.summary.changed}`], ['error', `Errors ${review.summary.errors}`], ['unchanged', `Unchanged ${review.summary.unchanged}`]]
                  .map(([k, label]) => <button key={k} type="button" className={`mn-chip${filter === k ? ' is-on' : ''}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</button>)}
              </div>

              <div className="mn-table-wrap">
                <table className="mn-table cards">
                  <thead><tr><th>Row</th><th>Dish</th><th>What happens</th><th>Changes</th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.line} style={r.action === 'error' ? { background: '#fffbeb' } : undefined}>
                        <td className="mn-mono">{r.line}</td>
                        <td><b>{r.name}</b>{r.code && <span className="mn-mono" style={{ display: 'block' }}>{r.code}</span>}</td>
                        <td><span className={`mn-pill ${ACTION[r.action].cls}`}>{ACTION[r.action].label}</span></td>
                        <td data-wide="" style={{ fontSize: 13.5 }}>
                          {r.action === 'error' ? <span className="mn-error">{r.error}</span>
                            : r.changes.map((c, i) => (
                              <span key={i} style={{ display: 'block' }}>
                                {c.field === 'New dish' ? c.to : <>{c.field}: <span className="mn-old">{c.from}</span> {c.to}</>}
                              </span>
                            ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <section className="mn-card" style={{ padding: 14, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                <span style={{ flex: '1 1 320px', fontSize: 14 }}>
                  Applying saves {applyCount} {applyCount === 1 ? 'dish' : 'dishes'}{created.length ? ' and creates the records above' : ''}. Rows with errors are skipped. It is recorded in the audit log.
                </span>
                {review.summary.errors > 0 && <button type="button" className="mn-btn" onClick={downloadErrors}>Download error rows</button>}
                <button type="button" className="mn-btn" onClick={() => setReview(null)}>Back</button>
                <button type="button" className="mn-btn pri" onClick={apply} disabled={busy === 'apply' || (applyCount === 0 && !(review.addons?.created || review.addons?.updated) && !review.hours?.windows)}>
                  {busy === 'apply' ? 'Applying…' : `Apply ${applyCount} ${applyCount === 1 ? 'dish' : 'dishes'}`}
                </button>
              </section>
            </>
          )}
        </>
      )}
    </div>
  )
}

export default MenuImport
