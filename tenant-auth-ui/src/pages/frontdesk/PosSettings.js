import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'react-toastify'
import posService from '../../services/posService'
import { useAuth } from '../../context/AuthContext'
import { hasScope } from '../../utils/permissions'
import { SCOPES } from '../../constants'

// Mirrors POS_SETTING_KEYS / TOKEN_NUMBERING in the backend's config/constants.js.
const TOKEN_NUMBERING_KEY = 'token.numbering'
const KOT_AUTO_PRINT_KEY = 'kot.auto_print'

const NUMBERING_OPTIONS = [
  {
    value: 'daily',
    label: 'Daily (1, 2, 3 — resets every morning)',
    hint: 'What a physical token counter does. Numbers stay short enough to call '
        + 'across a room, and each branch counts on its own.',
  },
  {
    value: 'series',
    label: 'Continuous series (TOK-0001)',
    hint: 'Never resets, so every token is unique for all time — useful if tokens '
        + 'are reconciled against paperwork later. The series is shared by every '
        + 'branch in this tenant, and the format is editable under Master Data → '
        + 'Transaction Type Config.',
  },
]

const KOT_PRINT_OPTIONS = [
  {
    value: 'on',
    label: 'Print when the round is sent',
    hint: 'The ticket comes out the moment someone presses Send to Kitchen, so '
        + 'nobody has to remember a second action on a busy pass. Re-sending a '
        + 'round that already has a live ticket never prints again — that is how '
        + 'a kitchen ends up cooking the same round twice.',
  },
  {
    value: 'off',
    label: 'Do not print automatically',
    hint: 'For a kitchen that works off the screen, or a till with no printer '
        + 'attached. Tickets can still be printed one at a time from the Kitchen '
        + 'board when a paper copy is wanted.',
  },
]

/**
 * Per-branch POS preferences.
 *
 * Branch-scoped on purpose: a food-court counter and a fine-dine outlet under
 * one owner legitimately want different behaviour. A branch that has never been
 * saved here is not unconfigured — it runs on the defaults shown.
 */
const PosSettings = () => {
  const { user } = useAuth()
  const canWrite = hasScope(user, [SCOPES.POS_CONFIG_WRITE, SCOPES.TENANT_ADMIN])

  const [branches, setBranches] = useState([])
  const [branchId, setBranchId] = useState('')
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // The POS-scoped list, not crudService('branchDetails') — that endpoint is
    // gated on ORGANIZATION_READ, which a POS manager need not hold.
    posService.getPosBranches()
      .then((list) => {
        setBranches(list)
        setBranchId(list.length > 0 ? (list[0].Id || list[0].id) : '')
      })
      .catch(() => setBranches([]))
      .finally(() => setLoading(false))
  }, [])

  const load = useCallback(async () => {
    if (!branchId) { setSettings(null); return }
    try {
      setSettings(await posService.getPosSettings(branchId))
    } catch {
      toast.error('Failed to load settings for this branch')
      setSettings(null)
    }
  }, [branchId])

  useEffect(() => { load() }, [load])

  const save = async (key, value) => {
    // Optimistic: the control is a radio, and leaving it on the old value while
    // the request flies reads as a click that did not register.
    const previous = settings
    setSettings((s) => ({ ...s, [key]: value }))
    setSaving(true)
    try {
      const saved = await posService.updatePosSettings(branchId, { [key]: value })
      setSettings(saved)
      toast.success('Setting saved')
    } catch (e) {
      setSettings(previous)
      toast.error(e?.response?.data?.message || 'Failed to save the setting')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="fd-loading">Loading settings...</div>

  if (branches.length === 0) {
    return (
      <div className="fd-crud-page">
        <h1>⚙️ POS Settings</h1>
        <div className="fd-empty">
          These settings are per branch. Add a branch under Organization →
          Branch Details first.
        </div>
      </div>
    )
  }

  const numbering = settings?.[TOKEN_NUMBERING_KEY] || 'daily'
  // Defaults ON, matching the server: a branch that has never saved this is
  // not a branch that wants silence from its printer.
  const kotPrint = settings?.[KOT_AUTO_PRINT_KEY] === 'off' ? 'off' : 'on'

  return (
    <div className="fd-crud-page">
      <h1>⚙️ POS Settings</h1>
      <p className="fd-page-sub">
        Applies to one branch at a time. A branch you have never saved here runs
        on the defaults shown below.
      </p>

      <div className="fd-token-toolbar">
        <label htmlFor="set-branch">Branch</label>
        <select id="set-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          {branches.map((b) => (
            <option key={b.Id || b.id} value={b.Id || b.id}>
              {b.BranchName || b.Name || b.Id}
            </option>
          ))}
        </select>
      </div>

      <section className="fd-setting-card">
        <h2>Counter token numbering</h2>
        <p className="fd-setting-desc">
          How the number handed to a counter customer is generated when their
          bill is paid.
        </p>
        <div className="fd-setting-options" role="radiogroup" aria-label="Counter token numbering">
          {NUMBERING_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`fd-setting-option ${numbering === opt.value ? 'is-active' : ''}`}
            >
              <input
                type="radio"
                name={TOKEN_NUMBERING_KEY}
                value={opt.value}
                checked={numbering === opt.value}
                disabled={!canWrite || saving}
                onChange={() => save(TOKEN_NUMBERING_KEY, opt.value)}
              />
              <span>
                <strong>{opt.label}</strong>
                <em>{opt.hint}</em>
              </span>
            </label>
          ))}
        </div>
        {!canWrite && (
          <p className="fd-setting-desc">
            You have read-only access to POS configuration.
          </p>
        )}
      </section>

      <section className="fd-setting-card" style={{ marginTop: 16 }}>
        <h2>Kitchen ticket printing</h2>
        <p className="fd-setting-desc">
          Whether sending a round to the kitchen also puts it on paper.
        </p>
        <div className="fd-setting-options" role="radiogroup" aria-label="Kitchen ticket printing">
          {KOT_PRINT_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`fd-setting-option ${kotPrint === opt.value ? 'is-active' : ''}`}
            >
              <input
                type="radio"
                name={KOT_AUTO_PRINT_KEY}
                value={opt.value}
                checked={kotPrint === opt.value}
                disabled={!canWrite || saving}
                onChange={() => save(KOT_AUTO_PRINT_KEY, opt.value)}
              />
              <span>
                <strong>{opt.label}</strong>
                <em>{opt.hint}</em>
              </span>
            </label>
          ))}
        </div>
        {/* Deliberately NOT a second control here. How many copies come out —
            one for the pass, a second for the customer — is already a field on
            the kitchen ticket itself, and two settings for one behaviour is how
            they end up disagreeing. */}
        <p className="fd-setting-desc" style={{ marginTop: 12 }}>
          What the ticket says, and how many copies print, are set under{' '}
          <strong>Receipt Format → Kitchen ticket</strong>. Set Copies to 2 there
          for a customer copy alongside the kitchen's.
        </p>
        {!canWrite && (
          <p className="fd-setting-desc">
            You have read-only access to POS configuration.
          </p>
        )}
      </section>
    </div>
  )
}

export default PosSettings
