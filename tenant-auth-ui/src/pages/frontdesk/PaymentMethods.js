import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import posService from '../../services/posService'
import { useAuth } from '../../context/AuthContext'
import { hasScope } from '../../utils/permissions'
import { SCOPES } from '../../constants'

/**
 * Outlet › Payment methods › Accepted here.
 *
 * Which tenders ONE branch accepts, over the tenant-wide catalogue (Payment
 * Modes). A branch that has decided nothing inherits each method's default;
 * flipping a switch back to that default removes the branch's override on the
 * server, so "Inherited" is shown rather than a stored copy of the default.
 */
const PaymentMethods = () => {
  const { user } = useAuth()
  const canWrite = hasScope(user, [SCOPES.POS_CONFIG_WRITE, SCOPES.MASTER_DATA_WRITE, SCOPES.TENANT_ADMIN])

  const [branches, setBranches] = useState([])
  const [branchId, setBranchId] = useState('')
  const [methods, setMethods] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)

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
      const res = await posService.getBranchPaymentMethods(branchId)
      setMethods(res?.methods || [])
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not load payment methods.')
    } finally {
      setLoading(false)
    }
  }, [branchId])

  useEffect(() => { load() }, [load])

  const toggle = async (m) => {
    setSaving(m.paymentModeId)
    try {
      const res = await posService.setBranchPaymentMethods(branchId, [
        { paymentModeId: m.paymentModeId, enabled: !m.enabled },
      ])
      setMethods(res?.methods || [])
    } catch (err) {
      // 409 = the save would leave the counter unable to take money at all.
      toast.error(err.response?.data?.message || 'Could not save.')
    } finally {
      setSaving(null)
    }
  }

  if (!loading && branches.length === 0) {
    return <div className="fd-crud-page"><h1>Payment methods</h1><div className="fd-empty">Add a branch first.</div></div>
  }

  return (
    <div className="fd-crud-page">
      <h1>Payment methods</h1>
      <p className="fd-page-sub">
        What this branch&apos;s tills offer at Settle. Add or rename methods on the Payment Modes tab; switch them on or off per branch here.
      </p>

      <div className="fd-token-toolbar">
        <label htmlFor="pm-branch">Branch</label>
        <select id="pm-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          {branches.map((b) => (
            <option key={b.Id || b.id} value={b.Id || b.id}>{b.BranchName || b.Name || b.Id}</option>
          ))}
        </select>
      </div>

      {loading && <div className="fd-empty">Loading…</div>}

      {!loading && (
        <section className="fd-setting-card">
          <div className="fd-setting-options" role="group" aria-label="Payment methods at this branch">
            {methods.filter((m) => m.active !== false).map((m) => (
              <label key={m.paymentModeId} className={`fd-setting-option ${m.enabled ? 'is-active' : ''}`}>
                <input
                  type="checkbox"
                  checked={!!m.enabled}
                  disabled={!canWrite || saving === m.paymentModeId}
                  onChange={() => toggle(m)}
                />
                <span>
                  <strong>{m.type}</strong>
                  <em>
                    {[
                      m.accountName ? `Books to ${m.accountName}` : null,
                      m.requiresReference ? 'Needs a reference number' : null,
                      m.source === 'branch' ? 'Set for this branch' : 'Inherited default',
                    ].filter(Boolean).join(' · ')}
                  </em>
                </span>
              </label>
            ))}
            {methods.length === 0 && <div className="fd-empty">No payment methods yet — add them on the Payment Modes tab.</div>}
          </div>
          {!canWrite && <p className="fd-setting-desc" style={{ marginTop: 10 }}>You can view these. Changing them needs setup access.</p>}
        </section>
      )}
    </div>
  )
}

export default PaymentMethods
