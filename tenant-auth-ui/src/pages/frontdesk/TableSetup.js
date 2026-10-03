import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'react-toastify'
import posService from '../../services/posService'
import { useAuth } from '../../context/AuthContext'
import { hasScope } from '../../utils/permissions'
import { SCOPES } from '../../constants'
import FormModal from '../../components/MasterData/FormModal'
import ConfirmDialog from '../../components/MasterData/ConfirmDialog'
import { TABLE_STATUSES, statusLabel } from '../../utils/posStatus'

// Creating, editing and deleting tables lives here, beside Floors, so a floor
// and its tables are set up in one place. Service → Floor → Tables only shows
// live occupancy.

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

const idOf = (r) => r.id || r.Id

const TableSetup = () => {
  const { user } = useAuth()
  const canWrite = hasScope(user, [SCOPES.POS_CONFIG_WRITE, SCOPES.TENANT_ADMIN])

  const [floors, setFloors]   = useState([])
  const [tables, setTables]   = useState([])
  const [activeFloor, setActiveFloor] = useState(null) // null = all floors
  const [loading, setLoading] = useState(true)

  const [modalOpen, setModalOpen]     = useState(false)
  const [editRecord, setEditRecord]   = useState(null)
  const [formLoading, setFormLoading] = useState(false)
  const [deleteTarget, setDelTarget]  = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Floor dropdown built from loaded floors; a new table defaults to the floor
  // being viewed, so adding several tables to one floor is one click each.
  const tableFields = useMemo(() => {
    const floorField = {
      name: 'FloorId', label: 'Floor', type: 'select', required: true,
      default: activeFloor || (floors[0] && idOf(floors[0])) || '',
      options: floors.map((f) => ({ value: idOf(f), label: f.Name || f.name })),
    }
    return [TABLE_FIELDS[0], floorField, ...TABLE_FIELDS.slice(1)]
  }, [floors, activeFloor])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [f, t] = await Promise.all([posService.getFloors(), posService.getTables()])
      setFloors(f || [])
      setTables(t || [])
    } catch {
      toast.error('Failed to load floors and tables')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const visibleTables = activeFloor
    ? tables.filter((t) => t.FloorId === activeFloor)
    : tables

  const handleCreate = () => { setEditRecord(null); setModalOpen(true) }
  const handleEdit   = (record) => { setEditRecord(record); setModalOpen(true) }

  const handleSubmit = async (formData) => {
    setFormLoading(true)
    try {
      const payload = stripSystemFields(formData)
      if (editRecord) {
        await posService.updateTable(idOf(editRecord), payload)
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
      await posService.deleteTable(idOf(deleteTarget))
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
        <div className="content-header-actions" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {canWrite && floors.length > 0 && (
            <button className="btn btn-primary" onClick={handleCreate}>
              ➕ Add Table
            </button>
          )}
          <button className="btn btn-secondary" onClick={load}>🔄 Refresh</button>
        </div>
      </div>

      {floors.length === 0 ? (
        <div className="fd-empty">Add a floor in the Floors tab first, then add its tables here.</div>
      ) : (
        <>
          <div className="fd-floor-tabs">
            <button
              className={`fd-floor-tab ${!activeFloor ? 'active' : ''}`}
              onClick={() => setActiveFloor(null)}
            >
              All Floors ({tables.length})
            </button>
            {floors.map((f) => {
              const fid = idOf(f)
              const count = tables.filter((t) => t.FloorId === fid).length
              return (
                <button
                  key={fid}
                  className={`fd-floor-tab ${activeFloor === fid ? 'active' : ''}`}
                  onClick={() => setActiveFloor(fid)}
                >
                  {f.Name || f.name} ({count})
                </button>
              )
            })}
          </div>

          {visibleTables.length === 0 ? (
            <div className="fd-empty">
              No tables on this floor yet.{canWrite ? ' Click "Add Table" to create one.' : ''}
            </div>
          ) : (
            <div className="fd-table-scroll">
              <table className="fd-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Floor</th>
                    <th>Capacity</th>
                    <th>Status</th>
                    <th>Active</th>
                    {canWrite && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {visibleTables.map((t) => {
                    const floor = floors.find((f) => idOf(f) === t.FloorId)
                    return (
                      <tr key={idOf(t)}>
                        <td>{t.Name}</td>
                        <td>{floor?.Name || t.FloorId || '—'}</td>
                        <td>{t.Capacity ?? '—'}</td>
                        <td>{statusLabel(t.Status)}</td>
                        <td>
                          <span className={`fd-badge ${t.Active ? 'fd-badge-active' : 'fd-badge-closed'}`}>
                            {t.Active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        {canWrite && (
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="btn btn-secondary" style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => handleEdit(t)}>Edit</button>
                              <button className="btn btn-danger"    style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => setDelTarget(t)}>Delete</button>
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
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
    </div>
  )
}

export default TableSetup
