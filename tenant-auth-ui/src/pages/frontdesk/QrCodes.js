import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-toastify'
import posService from '../../services/posService'
import qrService from '../../services/qrService'
import { useAuth } from '../../context/AuthContext'
import { hasScope } from '../../utils/permissions'
import { SCOPES } from '../../constants'
import QrImage, { downloadQr } from '../../components/frontdesk/QrImage'
import '../../components/frontdesk/qr.css'

const TAB = { CODES: 'codes', SETTINGS: 'settings' }

const MODE_OPTIONS = [
  { value: 'order', label: 'View menu and place orders', hint: 'Orders arrive on the QR Orders screen, where staff accept or reject each one.' },
  { value: 'menu', label: 'View menu only', hint: 'Guests verify and browse on their phone. Staff take the order at the table.' },
]

const perLabel = (l) => {
  if (l.per === 'seconds') {
    return l.value >= 3600 ? `${l.value / 3600} h` : l.value >= 60 ? `${l.value / 60} min` : `${l.value} s`
  }
  return l.per ? `${l.value.toLocaleString('en-IN')} per ${l.per}` : String(l.value)
}

const dateOf = (iso) => {
  try { return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) } catch { return '' }
}

/**
 * Table QR codes (S1) and the branch's QR ordering switch + limits (S4).
 *
 * Codes are issued by the server the first time a branch is opened here, so
 * "print all" never needs a separate step. Rotating a code invalidates the
 * printed card at once — the confirmation says so, because the card on the
 * table then has to be replaced.
 */
const QrCodes = () => {
  const { user } = useAuth()
  const canManage = hasScope(user, [SCOPES.POS_QR_WRITE, SCOPES.TENANT_ADMIN])

  const [tab, setTab] = useState(TAB.CODES)
  const [branches, setBranches] = useState([])
  const [branchId, setBranchId] = useState('')
  const [floor, setFloor] = useState('')
  const [codes, setCodes] = useState([])
  const [settings, setSettings] = useState(null)
  const [limits, setLimits] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [rotating, setRotating] = useState(null)

  useEffect(() => {
    posService.getPosBranches()
      .then((list) => {
        setBranches(list)
        setBranchId(list.length > 0 ? (list[0].Id || list[0].id) : '')
      })
      .catch(() => setBranches([]))
      .finally(() => setLoading(false))
  }, [])

  const load = useCallback(async () => {
    if (!branchId) return
    setLoading(true)
    try {
      const [codeList, s, l] = await Promise.all([
        qrService.getCodes(branchId),
        qrService.getSettings(branchId),
        qrService.getLimits().catch(() => null),
      ])
      setCodes(codeList?.codes || [])
      setSettings(s)
      setLimits(l)
      if (codeList?.issued > 0) toast.info(`${codeList.issued} new table code${codeList.issued === 1 ? '' : 's'} issued.`)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not load QR codes.')
    } finally {
      setLoading(false)
    }
  }, [branchId])

  useEffect(() => { load() }, [load])

  const floors = useMemo(() => [...new Set(codes.map((c) => c.floorName).filter(Boolean))], [codes])
  const visible = floor ? codes.filter((c) => c.floorName === floor) : codes
  const branchName = (branches.find((b) => (b.Id || b.id) === branchId) || {}).BranchName || ''

  const saveSettings = async (patch) => {
    setSaving(true)
    try {
      setSettings(await qrService.updateSettings(branchId, patch))
      toast.success('QR ordering settings saved.')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  const confirmRotate = async () => {
    const target = rotating
    setSaving(true)
    try {
      const fresh = await qrService.rotateCode(target.tableId)
      setCodes((list) => list.map((c) => (c.tableId === target.tableId ? { ...c, ...fresh } : c)))
      toast.success(`New code for ${target.tableName}. Print it and replace the card on the table.`)
      setRotating(null)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not rotate the code.')
    } finally {
      setSaving(false)
    }
  }

  /**
   * Print the sheet of table cards.
   *
   * The body class is what scopes qr.css's print rules to THIS print. They hide
   * everything but the card grid with `visibility: hidden`, and while that was
   * ungated it applied to every print in the application — a bill or a kitchen
   * ticket came out blank, because `visibility` is not something the receipt's
   * `display: block` can override.
   *
   * Removed on afterprint rather than straight after print(): the dialog is
   * still reading the page when print() returns, and clearing it immediately is
   * how the sheet would go blank instead.
   */
  const printSheet = () => {
    const done = () => document.body.classList.remove('qr-printing')
    window.addEventListener('afterprint', done, { once: true })
    document.body.classList.add('qr-printing')
    window.print()
  }

  if (!loading && branches.length === 0) {
    return (
      <div className="fd-crud-page">
        <h1>QR Codes</h1>
        <div className="fd-empty">Add a branch under Outlet → Business & branches → Branches first.</div>
      </div>
    )
  }

  return (
    <div className="fd-crud-page">
      <h1>QR Codes</h1>
      <p className="fd-page-sub">Each code opens this branch&apos;s menu for that table only. Guests verify their mobile number on WhatsApp before they see it.</p>

      <div className="fd-token-toolbar">
        <label htmlFor="qr-branch">Branch</label>
        <select id="qr-branch" value={branchId} onChange={(e) => { setBranchId(e.target.value); setFloor('') }}>
          {branches.map((b) => (
            <option key={b.Id || b.id} value={b.Id || b.id}>{b.BranchName || b.Name || b.Id}</option>
          ))}
        </select>
      </div>

      <div className="fd-qr-tabs" role="tablist" aria-label="QR ordering">
        <button type="button" role="tab" aria-selected={tab === TAB.CODES} onClick={() => setTab(TAB.CODES)}>Table codes</button>
        <button type="button" role="tab" aria-selected={tab === TAB.SETTINGS} onClick={() => setTab(TAB.SETTINGS)}>Settings &amp; limits</button>
      </div>

      {settings && (
        <div className={`fd-qr-banner ${settings.enabled ? 'is-on' : 'is-off'}`}>
          {settings.enabled
            ? <span>QR ordering is <strong>on</strong> for {branchName} · {settings.mode === 'order' ? 'menu and ordering' : 'menu only'} · staff approve every order.</span>
            : <span>QR ordering is <strong>off</strong> for {branchName} — printed codes show &ldquo;not active&rdquo; until it is switched on.</span>}
          {tab === TAB.CODES && (
            <button type="button" className="fd-qr-linkbtn" onClick={() => setTab(TAB.SETTINGS)}>Settings</button>
          )}
        </div>
      )}

      {tab === TAB.CODES && (
        <>
          <div className="fd-token-toolbar">
            <label htmlFor="qr-floor">Floor</label>
            <select id="qr-floor" value={floor} onChange={(e) => setFloor(e.target.value)}>
              <option value="">All floors</option>
              {floors.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <button type="button" className="fd-btn fd-btn-primary" onClick={printSheet} disabled={visible.length === 0}>
              Print sheet (A4)
            </button>
          </div>

          {loading && <div className="fd-empty">Loading…</div>}
          {!loading && visible.length === 0 && (
            <div className="fd-empty">No tables in this branch yet. Add them under Floors.</div>
          )}

          <div className="fd-qr-print">
            <div className="fd-qr-grid">
              {visible.map((c) => {
                const url = qrService.dineUrlFor(c.token)
                return (
                  <div key={c.tableId} className="fd-qr-card">
                    <QrImage value={url} label={`QR code for table ${c.tableName}`} />
                    <div>
                      <div className="fd-qr-card-name">{c.tableName}</div>
                      <div className="fd-qr-scan">{branchName} · Scan to order</div>
                      <div className="fd-qr-card-meta">
                        {[c.floorName, c.rotatedOn ? `Rotated ${dateOf(c.rotatedOn)}` : c.issuedOn ? `Issued ${dateOf(c.issuedOn)}` : null].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <div className="fd-qr-card-actions">
                      <button type="button" className="fd-btn fd-btn-outline fd-btn-sm" onClick={() => downloadQr(url, `table-${c.tableName}`)}>Download</button>
                      {canManage && (
                        <button type="button" className="fd-btn fd-btn-outline fd-btn-sm" onClick={() => setRotating(c)}>Rotate code</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {tab === TAB.SETTINGS && settings && (
        <>
          <section className="fd-setting-card">
            <h2>QR ordering at {branchName}</h2>
            <p className="fd-setting-desc">When off, every table code at this branch shows &ldquo;not active&rdquo; and open guest sessions end.</p>
            <label className={`fd-setting-option ${settings.enabled ? 'is-active' : ''}`}>
              <input
                type="checkbox"
                role="switch"
                checked={settings.enabled}
                disabled={!canManage || saving}
                onChange={(e) => saveSettings({ enabled: e.target.checked })}
              />
              <span><strong>QR ordering is {settings.enabled ? 'on' : 'off'}</strong><em>Guests scan the code on their table to see the menu.</em></span>
            </label>

            <h2 style={{ marginTop: 16 }}>What guests can do</h2>
            <div className="fd-setting-options" role="radiogroup" aria-label="What guests can do">
              {MODE_OPTIONS.map((opt) => (
                <label key={opt.value} className={`fd-setting-option ${settings.mode === opt.value ? 'is-active' : ''}`}>
                  <input
                    type="radio"
                    name="qr-mode"
                    checked={settings.mode === opt.value}
                    disabled={!canManage || saving || !settings.enabled}
                    onChange={() => saveSettings({ mode: opt.value })}
                  />
                  <span><strong>{opt.label}</strong><em>{opt.hint}</em></span>
                </label>
              ))}
            </div>

            <div className="fd-qr-lock" style={{ marginTop: 12 }}>
              <span aria-hidden="true">🔒</span>
              <span><strong>Staff approve every order.</strong> Always on — a guest&apos;s order reaches the kitchen only when someone presses Accept.</span>
            </div>
            {!canManage && <p className="fd-setting-desc" style={{ marginTop: 10 }}>You can view these settings. Changing them needs QR ordering manage access.</p>}
          </section>

          {limits && (
            <section className="fd-setting-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div>
                  <h2>WhatsApp code limits for guests</h2>
                  <p className="fd-setting-desc">Read-only. Counted separately from staff sign-in, so guests can never lock staff out.</p>
                </div>
                <div className="fd-qr-usage">
                  <span>Sent today (this restaurant): <strong>{limits.usage.sentToday.toLocaleString('en-IN')} of {limits.usage.tenantDailyCap.toLocaleString('en-IN')}</strong></span>
                  <span className="fd-qr-meter" aria-hidden="true">
                    <span style={{ width: `${Math.min(100, (limits.usage.sentToday / Math.max(1, limits.usage.tenantDailyCap)) * 100)}%` }} />
                  </span>
                </div>
              </div>
              <table className="fd-qr-limits">
                <thead><tr><th>Limit</th><th>Value</th><th>Counts</th><th>Env override</th></tr></thead>
                <tbody>
                  {limits.limits.map((l) => (
                    <tr key={l.key}>
                      <td><strong>{l.label}</strong></td>
                      <td>{perLabel(l)}</td>
                      <td>{l.scope}{l.sharedWithStaff ? ' (same rule as staff)' : ''}</td>
                      <td><code>{l.env}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="fd-setting-desc" style={{ marginTop: 10 }}>
                Defined once on the server in <code>config/rateLimits.js</code>. Changing a value means changing its environment variable.
              </p>
            </section>
          )}
        </>
      )}

      {rotating && (
        <div className="fd-modal-backdrop" role="dialog" aria-modal="true" aria-label={`Rotate the code for ${rotating.tableName}`}>
          <div className="fd-qr-dialog">
            <h3>Rotate the code for {rotating.tableName}?</h3>
            <p>The printed card on {rotating.tableName} stops working straight away, and anyone ordering from it is signed out. Print the new card and replace it on the table.</p>
            <p style={{ color: '#5a6c7d', fontSize: 13.5 }}>Use this when a card was photographed or taken away, or orders arrive from people not at the table.</p>
            <div className="fd-qr-dialog-actions">
              <button type="button" className="fd-btn fd-btn-outline" onClick={() => setRotating(null)} disabled={saving}>Cancel</button>
              <button type="button" className="fd-btn fd-btn-danger" onClick={confirmRotate} disabled={saving}>Rotate and print new card</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default QrCodes
