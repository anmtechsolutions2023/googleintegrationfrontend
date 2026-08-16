import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'react-toastify'
import posService from '../../services/posService'
import { useAuth } from '../../context/AuthContext'
import { hasScope } from '../../utils/permissions'
import { SCOPES, APP_CONFIG } from '../../constants'
import FormModal from '../../components/MasterData/FormModal'
import ConfirmDialog from '../../components/MasterData/ConfirmDialog'
import RoundsTimeline from '../../components/frontdesk/RoundsTimeline'
import { buildTableRounds } from '../../utils/posRounds'
import { TABLE_STATUSES, statusLabel } from '../../utils/posStatus'

const { MAX_LIMIT } = APP_CONFIG.PAGINATION

const TABLE_FIELDS = [
  { name: 'Name', type: 'text', required: true, maxLength: 50 },
  { name: 'Capacity', type: 'number', min: 1 },
  {
    // Values are the canonical lowercase enum the API validates against; the
    // dropdown shows them Title Case.
    name: 'Status',
    type: 'select',
    default: 'free',
    options: TABLE_STATUSES.map((s) => ({ value: s, label: statusLabel(s) })),
  },
  { name: 'Active', type: 'boolean', default: true },
]

const SYSTEM_FIELDS = [
  'Id', 'id', 'TenantId', 'tenantId',
  'CreatedAt', 'UpdatedAt', 'CreatedOn', 'UpdatedOn',
  'createdAt', 'updatedAt', 'createdOn', 'updatedOn',
  'CreatedBy', 'UpdatedBy', 'createdBy', 'updatedBy',
  'DeletedAt', 'deletedAt', 'DeletedBy', 'deletedBy',
]

const stripSystemFields = (data) => {
  const cleaned = {}
  Object.keys(data).forEach((key) => {
    if (!SYSTEM_FIELDS.includes(key)) cleaned[key] = data[key]
  })
  return cleaned
}

const Tables = () => {
  const { user } = useAuth()
  const canWrite = hasScope(user, [SCOPES.POS_CONFIG_WRITE, SCOPES.TENANT_ADMIN])

  const [floors, setFloors]   = useState([])
  const [tables, setTables]   = useState([])
  const [orders, setOrders]   = useState([])
  const [activeFloor, setActiveFloor] = useState(null)
  const [loading, setLoading] = useState(true)
  const [view, setView]       = useState('occupancy') // 'occupancy' | 'manage'

  // Table clicked for the round-by-round detail view
  const [detailTableId, setDetailTableId] = useState(null)

  const [modalOpen, setModalOpen]     = useState(false)
  const [editRecord, setEditRecord]   = useState(null)
  const [formLoading, setFormLoading] = useState(false)
  const [deleteTarget, setDelTarget]  = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Inject a Floor dropdown (built from loaded floors) into the table form.
  const tableFields = useMemo(() => {
    const floorField = {
      name: 'FloorId', label: 'Floor', type: 'select',
      options: floors.map((f) => ({ value: f.id || f.Id, label: f.Name || f.name })),
    }
    return [TABLE_FIELDS[0], floorField, ...TABLE_FIELDS.slice(1)]
  }, [floors])

  const detailTable = useMemo(
    () => tables.find((t) => (t.id || t.Id) === detailTableId) || null,
    [tables, detailTableId],
  )
  const detailRounds = useMemo(
    () => buildTableRounds(orders, detailTableId),
    [orders, detailTableId],
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [f, t, o] = await Promise.all([
        posService.getFloors(),
        posService.getTables(),
        posService.getOrders({ limit: MAX_LIMIT }),
      ])
      setFloors(f)
      setTables(t)
      setOrders(o)
      if (f.length > 0 && !activeFloor) setActiveFloor(f[0].id || f[0].Id)
    } catch {
      toast.error('Failed to load floor/table data')
    } finally {
      setLoading(false)
    }
  }, [activeFloor])

  useEffect(() => { load() }, []) // eslint-disable-line

  const visibleTables = activeFloor
    ? tables.filter((t) => t.FloorId === activeFloor)
    : tables

  const statusClass = (status) => {
    const s = (status || '').toLowerCase()
    if (s === 'occupied') return 'occupied'
    if (s === 'reserved') return 'reserved'
    return ''
  }

  const handleCreate = () => { setEditRecord(null); setModalOpen(true) }
  const handleEdit   = (record) => { setEditRecord(record); setModalOpen(true) }
  const handleDelete = (record) => setDelTarget(record)

  const handleSubmit = async (formData) => {
    setFormLoading(true)
    try {
      const payload = stripSystemFields(formData)
      if (editRecord) {
        const id = editRecord.id || editRecord.Id
        await posService.updateTable(id, payload)
        toast.success('Table updated')
      } else {
        await posService.createTable(payload)
        toast.success('Table created')
      }
      setModalOpen(false)
      setEditRecord(null)
      load()
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save table')
    } finally {
      setFormLoading(false)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    setDeleteLoading(true)
    try {
      const id = deleteTarget.id || deleteTarget.Id
      await posService.deleteTable(id)
      toast.success('Table deleted')
      setDelTarget(null)
      load()
    } catch {
      toast.error('Failed to delete table')
    } finally {
      setDeleteLoading(false)
    }
  }

  if (loading) return <div className="fd-loading">Loading tables...</div>

  return (
    <div className="fd-tables-view">
      <div className="content-header">
        <h1>🪑 Tables</h1>
        <div className="content-header-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', border: '1px solid #d0d4da', borderRadius: 6, overflow: 'hidden' }}>
            <button
              style={{
                padding: '6px 14px', fontSize: 13, border: 'none', cursor: 'pointer',
                background: view === 'occupancy' ? '#2c3e50' : '#fff',
                color: view === 'occupancy' ? '#fff' : '#2c3e50',
              }}
              onClick={() => setView('occupancy')}
            >
              Occupancy View
            </button>
            <button
              style={{
                padding: '6px 14px', fontSize: 13, border: 'none', cursor: 'pointer',
                background: view === 'manage' ? '#2c3e50' : '#fff',
                color: view === 'manage' ? '#fff' : '#2c3e50',
              }}
              onClick={() => setView('manage')}
            >
              Manage Tables
            </button>
          </div>
          {canWrite && (
            <button className="btn btn-primary" onClick={handleCreate}>
              ➕ Add Table
            </button>
          )}
          <button className="btn btn-secondary" onClick={load}>🔄 Refresh</button>
        </div>
      </div>

      {view === 'occupancy' ? (
        <>
          <div className="fd-floor-tabs">
            <button
              className={`fd-floor-tab ${!activeFloor ? 'active' : ''}`}
              onClick={() => setActiveFloor(null)}
            >
              All Floors
            </button>
            {floors.map((f) => {
              const fid = f.id || f.Id
              return (
                <button
                  key={fid}
                  className={`fd-floor-tab ${activeFloor === fid ? 'active' : ''}`}
                  onClick={() => setActiveFloor(fid)}
                >
                  {f.Name || f.name}
                </button>
              )
            })}
          </div>

          {visibleTables.length === 0 ? (
            <div className="fd-empty">No tables found for this floor.</div>
          ) : (
            <div className="fd-table-grid">
              {visibleTables.map((t) => {
                const tid = t.id || t.Id
                const sc  = statusClass(t.Status)
                return (
                  <div
                    key={tid}
                    className={`fd-table-card ${sc}`}
                    onClick={() => setDetailTableId(tid)}
                    title="View order rounds"
                  >
                    <div className="table-name">{t.Name || t.name}</div>
                    {t.Capacity != null && (
                      <div className="table-cap">Capacity: {t.Capacity}</div>
                    )}
                    {t.Status && (
                      <div className="table-status">{statusLabel(t.Status)}</div>
                    )}
                    {canWrite && (
                      <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: 11, padding: '2px 8px' }}
                          onClick={(e) => { e.stopPropagation(); handleEdit(t) }}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-danger"
                          style={{ fontSize: 11, padding: '2px 8px' }}
                          onClick={(e) => { e.stopPropagation(); handleDelete(t) }}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ marginTop: 20, display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: '#7f8c8d' }}>
            <span style={{ display: 'inline-block', width: 14, height: 14, background: '#fff', border: '2px solid #e1e5eb', borderRadius: 3 }} /> Available
            <span style={{ display: 'inline-block', width: 14, height: 14, background: '#ffeaa7', border: '2px solid #f39c12', borderRadius: 3, marginLeft: 12 }} /> Occupied
            <span style={{ display: 'inline-block', width: 14, height: 14, background: '#dfe6e9', border: '2px solid #636e72', borderRadius: 3, marginLeft: 12 }} /> Reserved
          </div>
        </>
      ) : (
        <div style={{ marginTop: 16 }}>
          {tables.length === 0 ? (
            <div className="fd-empty">No tables yet. Click "Add Table" to create one.</div>
          ) : (
            <table className="fd-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Capacity</th>
                  <th>Status</th>
                  <th>Floor</th>
                  <th>Active</th>
                  {canWrite && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {tables.map((t) => {
                  const tid = t.id || t.Id
                  const floor = floors.find((f) => (f.id || f.Id) === t.FloorId)
                  return (
                    <tr key={tid}>
                      <td>{t.Name}</td>
                      <td>{t.Capacity ?? '—'}</td>
                      <td>{statusLabel(t.Status)}</td>
                      <td>{floor?.Name || t.FloorId || '—'}</td>
                      <td>
                        <span className={`fd-badge ${t.Active ? 'fd-badge-active' : 'fd-badge-closed'}`}>
                          {t.Active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      {canWrite && (
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-secondary" style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => handleEdit(t)}>Edit</button>
                            <button className="btn btn-danger"    style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => handleDelete(t)}>Delete</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      <FormModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditRecord(null) }}
        title={editRecord ? 'Edit Table' : 'Create Table'}
        fields={tableFields}
        initialData={editRecord}
        onSubmit={handleSubmit}
        loading={formLoading}
      />

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDelTarget(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Table"
        message="Are you sure you want to delete this table? This action cannot be undone."
        confirmText="Delete"
        type="danger"
        loading={deleteLoading}
      />

      {detailTable && (
        <div className="fd-modal-overlay" onClick={() => setDetailTableId(null)}>
          <div className="fd-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fd-modal-header">
              <h3>
                🪑 {detailTable.Name || detailTable.name}
                {detailTable.Status ? ` (${statusLabel(detailTable.Status)})` : ''}
              </h3>
              <button className="fd-modal-close" onClick={() => setDetailTableId(null)}>✕</button>
            </div>
            <RoundsTimeline
              rounds={detailRounds}
              emptyMessage="This table has no active orders."
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default Tables
