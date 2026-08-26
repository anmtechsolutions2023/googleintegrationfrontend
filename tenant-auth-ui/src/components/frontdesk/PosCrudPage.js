import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { toast } from 'react-toastify'
import { useAuth } from '../../context/AuthContext'
import { hasScope } from '../../utils/permissions'
import { SCOPES, APP_CONFIG } from '../../constants'
import DataTable from '../MasterData/DataTable'
import FormModal from '../MasterData/FormModal'
import ConfirmDialog from '../MasterData/ConfirmDialog'
import { genericGet, genericPost, genericPut, genericDelete } from '../../services/posService'
import crudService from '../../services/crudService'
import { MODULES } from '../../config/modules'
import { POS_MODULES } from '../../config/posModules'
import './frontdesk.css'

// Resolve a reference id to a human label using loaded reference data.
// Mirrors the fallback chain used by FormModal's <select> options so the
// read-only list and the edit form stay consistent.
const referenceLabel = (id, options, reference) => {
  if (id === null || id === undefined || id === '') return id
  const opt = (options || []).find((o) => (o.id || o.Id) === id)
  if (!opt) return id
  const displayField = (MODULES[reference] || POS_MODULES[reference])?.displayField
  if (displayField && opt[displayField] !== undefined && opt[displayField] !== null) {
    return opt[displayField]
  }
  return (
    opt.DisplayLabel || opt.name || opt.Name || opt.Type || opt.Title || opt.title ||
    opt.UnitName || opt.BranchName || opt.ProviderName || opt.FirstName ||
    opt.Amount || opt.id || opt.Id || id
  )
}

const SYSTEM_FIELDS = [
  'Id', 'id', 'TenantId', 'tenantId',
  'CreatedAt', 'UpdatedAt', 'CreatedOn', 'UpdatedOn',
  'createdAt', 'updatedAt', 'createdOn', 'updatedOn',
  'CreatedBy', 'UpdatedBy', 'createdBy', 'updatedBy',
  'DeletedAt', 'deletedAt', 'DeletedBy', 'deletedBy',
  // Read-only expansion fields returned by GET's joins. An edit form is seeded
  // from a GET response, so without this they would be echoed back and rejected
  // as unknown keys by the write schemas.
  'CostInfoAmount', 'FoodTypeName', 'FoodTypeIsVeg',
  // Computed live by the pricing enricher on every read, never stored.
  'TaxBreakdown',
]

const stripSystemFields = (data) => {
  const cleaned = {}
  Object.keys(data).forEach((key) => {
    if (!SYSTEM_FIELDS.includes(key)) cleaned[key] = data[key]
  })
  return cleaned
}

const toArray = (res) => {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.message)) return res.message
  if (Array.isArray(res?.pagination)) return res.pagination
  return []
}

const PAGE_SIZE = APP_CONFIG.PAGINATION.DEFAULT_LIMIT

// `onView` is optional and passed straight through: a module that has a richer
// read view (a customer profile, say) opts in, and every other module renders
// exactly as before.
const PosCrudPage = ({ moduleConfig, writeScopes, onView }) => {
  const { user } = useAuth()
  const canWrite = hasScope(user, writeScopes || [SCOPES.TENANT_ADMIN])

  const [allItems, setAllItems]         = useState([])
  const [loading, setLoading]           = useState(false)
  const [searchQuery, setSearch]        = useState('')
  const [sortConfig, setSortConfig]     = useState({ key: null, direction: 'asc' })
  const [currentPage, setCurrentPage]   = useState(1)

  const [modalOpen, setModalOpen]       = useState(false)
  const [editRecord, setEditRecord]     = useState(null)
  const [formLoading, setFormLoading]   = useState(false)

  const [deleteTarget, setDelTarget]      = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const [referenceData, setReferenceData] = useState({})

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const raw = await genericGet(moduleConfig.endpoint, { limit: APP_CONFIG.PAGINATION.MAX_LIMIT })
      setAllItems(toArray(raw))
    } catch {
      toast.error(`Failed to load ${moduleConfig.name}`)
    } finally {
      setLoading(false)
    }
  }, [moduleConfig.endpoint, moduleConfig.name])

  useEffect(() => { fetchData() }, [fetchData])

  // Hydrate dropdown options for any `select` field that points at a
  // master-data reference module (e.g. Menu Item → itemDetails).
  useEffect(() => {
    const refs = [...new Set(
      (moduleConfig.fields || [])
        // `derived` fields read their value out of a reference row too, so their
        // reference must be loaded even when no <select> points at it.
        .map((f) => (f.type === 'derived' ? f.derive?.reference : (f.type === 'select' || f.type === 'multiselect') && f.reference))
        .filter(Boolean)
    )]
    if (refs.length === 0) return
    let cancelled = false
    ;(async () => {
      const entries = await Promise.all(refs.map(async (ref) => {
        try { return [ref, await crudService.getReferenceData(ref)] }
        catch { return [ref, []] }
      }))
      if (!cancelled) setReferenceData(Object.fromEntries(entries))
    })()
    return () => { cancelled = true }
  }, [moduleConfig.fields])

  // Client-side filter
  const filteredData = useMemo(() => {
    if (!searchQuery) return allItems
    const q = searchQuery.toLowerCase()
    return allItems.filter((item) =>
      (moduleConfig.searchFields || []).some((f) =>
        String(item[f] ?? '').toLowerCase().includes(q)
      ) || Object.values(item).some((v) => String(v ?? '').toLowerCase().includes(q))
    )
  }, [allItems, searchQuery, moduleConfig.searchFields])

  // Client-side sort
  const sortedData = useMemo(() => {
    if (!sortConfig.key) return filteredData
    return [...filteredData].sort((a, b) => {
      const av = a[sortConfig.key]; const bv = b[sortConfig.key]
      if (av == null && bv == null) return 0
      if (av == null) return sortConfig.direction === 'asc' ? 1 : -1
      if (bv == null) return sortConfig.direction === 'asc' ? -1 : 1
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), undefined, { numeric: true })
      return sortConfig.direction === 'asc' ? cmp : -cmp
    })
  }, [filteredData, sortConfig])

  // Paginated slice
  const pagedData = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return sortedData.slice(start, start + PAGE_SIZE)
  }, [sortedData, currentPage])

  const pagination = useMemo(() => ({
    page: currentPage,
    pageSize: PAGE_SIZE,
    total: sortedData.length,
  }), [currentPage, sortedData.length])

  // Convert string column names → DataTable {key, label} objects. Columns whose
  // field is a reference (single or multi select) get a render() that resolves
  // stored ids into labels instead of showing raw GUIDs.
  const columns = useMemo(() =>
    (moduleConfig.tableColumns || []).map((col) => {
      const fieldDef = (moduleConfig.fields || []).find((f) => f.name === col)
      const column = { key: col, label: fieldDef?.label || col }
      if (fieldDef?.reference) {
        const options = referenceData[fieldDef.reference]
        column.render = (value) => {
          if (Array.isArray(value)) {
            if (value.length === 0) return '—'
            return value.map((v) => referenceLabel(v, options, fieldDef.reference)).join(', ')
          }
          return referenceLabel(value, options, fieldDef.reference)
        }
      }
      return column
    }),
    [moduleConfig.tableColumns, moduleConfig.fields, referenceData]
  )

  const handleCreate   = () => { setEditRecord(null); setModalOpen(true) }
  const handleEdit     = (record) => { setEditRecord(record); setModalOpen(true) }
  const handleDelete   = (record) => setDelTarget(record)
  const handleFormClose = () => { setModalOpen(false); setEditRecord(null) }

  const handleSearch = (e) => {
    setSearch(e.target.value)
    setCurrentPage(1)
  }

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  // Convert any `json`-typed field from its textarea string into a real
  // object/array so the API (Joi object|array) accepts it. Returns null on
  // invalid JSON after surfacing a toast.
  const parseJsonFields = (payload) => {
    const jsonFields = (moduleConfig.fields || []).filter((f) => f.type === 'json')
    for (const field of jsonFields) {
      const raw = payload[field.name]
      if (raw === undefined || raw === null || raw === '') {
        // Empty → fall back to the field default (e.g. [] or {}) when required.
        payload[field.name] = field.default !== undefined ? JSON.parse(field.default) : raw
        continue
      }
      if (typeof raw !== 'string') continue // already an object/array (unchanged on edit)
      try {
        payload[field.name] = JSON.parse(raw)
      } catch {
        toast.error(`${field.label || field.name} must be valid JSON`)
        return null
      }
    }
    return payload
  }

  // A `derived` field mirrors a value owned by another record. Drop the column
  // it stands in for so the server resolves it from the source of truth — on
  // edit the form still holds the OLD id, which would otherwise pin the stale
  // value even after the user picks a different source record.
  const stripDerivedTargets = (payload) => {
    (moduleConfig.fields || [])
      .filter((f) => f.type === 'derived' && f.derive?.owns)
      .forEach((f) => { delete payload[f.derive.owns] })
    return payload
  }

  const handleSubmit = async (formData) => {
    const payload = parseJsonFields(stripDerivedTargets(stripSystemFields(formData)))
    if (!payload) return
    setFormLoading(true)
    try {
      if (editRecord) {
        const id = editRecord.id || editRecord.Id
        await genericPut(`${moduleConfig.endpoint}/${id}`, payload)
        toast.success(`${moduleConfig.name} updated`)
      } else {
        await genericPost(moduleConfig.endpoint, payload)
        toast.success(`${moduleConfig.name} created`)
      }
      handleFormClose()
      fetchData()
    } catch (err) {
      toast.error(err?.response?.data?.message || `Failed to save ${moduleConfig.name}`)
    } finally {
      setFormLoading(false)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    setDeleteLoading(true)
    try {
      const id = deleteTarget.id || deleteTarget.Id
      await genericDelete(`${moduleConfig.endpoint}/${id}`)
      toast.success(`${moduleConfig.name} deleted`)
      setDelTarget(null)
      fetchData()
    } catch {
      toast.error(`Failed to delete ${moduleConfig.name}`)
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <div className="fd-crud-page">
      <div className="content-header">
        <h1>{moduleConfig.icon} {moduleConfig.name}</h1>
        <div className="content-header-actions">
          {canWrite && (
            <button className="btn btn-primary" onClick={handleCreate}>
              ➕ Add {moduleConfig.name}
            </button>
          )}
        </div>
      </div>

      <div className="filter-bar">
        <input
          type="text"
          className="search-input"
          placeholder={`Search ${moduleConfig.name.toLowerCase()}...`}
          value={searchQuery}
          onChange={handleSearch}
        />
        <button className="btn btn-secondary" onClick={fetchData} disabled={loading}>
          🔄 Refresh
        </button>
      </div>

      <DataTable
        columns={columns}
        data={pagedData}
        loading={loading}
        onView={onView}
        onEdit={canWrite ? handleEdit : undefined}
        onDelete={canWrite ? handleDelete : undefined}
        pagination={pagination}
        onPageChange={setCurrentPage}
        sortConfig={sortConfig}
        onSort={handleSort}
        emptyMessage={`No ${moduleConfig.name.toLowerCase()} found. Click "Add ${moduleConfig.name}" to create one.`}
      />

      <FormModal
        isOpen={modalOpen}
        onClose={handleFormClose}
        title={editRecord ? `Edit ${moduleConfig.name}` : `Create ${moduleConfig.name}`}
        fields={moduleConfig.fields}
        initialData={editRecord}
        referenceData={referenceData}
        onSubmit={handleSubmit}
        loading={formLoading}
      />

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDelTarget(null)}
        onConfirm={handleDeleteConfirm}
        title={`Delete ${moduleConfig.name}`}
        message={`Are you sure you want to delete this ${moduleConfig.name.toLowerCase()}? This action cannot be undone.`}
        confirmText="Delete"
        type="danger"
        loading={deleteLoading}
      />
    </div>
  )
}

export default PosCrudPage
