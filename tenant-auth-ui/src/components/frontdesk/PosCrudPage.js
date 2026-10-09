import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
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
  // from a GET response, so without this they would be echoed back to the API.
  //
  // No longer load-bearing: the write schemas now derive their own tolerance
  // from the module's SELECT (backend utils/joinedEchoes), so a joined column
  // that reaches a PUT is accepted and dropped rather than refusing the save.
  // Keeping the list only trims the payload — do NOT extend it when a join is
  // added, which is the maintenance this list used to demand and never got.
  'CostInfoAmount', 'FoodTypeName', 'FoodTypeIsVeg',
  // Computed live by the pricing enricher on every read, never stored.
  'TaxBreakdown',
  // Computed IN THE FORM, not by the server — so unlike the joined columns
  // above, no write schema has ever heard of it and none should. The only
  // entry here that is still load-bearing.
  'EffectiveTags',
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
//
// `filterPanel` is optional too: a component given every loaded row as `items`
// and an `onFilter(rows, key)` callback. It replaces the plain search box for a
// module that needs richer filters (Menu Master's category, diet and tags). The
// list then shows the rows it hands back; `key` names the filter state, so the
// page resets to 1 when the filters change but not when the data merely reloads.
//
// `bulkBar` and `leadingColumns` add row selection. `bulkBar` is a component
// given `api` (selection, visible rows, refresh, patchRows); `leadingColumns(api)`
// returns columns drawn before the configured ones. Selection is offered only
// to someone who can write.
//
// `headerActions` is optional: extra buttons drawn beside Add (an Export
// button, say). Absent, the header is exactly as before.
const idOf = (row) => row?.id || row?.Id

const PosCrudPage = ({
  moduleConfig, writeScopes, onView, filterPanel: FilterPanel = null,
  bulkBar: BulkBar = null, leadingColumns = null, headerActions = null,
}) => {
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

  // Selected row ids, for a module with a bulk bar.
  const [selectedIds, setSelectedIds] = useState([])

  // What the filter panel currently lets through; null until it has spoken.
  const [panelItems, setPanelItems] = useState(null)
  const panelKey = useRef('')
  const handlePanelFilter = useCallback((rows, key = '') => {
    if (panelKey.current !== key) {
      panelKey.current = key
      setCurrentPage(1)
    }
    setPanelItems(rows)
  }, [])

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

  // A row deleted or gone after a reload cannot stay selected.
  useEffect(() => {
    setSelectedIds((prev) => {
      const present = new Set(allItems.map(idOf))
      const next = prev.filter((id) => present.has(id))
      return next.length === prev.length ? prev : next
    })
  }, [allItems])

  // Apply a saved change to rows already loaded, without a full reload.
  const patchRows = useCallback((ids, patch) => {
    setAllItems((prev) => prev.map((r) => (ids.includes(idOf(r)) ? { ...r, ...patch } : r)))
  }, [])

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
    const source = FilterPanel && panelItems ? panelItems : allItems
    if (!searchQuery) return source
    const q = searchQuery.toLowerCase()
    return source.filter((item) =>
      (moduleConfig.searchFields || []).some((f) =>
        String(item[f] ?? '').toLowerCase().includes(q)
      ) || Object.values(item).some((v) => String(v ?? '').toLowerCase().includes(q))
    )
  }, [allItems, panelItems, FilterPanel, searchQuery, moduleConfig.searchFields])

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
      // A column given as { key, label, render } is used as it is — for values
      // that are computed or joined rather than a field on the form.
      if (col && typeof col === 'object') return col
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

  const api = {
    canWrite,
    selectedIds,
    selectedRows: allItems.filter((r) => selectedIds.includes(idOf(r))),
    visibleRows: sortedData,
    setSelectedIds,
    clearSelection: () => setSelectedIds([]),
    refresh: fetchData,
    patchRows,
    referenceData,
  }

  const selection = BulkBar && canWrite ? {
    isSelected: (row) => selectedIds.includes(idOf(row)),
    onToggle: (row) => setSelectedIds((prev) => (
      prev.includes(idOf(row)) ? prev.filter((x) => x !== idOf(row)) : [...prev, idOf(row)]
    )),
    onTogglePage: (rows, checked) => setSelectedIds((prev) => {
      const ids = rows.map(idOf)
      return checked ? [...new Set([...prev, ...ids])] : prev.filter((x) => !ids.includes(x))
    }),
    labelOf: (row) => (moduleConfig.selectionLabel
      ? moduleConfig.selectionLabel(row)
      : String(row?.[moduleConfig.displayField] ?? idOf(row))),
  } : null

  const tableColumns = leadingColumns ? [...leadingColumns(api), ...columns] : columns

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
      // The row is gone: drop it locally rather than reloading the whole list.
      // (A save still reloads — the server adds joined names the form lacks.)
      setAllItems((prev) => prev.filter((r) => idOf(r) !== id))
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
          {headerActions}
          {/* With a filter panel the plain search bar goes, so Refresh moves up here. */}
          {FilterPanel && (
            <button className="btn btn-secondary" onClick={fetchData} disabled={loading}>
              🔄 Refresh
            </button>
          )}
          {canWrite && (
            <button className="btn btn-primary" onClick={handleCreate}>
              ➕ Add {moduleConfig.name}
            </button>
          )}
        </div>
      </div>

      {FilterPanel && <FilterPanel items={allItems} onFilter={handlePanelFilter} />}

      {!FilterPanel && (
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
      )}

      {BulkBar && canWrite && <BulkBar api={api} />}

      <DataTable
        columns={tableColumns}
        selection={selection}
        data={pagedData}
        loading={loading}
        onView={onView}
        onEdit={canWrite ? handleEdit : undefined}
        onDelete={canWrite ? handleDelete : undefined}
        pagination={pagination}
        onPageChange={setCurrentPage}
        sortConfig={sortConfig}
        onSort={handleSort}
        emptyMessage={FilterPanel && allItems.length > 0 && filteredData.length === 0
          ? 'Nothing matches these filters.'
          : `No ${moduleConfig.name.toLowerCase()} found. Click "Add ${moduleConfig.name}" to create one.`}
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
