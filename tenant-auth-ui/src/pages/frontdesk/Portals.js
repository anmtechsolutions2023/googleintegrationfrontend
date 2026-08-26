import React, { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import posService from '../../services/posService'
import { SCOPES } from '../../constants'
import { useCan } from '../../hooks/useCan'
import FormModal from '../../components/MasterData/FormModal'
import ConfirmDialog from '../../components/MasterData/ConfirmDialog'
import { PortalMonogram } from '../../components/frontdesk/PortalBadge'

// The portal master: the aggregators that sell on our behalf.
//
// Everything the old free-text `Platform` string could not hold — commission,
// adapter, colour, credentials, and the branch ↔ store mapping every inbound
// order resolves through.
//
// Not built on PosCrudPage: a portal is not a flat row. It owns a store-mapping
// table and a write-only credential set, and folding those into a field-driven
// form would mean either three screens or a form that lies about what it saves.

const PORTAL_FIELDS = [
  { name: 'Name', type: 'text', required: true, maxLength: 100 },
  { name: 'Code', type: 'text', required: true, maxLength: 50, hint: 'Uppercase, e.g. ZOMATO. Used in the webhook URL.' },
  {
    name: 'Adapter',
    label: 'Integration',
    type: 'select',
    options: [
      { value: 'manual', label: 'Keyed in by hand' },
      { value: 'zomato.v1', label: 'Zomato API' },
      { value: 'swiggy.v1', label: 'Swiggy API' },
      { value: 'district.v1', label: 'District API' },
    ],
    hint: 'Manual orders behave exactly like connected ones — only how they arrive changes.',
  },
  { name: 'ColorHex', label: 'Colour', type: 'text', maxLength: 9, hint: 'Hex, e.g. #E23744. The order queue paints its rail from this.' },
  { name: 'ShortCode', label: 'Monogram', type: 'text', maxLength: 4, hint: 'Two letters shown beside the colour, e.g. ZO.' },
  { name: 'CommissionPct', label: 'Commission %', type: 'number', min: 0, max: 100, step: 0.001 },
  {
    name: 'SettlementPaymentModeId',
    label: 'Settlement tender',
    type: 'select',
    reference: 'paymentModes',
    hint: 'Where an accepted order books. Use the portal\'s receivable, never Cash.',
  },
  { name: 'SortOrder', label: 'Sort order', type: 'number' },
  { name: 'Active', type: 'boolean', default: true },
]

const CREDENTIAL_FIELDS = [
  { name: 'WebhookSecret', label: 'Webhook secret', type: 'text', maxLength: 255, hint: 'What inbound signatures are verified against. Never shown again once saved.' },
  { name: 'ApiKey', label: 'API key', type: 'text', maxLength: 255 },
  { name: 'ApiSecret', label: 'API secret', type: 'text', maxLength: 255 },
  { name: 'ApiBaseUrl', label: 'API base URL', type: 'text', maxLength: 255 },
]

const BRANCH_FIELDS = (branches) => [
  {
    name: 'BranchDetailId',
    label: 'Branch',
    type: 'select',
    required: true,
    options: branches.map((b) => ({ value: b.Id || b.id, label: b.BranchName })),
  },
  { name: 'ExternalStoreId', label: 'Store ID on the portal', type: 'text', maxLength: 100, hint: 'How an incoming order finds this branch.' },
  { name: 'IsOnline', label: 'Accepting orders', type: 'boolean', default: true },
]

const Portals = () => {
  const canWrite = useCan(SCOPES.POS_CONFIG_WRITE)

  const [portals, setPortals] = useState([])
  const [branches, setBranches] = useState([])
  const [paymentModes, setPaymentModes] = useState([])
  const [mappings, setMappings] = useState({})
  const [expandedId, setExpandedId] = useState(null)
  const [loading, setLoading] = useState(true)

  const [portalForm, setPortalForm] = useState(null)
  const [credentialFor, setCredentialFor] = useState(null)
  const [branchForm, setBranchForm] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [rows, branchRows, modes] = await Promise.all([
        posService.getPortals({ limit: 100, expand: true }),
        posService.getPosBranches(),
        posService.getPaymentModes().catch(() => []),
      ])
      setPortals(rows)
      setBranches(branchRows)
      setPaymentModes(modes)
    } catch {
      toast.error('Failed to load portals')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const loadMappings = useCallback(async (portalId) => {
    try {
      const rows = await posService.getPortalBranches(portalId)
      setMappings((prev) => ({ ...prev, [portalId]: rows }))
    } catch {
      setMappings((prev) => ({ ...prev, [portalId]: [] }))
    }
  }, [])

  const toggleExpand = (portal) => {
    const id = portal.Id || portal.id
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    if (!mappings[id]) loadMappings(id)
  }

  const savePortal = async (data) => {
    setSaving(true)
    try {
      if (portalForm?.Id || portalForm?.id) {
        await posService.updatePortal(portalForm.Id || portalForm.id, data)
        toast.success('Portal updated')
      } else {
        await posService.createPortal(data)
        toast.success('Portal added')
      }
      setPortalForm(null)
      load()
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save the portal')
    } finally {
      setSaving(false)
    }
  }

  const saveCredentials = async (data) => {
    setSaving(true)
    try {
      // Only what was actually typed is sent. A field left blank keeps its
      // stored value — a form that shows "••••" and submits an empty string is
      // the classic way credential screens destroy a working integration.
      const payload = Object.fromEntries(
        Object.entries(data).filter(([, v]) => v !== undefined && v !== null && v !== ''),
      )
      if (Object.keys(payload).length === 0) {
        toast.info('Nothing to save — leave a field blank to keep what is already stored.')
        setCredentialFor(null)
        return
      }
      await posService.savePortalCredentials(credentialFor.Id || credentialFor.id, payload)
      toast.success('Credentials saved')
      setCredentialFor(null)
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save credentials')
    } finally {
      setSaving(false)
    }
  }

  const saveBranch = async (data) => {
    setSaving(true)
    try {
      if (branchForm.mappingId) {
        await posService.updatePortalBranch(branchForm.mappingId, data)
      } else {
        await posService.createPortalBranch({ ...data, PortalId: branchForm.portalId })
      }
      toast.success('Store mapping saved')
      loadMappings(branchForm.portalId)
      setBranchForm(null)
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save the mapping')
    } finally {
      setSaving(false)
    }
  }

  const removePortal = async () => {
    setSaving(true)
    try {
      await posService.deletePortal(deleteTarget.Id || deleteTarget.id)
      toast.success('Portal removed')
      setDeleteTarget(null)
      load()
    } catch (err) {
      // A portal with orders behind it is deactivated, not deleted — the server
      // says so and the message is worth showing verbatim.
      toast.error(err?.response?.data?.message || 'Failed to remove the portal')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fd-crud-page">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 18 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1>🔀 Portals</h1>
          <p className="fd-page-sub">
            The aggregators that sell on your behalf. Each one is a seller on the
            <strong> Online</strong> channel — its colour, commission and per-branch store
            mapping live here, and the order queue reads all three.
          </p>
        </div>
        {canWrite && (
          <button type="button" className="fd-btn fd-btn-primary" onClick={() => setPortalForm({})}>
            ➕ Add portal
          </button>
        )}
      </div>

      {loading && <div className="fd-loading">Loading portals…</div>}
      {!loading && portals.length === 0 && (
        <div className="fd-empty">No portals yet. Add Zomato, Swiggy or District to get started.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {portals.map((portal) => {
          const id = portal.Id || portal.id
          const expanded = expandedId === id
          const rows = mappings[id] || []
          const isManual = (portal.Adapter || 'manual') === 'manual'

          return (
            <div
              key={id}
              style={{
                background: '#fff', border: '1px solid #e1e5eb', borderRadius: 8,
                boxShadow: '0 1px 3px rgba(0,0,0,.06)', overflow: 'hidden',
              }}
            >
              <div style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px',
                borderLeft: `4px solid ${portal.ColorHex || '#7f8c8d'}`, flexWrap: 'wrap',
              }}
              >
                <PortalMonogram portal={portal} size={40} />

                <div style={{ minWidth: 160 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#2c3e50' }}>{portal.Name}</div>
                  <div style={{ fontSize: 11.5, color: '#7f8c8d' }}>
                    {portal.Code} · {portal.Adapter}
                  </div>
                </div>

                <div style={{ minWidth: 130 }}>
                  <div className="fd-field-label">Connection</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: isManual ? '#b2bec3' : '#27ae60',
                    }}
                    />
                    <span style={{ fontSize: 13, fontWeight: 600, color: isManual ? '#7f8c8d' : '#1e8449' }}>
                      {isManual ? 'Entered by hand' : 'API'}
                    </span>
                  </div>
                </div>

                <div style={{ minWidth: 110 }}>
                  <div className="fd-field-label">Commission</div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: '#2c3e50', marginTop: 3 }}>
                    {Number(portal.CommissionPct || 0).toFixed(2)}%
                  </div>
                </div>

                <div style={{ minWidth: 110 }}>
                  <div className="fd-field-label">Listings</div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: '#2c3e50', marginTop: 3 }}>
                    {portal.ListingCount ?? 0} live
                  </div>
                  {/* Fire-and-record: this only reads true because the push
                      writes down what the portal accepted. */}
                  {Number(portal.UnsyncedCount) > 0 && (
                    <div style={{ fontSize: 11, color: '#e67e22', fontWeight: 600 }}>
                      {portal.UnsyncedCount} out of sync
                    </div>
                  )}
                </div>

                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Link className="fd-btn fd-btn-outline" to={`/frontdesk/portals/${id}/menu`}>
                    Menu
                  </Link>
                  <button type="button" className="fd-btn fd-btn-outline" onClick={() => toggleExpand(portal)}>
                    {expanded ? 'Hide branches' : 'Branches'}
                  </button>
                  {canWrite && (
                    <>
                      <button type="button" className="fd-btn fd-btn-outline" onClick={() => setCredentialFor(portal)}>
                        Credentials
                      </button>
                      <button type="button" className="fd-btn fd-btn-outline" onClick={() => setPortalForm(portal)}>
                        Edit
                      </button>
                      <button type="button" className="fd-btn fd-btn-danger" onClick={() => setDeleteTarget(portal)}>
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>

              {expanded && (
                <div style={{ borderTop: '1px solid #f0f4f8', background: '#f7f9fc', padding: '14px 18px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                    <span className="fd-field-label">Branch → store mapping</span>
                    <span style={{ fontSize: 11.5, color: '#b2bec3' }}>
                      an incoming order finds its branch through this
                    </span>
                    {canWrite && (
                      <button
                        type="button"
                        className="fd-btn fd-btn-outline fd-btn-sm"
                        style={{ marginLeft: 'auto' }}
                        onClick={() => setBranchForm({ portalId: id })}
                      >
                        Map a branch
                      </button>
                    )}
                  </div>

                  {rows.length === 0 && (
                    <div style={{ fontSize: 13, color: '#7f8c8d' }}>
                      No branches mapped. Orders from this portal cannot be routed until one is.
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {rows.map((m) => (
                      <div
                        key={m.Id || m.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 14, background: '#fff',
                          border: '1px solid #e1e5eb', borderRadius: 6, padding: '10px 14px',
                          flexWrap: 'wrap',
                        }}
                      >
                        <div style={{ minWidth: 160, fontSize: 13.5, fontWeight: 600, color: '#2c3e50' }}>
                          {m.BranchName}
                        </div>
                        <div style={{ minWidth: 140, fontSize: 13, color: '#5a6c7d', fontFamily: 'ui-monospace, Menlo, monospace' }}>
                          {m.ExternalStoreId || <em style={{ color: '#b2bec3' }}>no store id</em>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: m.IsOnline ? '#27ae60' : '#e67e22',
                          }}
                          />
                          <span style={{ fontSize: 12.5, fontWeight: 600, color: m.IsOnline ? '#1e8449' : '#e67e22' }}>
                            {m.IsOnline ? 'Accepting orders' : 'Paused'}
                          </span>
                        </div>
                        {canWrite && (
                          <button
                            type="button"
                            className="fd-btn fd-btn-outline fd-btn-sm"
                            style={{ marginLeft: 'auto' }}
                            onClick={() => setBranchForm({
                              portalId: id,
                              mappingId: m.Id || m.id,
                              initial: {
                                BranchDetailId: m.BranchDetailId,
                                ExternalStoreId: m.ExternalStoreId,
                                IsOnline: !!m.IsOnline,
                              },
                            })}
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <FormModal
        isOpen={!!portalForm}
        onClose={() => setPortalForm(null)}
        title={portalForm?.Id || portalForm?.id ? 'Edit portal' : 'Add portal'}
        fields={PORTAL_FIELDS}
        initialData={portalForm?.Id || portalForm?.id ? portalForm : null}
        referenceData={{ paymentModes }}
        onSubmit={savePortal}
        loading={saving}
      />

      <FormModal
        isOpen={!!credentialFor}
        onClose={() => setCredentialFor(null)}
        title={`${credentialFor?.Name || 'Portal'} credentials`}
        fields={CREDENTIAL_FIELDS}
        // Deliberately never seeded: no GET returns these anywhere, and showing
        // a masked value in an editable box invites somebody to overwrite a
        // working secret with dots.
        initialData={null}
        onSubmit={saveCredentials}
        loading={saving}
      />

      <FormModal
        isOpen={!!branchForm}
        onClose={() => setBranchForm(null)}
        title={branchForm?.mappingId ? 'Edit store mapping' : 'Map a branch'}
        fields={BRANCH_FIELDS(branches)}
        initialData={branchForm?.initial || null}
        onSubmit={saveBranch}
        loading={saving}
      />

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={removePortal}
        title="Delete portal"
        message={`Remove ${deleteTarget?.Name}? A portal that has taken orders cannot be deleted — deactivate it instead so its history survives.`}
        confirmText="Delete"
        type="danger"
        loading={saving}
      />
    </div>
  )
}

export default Portals
