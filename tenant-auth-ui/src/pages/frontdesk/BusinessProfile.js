import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-toastify'
import posService from '../../services/posService'
import { usePosBranch } from '../../hooks/usePosBranch'
import { useCan } from '../../hooks/useCan'
import { SCOPES } from '../../constants'
import GstSettingsCard from '../../components/frontdesk/GstSettingsCard'
import MediaUploadCard from '../../components/frontdesk/MediaUploadCard'
import { gstinProblem, normaliseGstin, stateOfGstin } from '../../utils/gstin'
import './businessProfile.css'

/**
 * Everything onboarding collected, in one place.
 *
 * WHY THIS SCREEN EXISTS
 * A tenant types their business's details once, during a wizard they see exactly
 * once, and then has to find them again. Before this, the answer was spread over
 * Master Data → Organizations, → Branch Details, → Address Details, → Contact
 * Details, POS Settings → GST and Receipt Format: six destinations in two
 * navigation trees, one of which shows an address as a dropdown of GUIDs because it
 * is a generic CRUD grid over raw tables.
 *
 * TWO THINGS HERE ARE NOT ON ANY OTHER SCREEN
 *
 * 1. PROVENANCE. Each group says when it was set and by whom, from CreatedOn /
 *    CreatedBy — columns every table already carried. "Set at setup, 22 Sep" is the
 *    answer to "which of this did I type during onboarding?", shown against the
 *    field rather than buried in an audit log.
 *
 * 2. THE "ON THE BILL" TAB. A value can be STORED and NOT PRINTED, and nothing in
 *    the application used to say which — so a tenant who entered an FSSAI number
 *    had no way to discover it never reached the paper. That tab lists every
 *    masthead field, what it holds, whether it prints, and one click to change it.
 */

const TABS = [
  { key: 'business', label: 'Business' },
  { key: 'address', label: 'Address & Contact' },
  { key: 'tax', label: 'Tax & Compliance' },
  { key: 'branding', label: 'Branding' },
  { key: 'bill', label: 'On the bill' },
]

/** "Set at setup · 22 Sep 2026 · +9198…3210" */
const Provenance = ({ of }) => {
  if (!of) return null
  const changed = of.updatedOn && of.updatedOn !== of.createdOn
  const when = changed ? of.updatedOn : of.createdOn
  const who = changed ? of.updatedBy : of.createdBy
  if (!when) return null
  const date = new Date(when)
  const shown = Number.isNaN(date.getTime())
    ? String(when)
    : date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
  return (
    <span className="bp-provenance">
      {changed ? 'Changed' : 'Set at setup'} · {shown}{who ? ` · ${who}` : ''}
    </span>
  )
}

/**
 * One labelled input, bounded by its own column.
 *
 * `limit` comes from GET /api/master-data/field-limits — the same numbers the
 * server's Joi rules are built from. The input physically cannot overflow the
 * column, which is the point: the wizard used to accept 200 characters for a
 * VARCHAR(50) and the result was either a 500 with a rolled-back save or a silent
 * truncation that then printed on every bill.
 */
const Field = ({
  label, value, onChange, limit, hint, problem, note, disabled, type = 'text',
}) => {
  const len = String(value || '').length
  // Only past 80% of the limit. A counter on every field is noise; a counter that
  // appears as you approach the edge is information.
  const showCount = !!limit && len > limit * 0.8
  return (
    <label className="bp-field">
      <span className="bp-field-label">
        {label}
        {showCount && <span className="bp-count">{len}/{limit}</span>}
      </span>
      <input
        type={type}
        value={value || ''}
        maxLength={limit || undefined}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={problem ? 'is-bad' : undefined}
      />
      {problem ? <span className="bp-note is-bad">{problem}</span> : null}
      {!problem && note ? <span className="bp-note is-ok">{note}</span> : null}
      {hint ? <span className="bp-hint">{hint}</span> : null}
    </label>
  )
}

const BusinessProfile = () => {
  const { branches, branchId, setBranchId } = usePosBranch('bp.branch')
  // Either scope is enough, and useCan folds TENANT_ADMIN in itself. This hides
  // controls; the server refuses them too.
  const canWrite = useCan([SCOPES.ORGANIZATION_WRITE, SCOPES.POS_CONFIG_WRITE])

  const [tab, setTab] = useState('business')
  const [profile, setProfile] = useState(null)
  const [limits, setLimits] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // Only what the user actually changed. Sent as-is, so a tab that shows six fields
  // cannot overwrite the ten it does not — and cannot resurrect a value somebody
  // else changed a minute ago.
  const [draft, setDraft] = useState({})

  const load = useCallback(async () => {
    if (!branchId) return
    setLoading(true)
    try {
      setProfile(await posService.getBusinessProfile(branchId))
      setDraft({})
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Could not load the business profile')
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }, [branchId])

  useEffect(() => { load() }, [load])

  // Fetched once for the session: column widths do not change while a tab is open.
  useEffect(() => {
    posService.getFieldLimits().then(setLimits).catch(() => setLimits({}))
  }, [])

  const lim = (key) => limits[key]

  const set = (section, field) => (value) => setDraft((d) => ({
    ...d,
    [section]: { ...(d[section] || {}), [field]: value },
  }))

  // The draft value if the user touched it, otherwise what is stored. `??` rather
  // than `||` so a deliberately cleared field shows as empty instead of springing
  // back to the stored value.
  const val = (section, field) => draft[section]?.[field] ?? profile?.[section]?.[field] ?? ''

  const gstinDraft = draft.tax?.gstin
  const gstinProblemText = gstinDraft === undefined
    ? null
    : gstinProblem(normaliseGstin(gstinDraft))

  const dirty = Object.keys(draft).some((k) => Object.keys(draft[k] || {}).length > 0)

  const save = async () => {
    if (gstinProblemText) {
      toast.error(gstinProblemText)
      return
    }
    setSaving(true)
    try {
      setProfile(await posService.updateBusinessProfile(branchId, draft))
      setDraft({})
      toast.success('Business details saved')
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Could not save the business details')
    } finally {
      setSaving(false)
    }
  }

  // ── Branding ───────────────────────────────────────────────────────────────
  // Saved immediately rather than through the draft: an image is not a text field,
  // there is nothing to "discard", and holding megabytes of data URI in a form draft
  // to be posted alongside a name change would make every save large.
  const putMedia = async (kind, dataUri) => {
    try {
      await posService.putBranchMedia(branchId, kind, dataUri)
      toast.success(kind === 'logo' ? 'Logo saved' : 'Payment QR saved')
      await load()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Could not save that image')
    }
  }

  const removeMedia = async (kind) => {
    try {
      await posService.deleteBranchMedia(branchId, kind)
      toast.success(kind === 'logo' ? 'Logo removed' : 'Payment QR removed')
      await load()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Could not remove that image')
    }
  }

  // Data URIs for the previews. The profile carries metadata only, so the bytes are
  // fetched per kind — and only for what exists.
  const [previews, setPreviews] = useState({})
  // Keyed on the branding metadata itself, not the whole profile: saving the
  // shop name or address used to download the logo and payment QR again.
  const brandingKey = JSON.stringify(profile?.branding || null)
  useEffect(() => {
    const branding = JSON.parse(brandingKey)
    if (!branchId || !branding) return
    const kinds = Object.entries(branding)
      .filter(([, v]) => !!v).map(([k]) => k)
    if (kinds.length === 0) { setPreviews({}); return }
    let cancelled = false
    Promise.all(kinds.map((k) => posService.getBranchMedia(branchId, k)
      .then((m) => [k, m.dataUri]).catch(() => [k, ''])))
      .then((pairs) => { if (!cancelled) setPreviews(Object.fromEntries(pairs)) })
    // eslint-disable-next-line consistent-return
    return () => { cancelled = true }
  }, [branchId, brandingKey])

  const onTheBill = useMemo(() => profile?.onTheBill || [], [profile])

  if (!branchId) {
    return (
      <div className="fd-page">
        <h1>Business Profile</h1>
        <p className="fd-empty">No branch yet. Finish the setup wizard first.</p>
      </div>
    )
  }

  return (
    <div className="fd-page bp-page">
      <header className="bp-head">
        <div>
          <h1>Business Profile</h1>
          <p className="bp-lead">
            Everything you entered when you set up, and everywhere it is used.
          </p>
        </div>
        {branches.length > 1 && (
          <label className="bp-branch">
            Branch
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              {branches.map((b) => (
                <option key={b.Id || b.id} value={b.Id || b.id}>
                  {b.BranchName || b.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>

      <nav className="bp-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={tab === t.key ? 'is-active' : undefined}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {loading && <p className="fd-empty">Loading…</p>}

      {!loading && profile && (
        <>
          {tab === 'business' && (
            <section className="bp-card">
              <div className="bp-card-head">
                <h2>Business</h2>
                <Provenance of={profile.business.provenance?.organization} />
              </div>
              <Field
                label="Legal / group name"
                value={val('business', 'legalName')}
                onChange={set('business', 'legalName')}
                limit={lim('organizationdetail.Name')}
                disabled={!canWrite}
                hint="Your registered company or group name. Not printed on bills unless you switch it on — see On the bill."
              />
              <Field
                label="Outlet name"
                value={val('business', 'branchName')}
                onChange={set('business', 'branchName')}
                limit={lim('branchdetail.BranchName')}
                disabled={!canWrite}
                hint="This is what prints at the top of every bill."
              />
              <div className="bp-readonly">
                <span className="bp-field-label">Invoice numbering</span>
                <p>
                  {profile.business.invoiceFormat || '—'}
                  {profile.business.invoiceCounter
                    ? ` · ${profile.business.invoiceCounter} issued so far`
                    : ''}
                </p>
                <span className="bp-hint">
                  Change at Outlet → Numbering
                  {profile.business.invoiceSeries
                    ? ` (series “${profile.business.invoiceSeries}”)`
                    : ''}.
                </span>
              </div>
            </section>
          )}

          {tab === 'address' && (
            <>
              <section className="bp-card">
                <div className="bp-card-head">
                  <h2>Address</h2>
                  <Provenance of={profile.address.provenance} />
                </div>
                <p className="bp-lead">
                  Printed under the outlet name on bills and credit notes.
                </p>
                <Field label="Address line 1" value={val('address', 'addressLine1')}
                  onChange={set('address', 'addressLine1')}
                  limit={lim('addressdetail.AddressLine1')} disabled={!canWrite} />
                <Field label="Address line 2" value={val('address', 'addressLine2')}
                  onChange={set('address', 'addressLine2')}
                  limit={lim('addressdetail.AddressLine2')} disabled={!canWrite} />
                <Field label="Landmark" value={val('address', 'landmark')}
                  onChange={set('address', 'landmark')}
                  limit={lim('addressdetail.Landmark')} disabled={!canWrite} />
                <div className="bp-row">
                  <Field label="City" value={val('address', 'city')}
                    onChange={set('address', 'city')}
                    limit={lim('addressdetail.City')} disabled={!canWrite} />
                  <Field label="State" value={val('address', 'state')}
                    onChange={set('address', 'state')}
                    limit={lim('addressdetail.State')} disabled={!canWrite} />
                  <Field label="Pincode" value={val('address', 'pincode')}
                    onChange={set('address', 'pincode')}
                    limit={lim('addressdetail.Pincode')} disabled={!canWrite} />
                </div>
              </section>

              <section className="bp-card">
                <div className="bp-card-head">
                  <h2>Contact</h2>
                  <Provenance of={profile.contact.provenance} />
                </div>
                <div className="bp-row">
                  <Field label="First name" value={val('contact', 'firstName')}
                    onChange={set('contact', 'firstName')}
                    limit={lim('contactdetail.FirstName')} disabled={!canWrite} />
                  <Field label="Last name" value={val('contact', 'lastName')}
                    onChange={set('contact', 'lastName')}
                    limit={lim('contactdetail.LastName')} disabled={!canWrite} />
                </div>
                <div className="bp-row">
                  <Field label="Mobile" value={val('contact', 'mobileNo')}
                    onChange={set('contact', 'mobileNo')} limit={20}
                    disabled={!canWrite}
                    hint="Can print on bills as the number to call." />
                  <Field label="Landline" value={val('contact', 'landline1')}
                    onChange={set('contact', 'landline1')} limit={20}
                    disabled={!canWrite} />
                </div>
                <Field label="Email" type="email" value={val('contact', 'email')}
                  onChange={set('contact', 'email')}
                  limit={lim('contactdetail.Email')} disabled={!canWrite} />
              </section>
            </>
          )}

          {tab === 'tax' && (
            <>
              <section className="bp-card">
                <div className="bp-card-head">
                  <h2>Registrations</h2>
                  <Provenance of={profile.tax.provenance} />
                </div>
                <Field
                  label="GSTIN"
                  value={val('tax', 'gstin')}
                  onChange={(v) => set('tax', 'gstin')(normaliseGstin(v))}
                  limit={15}
                  disabled={!canWrite}
                  problem={gstinProblemText}
                  note={stateOfGstin(normaliseGstin(val('tax', 'gstin')))
                    ? `Registered in ${stateOfGstin(normaliseGstin(val('tax', 'gstin')))}`
                    : null}
                  hint="Each invoice keeps the GSTIN it was issued under — changing this never rewrites a bill already given out."
                />
                <Field label="FSSAI licence" value={val('tax', 'fssai')}
                  onChange={set('tax', 'fssai')}
                  limit={lim('branchdetail.FSSAI')} disabled={!canWrite}
                  hint="Displaying it is a licence condition for most food businesses. Switch printing on under On the bill." />
                <div className="bp-row">
                  <Field label="PAN" value={val('tax', 'pan')}
                    onChange={set('tax', 'pan')}
                    limit={lim('branchdetail.PAN')} disabled={!canWrite} />
                  <Field label="TIN" value={val('tax', 'tin')}
                    onChange={set('tax', 'tin')}
                    limit={lim('branchdetail.TINNo')} disabled={!canWrite} />
                </div>
              </section>

              {/* The switch itself, reused rather than reimplemented. It carries its
                  own confirmation, its own history and the open-orders guard — a
                  second copy of that would be a second set of rules to keep right. */}
              <GstSettingsCard canWrite={canWrite} />
            </>
          )}

          {tab === 'branding' && (
            <section className="bp-card">
              <h2>Branding</h2>
              <p className="bp-lead">
                Both are off on bills until you switch them on under On the bill.
              </p>
              <div className="bp-media-grid">
                <MediaUploadCard
                  label="Logo"
                  hint="Monochrome prints best. Wide, short images suit a till roll."
                  value={previews.logo || ''}
                  meta={profile.branding?.logo}
                  onChange={(dataUri) => putMedia('logo', dataUri)}
                  onRemove={() => removeMedia('logo')}
                  canWrite={canWrite}
                />
                <MediaUploadCard
                  label="Payment QR"
                  hint="A static UPI QR from your bank or PSP. The customer types the amount — a QR printed before the total is known cannot carry one."
                  value={previews.paymentQr || ''}
                  meta={profile.branding?.paymentQr}
                  onChange={(dataUri) => putMedia('paymentQr', dataUri)}
                  onRemove={() => removeMedia('paymentQr')}
                  canWrite={canWrite}
                />
              </div>
            </section>
          )}

          {tab === 'bill' && (
            <section className="bp-card">
              <h2>On the bill</h2>
              <p className="bp-lead">
                What a customer actually sees. A value can be stored here and still
                not print — this is where you can tell.
              </p>
              <ul className="bp-bill-list">
                {onTheBill.map((f) => (
                  <li key={f.key} className={f.prints ? 'is-on' : 'is-off'}>
                    <span className="bp-bill-mark" aria-hidden="true">
                      {f.prints ? '✓' : (f.hasValue ? '✗' : '—')}
                    </span>
                    <span className="bp-bill-label">{f.label}</span>
                    <span className="bp-bill-value">
                      {f.hasValue
                        ? (f.key === 'logo' || f.key === 'upiQr' ? 'uploaded' : f.value)
                        : <em>not set</em>}
                    </span>
                    <span className="bp-bill-state">{f.state}</span>
                    <span className="bp-bill-action">
                      {f.action === 'switchOn' && 'stored, not printed'}
                      {f.action === 'setValue' && 'nothing to print'}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="bp-hint">
                ✓ prints · ✗ stored but switched off · — nothing stored.
                Change what prints at Outlet → Receipt Format.
              </p>
            </section>
          )}

          {/* Branding and On the bill have nothing to discard: one saves on upload,
              the other is read-only. */}
          {canWrite && tab !== 'branding' && tab !== 'bill' && (
            <div className="bp-actions">
              <button type="button" className="fd-btn" disabled={!dirty || saving}
                onClick={() => setDraft({})}>
                Discard
              </button>
              <button type="button" className="fd-btn fd-btn-primary"
                disabled={!dirty || saving || !!gstinProblemText} onClick={save}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default BusinessProfile
