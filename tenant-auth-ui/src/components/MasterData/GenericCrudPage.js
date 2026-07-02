import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { MODULES } from '../../config/modules'
import crudService from '../../services/crudService'
import { MESSAGES, STRINGS, APP_CONFIG } from '../../constants'
import DataTable from './DataTable'
import FormModal from './FormModal'
import ConfirmDialog from './ConfirmDialog'
import { useAuth } from '../../context/AuthContext'
import { hasScope, CATEGORY_READ_SCOPE, CATEGORY_WRITE_SCOPE } from '../../utils/permissions'
import './MasterData.css'

const { DEFAULT_PAGE, DEFAULT_LIMIT } = APP_CONFIG.PAGINATION

// System fields that should never be sent to the API
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

// Apply display label transformations for a reference module's items.
// Sets DisplayLabel, Name, and name on each item for consistent dropdown rendering.
const applyDisplayLabel = (refKey, items) => {
  if (!Array.isArray(items) || items.length === 0) return items
  const wrap = (it, label) => ({ ...it, DisplayLabel: label, Name: label, name: label })
  const setDF = () => { if (MODULES[refKey]) MODULES[refKey].displayField = 'DisplayLabel' }

  if (refKey === 'mapProviderLocationMappers') {
    setDF()
    return items.map((m) => wrap(m, m.TagName || m.tagName || m.Tag || ''))
  }
  if (refKey === 'addressDetails') {
    setDF()
    return items.map((a) =>
      wrap(a, a.TagName || a.tagName || a.Tag || a.tag || a.Name || a.name || ''),
    )
  }
  if (refKey === 'branchDetails') {
    setDF()
    return items.map((b) => wrap(b, b.BranchName || b.Branch || b.Name || b.name || ''))
  }
  if (refKey === 'transactionTypeConfigs') {
    setDF()
    return items.map((tx) =>
      wrap(tx, tx.TagName || tx.tagName || tx.Tag || tx.name || tx.Name || ''),
    )
  }
  if (refKey === 'transactionTypeBaseConversions') {
    setDF()
    return items.map((tx) => wrap(tx, tx.tag || tx.Tag || ''))
  }
  if (refKey === 'paymentModes') {
    setDF()
    return items.map((p) => wrap(p, p.Type || p.type || p.Name || p.name || ''))
  }
  if (refKey === 'paymentReceivedTypes') {
    setDF()
    return items.map((p) => wrap(p, p.Type || p.type || p.Name || p.name || ''))
  }
  if (refKey === 'accountTypeBases') {
    setDF()
    return items.map((a) => wrap(a, a.Name || a.name || ''))
  }
  if (refKey === 'transactionDetailLogs') {
    setDF()
    return items.map((tx) => wrap(tx, tx.TransactionNo || tx.transactionNo || ''))
  }
  if (refKey === 'paymentModeTransactionDetails') {
    setDF()
    return items.map((p) => wrap(p, p.RefNo || p.refNo || p.Name || p.name || ''))
  }
  if (refKey === 'paymentDetails') {
    setDF()
    return items.map((p) => {
      const txNo = p.TransactionNo || p.transactionNo || ''
      const gross = p.GrossAmount || p.grossAmount || ''
      const label = txNo && gross ? `${txNo}-${gross}` : txNo || gross || p.id || p.Id || ''
      return wrap(p, label)
    })
  }

  // Generic fallback: use module's declared displayField
  const df = MODULES[refKey]?.displayField
  if (df && df !== 'DisplayLabel') {
    if (MODULES[refKey]) MODULES[refKey].displayField = 'DisplayLabel'
    return items.map((it) => {
      const label =
        it[df] ||
        (typeof df === 'string' && it[df.toLowerCase()]) ||
        it.Name ||
        it.name ||
        it.DisplayLabel ||
        ''
      return wrap(it, label)
    })
  }

  return items
}

// Fetch tax groups and stamp Amount-TaxGroupName DisplayLabel onto each costInfo item.
// Used by both the initial reference load and the post-quick-create refresh so the
// dropdown always shows human-readable labels rather than raw IDs.
const buildCostInfoLabels = async (items) => {
  if (!items || !items.length) return items
  try {
    const taxResp = await crudService.getReferenceData('taxGroups')
    let taxItems = []
    if (Array.isArray(taxResp)) taxItems = taxResp
    else if (Array.isArray(taxResp?.data)) taxItems = taxResp.data
    else if (Array.isArray(taxResp?.message)) taxItems = taxResp.message
    const taxMap = {}
    taxItems.forEach((tx) => {
      const id = tx.id || tx.Id
      taxMap[id] = tx.Name || tx.name || tx.TaxGroupName || tx.Title || tx.title
    })
    const labeled = items.map((ci) => {
      const taxName = taxMap[ci.TaxGroupId] || ci.TaxGroupId || ''
      const amount = ci.Amount !== undefined ? ci.Amount : ''
      const label = `${amount}-${taxName}`
      return { ...ci, DisplayLabel: label, Name: label, name: label }
    })
    if (MODULES.costInfos) MODULES.costInfos.displayField = 'DisplayLabel'
    return labeled
  } catch (e) {
    console.warn('Failed to load tax groups for costInfos display label', e)
    return items
  }
}

/**
 * GenericCrudPage Component
 * A dynamic page that renders CRUD operations for any module
 * Based on the moduleKey from URL params
 */
const GenericCrudPage = () => {
  const { moduleKey } = useParams()
  const navigate = useNavigate()

  const module = useMemo(() => MODULES[moduleKey], [moduleKey])

  const { user } = useAuth()
  const readScope = module ? CATEGORY_READ_SCOPE[module.category] : undefined
  const writeScope = module ? CATEGORY_WRITE_SCOPE[module.category] : undefined
  const hasRead = !readScope || hasScope(user, [readScope])
  const hasWrite = !writeScope || hasScope(user, [writeScope])

  // Main list state
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' })
  const [pagination, setPagination] = useState({
    page: DEFAULT_PAGE,
    pageSize: DEFAULT_LIMIT,
    total: 0,
  })

  // Main form modal state
  const [formModalOpen, setFormModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [formLoading, setFormLoading] = useState(false)

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingItem, setDeletingItem] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Reference data for main form dropdowns
  const [referenceData, setReferenceData] = useState({})

  // Quick-create: which field/module triggered it
  const [quickCreate, setQuickCreate] = useState({ isOpen: false, fieldName: '', moduleKey: '' })
  const [quickCreateLoading, setQuickCreateLoading] = useState(false)
  const [quickCreateRefData, setQuickCreateRefData] = useState({})
  // After a successful quick-create, push the new ID into the parent form field
  const [pendingFieldUpdate, setPendingFieldUpdate] = useState(null)

  const referenceModules = useMemo(() => {
    if (!module?.fields) return []
    const refs = new Set()
    module.fields.forEach((field) => {
      if (field.type === 'select' && field.reference) refs.add(field.reference)
    })
    return Array.from(refs)
  }, [module])

  useEffect(() => {
    if (!module) navigate('/master', { replace: true })
  }, [module, navigate])

  useEffect(() => {
    const container = document.querySelector('.master-content')
    if (container) {
      try {
        container.scrollTo({ top: 0, behavior: 'smooth' })
      } catch (e) {
        container.scrollTop = 0
      }
    }
  }, [moduleKey])

  const fetchData = useCallback(async () => {
    if (!module) return
    setLoading(true)
    try {
      const response = await crudService.getAll(moduleKey, {
        page: pagination.page,
        limit: pagination.pageSize,
      })

      let items = []
      let totalRecords = 0

      if (response.success !== undefined) {
        if (Array.isArray(response.message)) {
          items = response.message
          totalRecords = response.data?.total || items.length
        } else if (Array.isArray(response.data)) {
          items = response.data
          totalRecords = response.pagination?.total || items.length
        } else if (Array.isArray(response.pagination)) {
          // Some endpoints return records in `pagination` and metadata in `message`
          items = response.pagination
          totalRecords = response.message?.total || items.length
        }
      } else if (Array.isArray(response.data)) {
        items = response.data
        totalRecords = response.total || response.pagination?.total || items.length
      } else if (response.data?.items) {
        items = response.data.items
        totalRecords = response.data.total || items.length
      } else if (Array.isArray(response)) {
        items = response
        totalRecords = items.length
      }

      try {
        if (moduleKey === 'branchDetails' && Array.isArray(items)) {
          setData(
            items.map((it) => ({
              ...it,
              BranchName: it.BranchName || it.Name || it.Branch || '',
              OrganizationDetailId:
                it.OrganizationDetailId || it.OrganizationId || it.Organization || null,
            })),
          )
        } else if (moduleKey === 'batchDetails' && Array.isArray(items)) {
          setData(
            items.map((it) => ({
              ...it,
              BatchNo: it.BatchNo || it.BatchNumber || it.Batch || '',
              Barcode: it.Barcode || it.barcode || '',
              MfgDate: parseDateToInput(it.MfgDate || it.ManufacturedDate || it.ManufactureDate || ''),
              Expdate: parseDateToInput(it.Expdate || it.ExpiryDate || it.ExpireDate || ''),
              PurchaseDate: parseDateToInput(it.PurchaseDate || it.Purchase_Date || ''),
            })),
          )
        } else {
          setData(items)
        }
      } catch (e) {
        setData(items)
      }

      setPagination((prev) => ({ ...prev, total: totalRecords }))
    } catch (error) {
      console.error('Error fetching data:', error)
      toast.error(MESSAGES.error.FETCH_FAILED || 'Failed to load data')
      setData([])
    } finally {
      setLoading(false)
    }
  }, [moduleKey, module, pagination.page, pagination.pageSize])

  const parseDateToInput = (v) => {
    if (!v && v !== 0) return ''
    if (typeof v === 'string') {
      const s = v.trim()
      const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
      if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`
      const dmyMatch = s.match(/^(\d{2})-(\d{2})-(\d{4})$/)
      if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`
      const parsed = new Date(s)
      if (!isNaN(parsed)) {
        const yyyy = parsed.getFullYear()
        const mm = String(parsed.getMonth() + 1).padStart(2, '0')
        const dd = String(parsed.getDate()).padStart(2, '0')
        return `${yyyy}-${mm}-${dd}`
      }
      return ''
    }
    try {
      const d = new Date(v)
      if (isNaN(d)) return ''
      const yyyy = d.getFullYear()
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      return `${yyyy}-${mm}-${dd}`
    } catch (e) {
      return ''
    }
  }

  const formatDateToApi = (v) => {
    if (!v && v !== 0) return ''
    if (typeof v === 'string') {
      const s = v.trim()
      if (/^\d{2}-\d{2}-\d{4}$/.test(s)) return s
      const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
      if (isoMatch) return `${isoMatch[3]}-${isoMatch[2]}-${isoMatch[1]}`
      const parsed = new Date(s)
      if (!isNaN(parsed)) {
        const yyyy = parsed.getFullYear()
        const mm = String(parsed.getMonth() + 1).padStart(2, '0')
        const dd = String(parsed.getDate()).padStart(2, '0')
        return `${dd}-${mm}-${yyyy}`
      }
      return s
    }
    try {
      const d = new Date(v)
      if (isNaN(d)) return ''
      const yyyy = d.getFullYear()
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      return `${dd}-${mm}-${yyyy}`
    } catch (e) {
      return ''
    }
  }

  const fetchReferenceData = useCallback(async () => {
    if (referenceModules.length === 0) return
    try {
      const refData = {}
      await Promise.all(
        referenceModules.map(async (refModuleKey) => {
          try {
            const response = await crudService.getReferenceData(refModuleKey)
            let items = []
            if (Array.isArray(response)) items = response
            else if (Array.isArray(response?.message)) items = response.message
            else if (Array.isArray(response?.data)) items = response.data
            else if (response?.items) items = response.items
            else if (response?.data?.items) items = response.data.items
            refData[refModuleKey] = items
          } catch (err) {
            console.warn(`Failed to load reference data for ${refModuleKey}:`, err)
            refData[refModuleKey] = []
          }
        }),
      )

      // costInfos needs a secondary taxGroups fetch to build Amount-TaxGroupName labels
      if (refData.costInfos && refData.costInfos.length) {
        refData.costInfos = await buildCostInfoLabels(refData.costInfos)
      }

      // Apply display labels for all other modules via the shared helper
      referenceModules.forEach((refKey) => {
        if (refKey !== 'costInfos') {
          refData[refKey] = applyDisplayLabel(refKey, refData[refKey] || [])
        }
      })

      setReferenceData(refData)
    } catch (error) {
      console.error('Error fetching reference data:', error)
    }
  }, [referenceModules])

  // When the quick-create modal opens, fetch reference data for its own select fields
  useEffect(() => {
    if (!quickCreate.isOpen || !quickCreate.moduleKey) {
      setQuickCreateRefData({})
      return
    }
    const qcModule = MODULES[quickCreate.moduleKey]
    const qcRefs = new Set(
      (qcModule?.fields || [])
        .filter((f) => f.type === 'select' && f.reference)
        .map((f) => f.reference),
    )
    if (qcRefs.size === 0) return

    const fetchQcRefs = async () => {
      const newRefData = {}
      await Promise.all(
        Array.from(qcRefs).map(async (refKey) => {
          try {
            const resp = await crudService.getReferenceData(refKey)
            let items = []
            if (Array.isArray(resp)) items = resp
            else if (Array.isArray(resp?.message)) items = resp.message
            else if (Array.isArray(resp?.data)) items = resp.data
            newRefData[refKey] = applyDisplayLabel(refKey, items)
          } catch (e) {
            newRefData[refKey] = []
          }
        }),
      )
      setQuickCreateRefData(newRefData)
    }
    fetchQcRefs()
  }, [quickCreate.isOpen, quickCreate.moduleKey])

  useEffect(() => {
    if (module) {
      fetchData()
      fetchReferenceData()
    }
  }, [module, fetchData, fetchReferenceData])

  // Re-fetch a single reference module and merge into referenceData
  const refreshSingleReference = useCallback(async (refModuleKey) => {
    try {
      const response = await crudService.getReferenceData(refModuleKey)
      let items = []
      if (Array.isArray(response)) items = response
      else if (Array.isArray(response?.message)) items = response.message
      else if (Array.isArray(response?.data)) items = response.data
      else if (response?.items) items = response.items
      // costInfos requires an extra tax-group fetch to build Amount-TaxGroupName labels
      if (refModuleKey === 'costInfos') {
        items = await buildCostInfoLabels(items)
      } else {
        items = applyDisplayLabel(refModuleKey, items)
      }
      setReferenceData((prev) => ({ ...prev, [refModuleKey]: items }))
      return items
    } catch (err) {
      console.warn(`Failed to refresh reference data for ${refModuleKey}:`, err)
      return []
    }
  }, [])

  const handleSearch = (e) => setSearchQuery(e.target.value)
  const handlePageChange = (newPage) => setPagination((prev) => ({ ...prev, page: newPage }))
  const handleSort = (columnKey) => {
    setSortConfig((prev) => ({
      key: columnKey,
      direction: prev.key === columnKey && prev.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  const handleCreate = () => {
    setEditingItem(null)
    setFormModalOpen(true)
  }

  const handleEdit = (item) => {
    try {
      const normalized = { ...item }
      const dateFields = module?.fields
        ? module.fields.filter((f) => f.type === 'date').map((f) => f.name)
        : []
      dateFields.forEach((df) => {
        if (normalized[df] !== undefined && normalized[df] !== null && normalized[df] !== '') {
          normalized[df] = parseDateToInput(normalized[df])
        }
      })
      const datetimeFields = module?.fields
        ? module.fields.filter((f) => f.type === 'datetime').map((f) => f.name)
        : []
      datetimeFields.forEach((df) => {
        if (normalized[df] !== undefined && normalized[df] !== null && normalized[df] !== '') {
          normalized[df] = String(normalized[df]).replace(/\.\d+Z$/, '').replace('Z', '')
        }
      })
      setEditingItem(normalized)
    } catch (e) {
      setEditingItem(item)
    }
    setFormModalOpen(true)
  }

  const handleFormClose = () => {
    setFormModalOpen(false)
    setEditingItem(null)
  }

  const buildPayload = (formData, moduleDef) => {
    const cleanedData = stripSystemFields(formData)
    const allowedFields = moduleDef?.fields?.map((f) => f.name) || []
    const requiredFields = new Set(
      moduleDef?.fields?.filter((f) => f.required).map((f) => f.name) || [],
    )
    const payload = {}
    Object.keys(cleanedData).forEach((k) => {
      if (!allowedFields.includes(k)) return
      if (!requiredFields.has(k) && cleanedData[k] === '') return
      payload[k] = cleanedData[k]
    })
    return payload
  }

  const handleFormSubmit = async (formData) => {
    setFormLoading(true)
    try {
      const payload = buildPayload(formData, module)

      const applyDateFormat = (p) => {
        const dateFields = module.fields.filter((f) => f.type === 'date').map((f) => f.name)
        dateFields.forEach((df) => {
          if (p[df] !== undefined && p[df] !== null && p[df] !== '') {
            p[df] = formatDateToApi(p[df])
          }
        })
      }
      applyDateFormat(payload)

      if (editingItem) {
        const itemId = editingItem.id || editingItem.Id
        await crudService.update(moduleKey, itemId, payload)
        toast.success(
          MESSAGES.success.UPDATE || `${module.label || module.name} updated successfully`,
        )
      } else {
        await crudService.create(moduleKey, payload)
        toast.success(
          MESSAGES.success.CREATE || `${module.label || module.name} created successfully`,
        )
      }
      handleFormClose()
      fetchData()
    } catch (error) {
      console.error('Error saving:', error)
      toast.error(
        error.response?.data?.message || MESSAGES.error.SAVE_FAILED || 'Failed to save',
      )
    } finally {
      setFormLoading(false)
    }
  }

  // Triggered by FormModal when user clicks + next to a select field
  const handleQuickCreate = useCallback((fieldName, refModuleKey) => {
    setQuickCreate({ isOpen: true, fieldName, moduleKey: refModuleKey })
  }, [])

  const handleFieldUpdatesApplied = useCallback(() => {
    setPendingFieldUpdate(null)
  }, [])

  // Submit the quick-create form: create the record, refresh the dropdown, auto-select
  const handleQuickCreateSubmit = useCallback(
    async (formData) => {
      const { fieldName, moduleKey: refModuleKey } = quickCreate
      const refModule = MODULES[refModuleKey]
      if (!refModule) return

      setQuickCreateLoading(true)
      try {
        const payload = buildPayload(formData, refModule)
        const result = await crudService.create(refModuleKey, payload)

        // Extract the new record's ID from the API response.
        // Some endpoints return data/message as a plain string ("Created successfully")
        // rather than an object/array — skip those so we don't accidentally read .Id on a string.
        const toRecord = (v) => (v != null && typeof v === 'object' ? v : null)
        const rec = toRecord(result?.data) || toRecord(result?.message) || result || {}
        const newId =
          (Array.isArray(rec) ? rec[0]?.id || rec[0]?.Id : rec?.id || rec?.Id) || null

        await refreshSingleReference(refModuleKey)

        if (newId) {
          setPendingFieldUpdate({ [fieldName]: String(newId) })
        }

        toast.success(
          `${refModule.label || refModule.name || refModuleKey} created successfully`,
        )
        setQuickCreate({ isOpen: false, fieldName: '', moduleKey: '' })
      } catch (error) {
        console.error('Error in quick create:', error)
        toast.error(error.response?.data?.message || 'Failed to create record')
      } finally {
        setQuickCreateLoading(false)
      }
    },
    [quickCreate, refreshSingleReference],
  )

  const handleDelete = (item) => {
    setDeletingItem(item)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!deletingItem) return
    setDeleteLoading(true)
    try {
      const itemId = deletingItem.id || deletingItem.Id
      await crudService.remove(moduleKey, itemId)
      toast.success(
        MESSAGES.success.DELETE || `${module.label || module.name} deleted successfully`,
      )
      setDeleteDialogOpen(false)
      setDeletingItem(null)
      fetchData()
    } catch (error) {
      console.error('Error deleting:', error)
      toast.error(
        error.response?.data?.message || MESSAGES.error.DELETE_FAILED || 'Failed to delete',
      )
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleDeleteClose = () => {
    setDeleteDialogOpen(false)
    setDeletingItem(null)
  }

  const filteredAndSortedData = useMemo(() => {
    let result = [...data]
    if (searchQuery && module?.searchFields) {
      const query = searchQuery.toLowerCase()
      result = result.filter((item) => {
        const matchesSearchFields = module.searchFields.some((field) => {
          const value = item[field]
          return value && String(value).toLowerCase().includes(query)
        })
        const matchesAnyColumn = module.tableColumns?.some((col) => {
          const key = typeof col === 'string' ? col : col.key
          const value = item[key]
          return value && String(value).toLowerCase().includes(query)
        })
        return matchesSearchFields || matchesAnyColumn
      })
    }
    if (sortConfig.key) {
      result.sort((a, b) => {
        const aVal = a[sortConfig.key]
        const bVal = b[sortConfig.key]
        if (aVal == null && bVal == null) return 0
        if (aVal == null) return sortConfig.direction === 'asc' ? 1 : -1
        if (bVal == null) return sortConfig.direction === 'asc' ? -1 : 1
        let comparison = 0
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          comparison = aVal - bVal
        } else if (typeof aVal === 'boolean' && typeof bVal === 'boolean') {
          comparison = aVal === bVal ? 0 : aVal ? -1 : 1
        } else {
          comparison = String(aVal).localeCompare(String(bVal), undefined, { numeric: true })
        }
        return sortConfig.direction === 'asc' ? comparison : -comparison
      })
    }
    return result
  }, [data, searchQuery, module, sortConfig])

  const getReferenceName = useCallback(
    (refModuleKey, id) => {
      const refs = referenceData[refModuleKey] || []
      const ref = refs.find((r) => (r.id || r.Id) === id)
      if (!ref) return id
      if (typeof ref.Lat !== 'undefined' && typeof ref.Lng !== 'undefined') {
        return `${ref.Lat}-${ref.Lng}`
      }
      const displayField = MODULES[refModuleKey]?.displayField
      if (displayField && ref[displayField] !== undefined) {
        return ref[displayField]
      }
      return (
        ref.name ||
        ref.Name ||
        ref.typeName ||
        ref.TypeName ||
        ref.title ||
        ref.Title ||
        ref.UnitName ||
        ref.ProviderName ||
        ref.FirstName ||
        ref.BatchNumber ||
        ref.TransactionNo ||
        id
      )
    },
    [referenceData],
  )

  const columns = useMemo(() => {
    if (!module?.tableColumns) return []
    return module.tableColumns.map((col) => {
      if (typeof col === 'string') {
        const fieldDef = module.fields?.find((f) => f.name === col)
        if (fieldDef && fieldDef.reference) {
          const refModuleKey = fieldDef.reference
          return {
            key: col,
            label: fieldDef.label || col,
            render: (value) => {
              const id = value?.id || value?.Id || value
              const name =
                value !== null && typeof value === 'object'
                  ? typeof value.Lat !== 'undefined' && typeof value.Lng !== 'undefined'
                    ? `${value.Lat}-${value.Lng}`
                    : value.name ||
                      value.Name ||
                      value.BatchNumber ||
                      value.UnitName ||
                      value.ProviderName ||
                      value.FirstName ||
                      value.TransactionNo ||
                      id
                  : getReferenceName(refModuleKey, value)
              return <span title={String(id ?? '')}>{name}</span>
            },
          }
        }
        return {
          key: col,
          label: module.fields?.find((f) => f.name === col)?.label || col,
        }
      }
      return {
        key: col.key || col.name,
        label: col.label || col.key || col.name,
        width: col.width,
        render: col.reference
          ? (value) => {
              const id = value?.id || value?.Id || value
              const name =
                value !== null && typeof value === 'object'
                  ? typeof value.Lat !== 'undefined' && typeof value.Lng !== 'undefined'
                    ? `${value.Lat}-${value.Lng}`
                    : value.name ||
                      value.Name ||
                      value.BatchNumber ||
                      value.UnitName ||
                      value.ProviderName ||
                      value.FirstName ||
                      value.TransactionNo ||
                      id
                  : getReferenceName(col.reference, value)
              return <span title={String(id ?? '')}>{name}</span>
            }
          : col.render,
      }
    })
  }, [module, getReferenceName])

  if (!module) return null

  if (!hasRead) {
    return (
      <div className="generic-crud-page">
        <div className="content-header">
          <h1><span>{module.icon}</span>{module.label || module.name}</h1>
        </div>
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <p style={{ fontSize: '3rem', margin: '0 0 8px' }}>🔒</p>
          <h3 style={{ fontSize: '1.1rem', margin: '0 0 6px', color: '#4a5568' }}>Access Denied</h3>
          <p style={{ fontSize: '0.875rem', color: '#718096' }}>
            You need <code>{readScope}</code> permission to view this module.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="generic-crud-page">
      {/* Header */}
      <div className="content-header">
        <h1>
          <span>{module.icon}</span>
          {module.label || module.name}
        </h1>
        <div className="content-header-actions">
          {hasWrite && (
            <button className="btn btn-primary" onClick={handleCreate}>
              ➕ Add {module.label || module.name}
            </button>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="filter-bar">
        <input
          type="text"
          className="search-input"
          placeholder={`${STRINGS.buttons.search} ${(
            module.label ||
            module.name ||
            ''
          ).toLowerCase()}...`}
          value={searchQuery}
          onChange={handleSearch}
        />
        <button
          className="btn btn-secondary"
          onClick={fetchData}
          disabled={loading}
        >
          🔄 {STRINGS.buttons.refresh}
        </button>
      </div>

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={filteredAndSortedData}
        loading={loading}
        onEdit={hasWrite ? handleEdit : undefined}
        onDelete={hasWrite ? handleDelete : undefined}
        pagination={pagination}
        onPageChange={handlePageChange}
        sortConfig={sortConfig}
        onSort={handleSort}
        emptyMessage={`No ${(
          module.label ||
          module.name ||
          ''
        ).toLowerCase()} found. Click "Add ${module.label || module.name}" to create one.`}
      />

      {/* Create/Edit Modal */}
      <FormModal
        isOpen={formModalOpen}
        onClose={handleFormClose}
        title={
          editingItem
            ? `Edit ${module.label || module.name}`
            : `Create ${module.label || module.name}`
        }
        fields={module.fields}
        initialData={editingItem}
        moduleKey={moduleKey}
        onSubmit={handleFormSubmit}
        loading={formLoading}
        referenceData={referenceData}
        onQuickCreate={handleQuickCreate}
        fieldUpdates={pendingFieldUpdate}
        onFieldUpdatesApplied={handleFieldUpdatesApplied}
      />

      {/* Quick-create nested modal — no recursive quick-create (onQuickCreate=null) */}
      {quickCreate.isOpen && MODULES[quickCreate.moduleKey] && (
        <FormModal
          isOpen={quickCreate.isOpen}
          onClose={() => setQuickCreate({ isOpen: false, fieldName: '', moduleKey: '' })}
          title={`Create ${MODULES[quickCreate.moduleKey]?.label || quickCreate.moduleKey}`}
          fields={MODULES[quickCreate.moduleKey]?.fields || []}
          initialData={null}
          moduleKey={quickCreate.moduleKey}
          onSubmit={handleQuickCreateSubmit}
          loading={quickCreateLoading}
          referenceData={quickCreateRefData}
          onQuickCreate={null}
        />
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={handleDeleteClose}
        onConfirm={handleDeleteConfirm}
        title={`Delete ${module.label || module.name}`}
        message={`Are you sure you want to delete this ${(
          module.label ||
          module.name ||
          ''
        ).toLowerCase()}? This action cannot be undone.`}
        confirmText="Delete"
        type="danger"
        loading={deleteLoading}
      />
    </div>
  )
}

export default GenericCrudPage
