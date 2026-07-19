import React, { useState, useEffect, useCallback } from 'react'
import { MODULES } from '../../config/modules'
import './MasterData.css'

/**
 * FormModal Component
 * A dynamic form modal that generates fields based on module configuration
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether modal is open
 * @param {Function} props.onClose - Close handler
 * @param {string} props.title - Modal title
 * @param {Array} props.fields - Field definitions from module config
 * @param {Object} props.initialData - Initial form data (for edit mode)
 * @param {Function} props.onSubmit - Submit handler (formData) => void
 * @param {boolean} props.loading - Submit loading state
 * @param {Object} props.referenceData - Data for select fields { fieldName: [options] }
 */
const FormModal = ({
  isOpen,
  onClose,
  title,
  fields = [],
  initialData = null,
  onSubmit,
  loading = false,
  referenceData = {},
  moduleKey = null,
  onQuickCreate = null,
  fieldUpdates = null,
  onFieldUpdatesApplied = null,
  elevated = false,
}) => {
  const [formData, setFormData] = useState({})
  const [errors, setErrors] = useState({})

  // When parent pushes a field update (e.g. after quick-create auto-selects the new record)
  useEffect(() => {
    if (fieldUpdates && Object.keys(fieldUpdates).length > 0) {
      setFormData((prev) => ({ ...prev, ...fieldUpdates }))
      if (typeof onFieldUpdatesApplied === 'function') onFieldUpdatesApplied()
    }
  }, [fieldUpdates]) // eslint-disable-line

  // Initialize form data when modal opens or initialData changes
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData(initialData)
      } else {
        // Initialize with default values
        const defaults = {}
        fields.forEach((field) => {
          if (field.default !== undefined) {
            defaults[field.name] = field.default
          } else if (field.type === 'boolean') {
            defaults[field.name] = false
          } else if (field.type === 'multiselect') {
            defaults[field.name] = []
          } else {
            defaults[field.name] = ''
          }
        })
        setFormData(defaults)
      }
      setErrors({})
    }
  }, [isOpen, initialData, fields])

  // Handle input change
  const handleChange = useCallback(
    (fieldName, value, fieldType) => {
      let processedValue = value

      // Type conversion
      if (fieldType === 'number') {
        processedValue = value === '' ? '' : Number(value)
      } else if (fieldType === 'boolean') {
        processedValue = Boolean(value)
      }

      setFormData((prev) => ({
        ...prev,
        [fieldName]: processedValue,
      }))

      // Clear error for this field
      if (errors[fieldName]) {
        setErrors((prev) => {
          const newErrors = { ...prev }
          delete newErrors[fieldName]
          return newErrors
        })
      }
    },
    [errors],
  )

  // Validate form
  const validate = useCallback(() => {
    const newErrors = {}

    fields.forEach((field) => {
      const value = formData[field.name]

      // Required validation
      if (field.required) {
        if (value === undefined || value === null || value === '') {
          newErrors[field.name] = `${field.label || field.name} is required`
          return
        }
      }

      // String length validation
      if (
        field.maxLength &&
        typeof value === 'string' &&
        value.length > field.maxLength
      ) {
        newErrors[field.name] = `${
          field.label || field.name
        } must be less than ${field.maxLength} characters`
      }

      // Min/Max number validation
      if (field.type === 'number' && value !== '' && value !== undefined) {
        if (field.min !== undefined && value < field.min) {
          newErrors[field.name] = `${
            field.label || field.name
          } must be at least ${field.min}`
        }
        if (field.max !== undefined && value > field.max) {
          newErrors[field.name] = `${
            field.label || field.name
          } must be at most ${field.max}`
        }
      }
    })

    setErrors(newErrors)
    // Additional module-specific validation
    if (moduleKey === 'batchDetails') {
      // For create vs update
      const isEdit = !!initialData

      // BatchNo: required on create, max 100
      const batchNo = formData.BatchNo
      if (!isEdit) {
        if (!batchNo || String(batchNo).trim() === '') {
          newErrors.BatchNo = 'BatchNo is required'
        }
      }
      if (batchNo && String(batchNo).length > 100) {
        newErrors.BatchNo = 'BatchNo must be at most 100 characters'
      }

      // Barcode: optional max 100
      const barcode = formData.Barcode
      if (barcode && String(barcode).length > 100) {
        newErrors.Barcode = 'Barcode must be at most 100 characters'
      }

      // Date fields: allow ISO or DD-MM-YYYY
      const dateFields = ['MfgDate', 'Expdate', 'PurchaseDate']
      const dateRegex = /^\d{1,2}-\d{1,2}-\d{4}$/
      dateFields.forEach((df) => {
        const v = formData[df]
        if (v !== undefined && v !== null && v !== '') {
          // Accept ISO date strings or the dd-mm-yyyy format
          const isIso = !isNaN(Date.parse(v))
          const isDmy = typeof v === 'string' && dateRegex.test(v)
          if (!isIso && !isDmy) {
            newErrors[df] = `${df} must be a valid date (ISO or DD-MM-YYYY)`
          }
        }
      })

      // UUID fields: CostInfoId, UOMId, MapProviderLocationMapperId, BranchDetailId
      const uuidFields = [
        'CostInfoId',
        'UOMId',
        'MapProviderLocationMapperId',
        'BranchDetailId',
      ]
      const uuidRegex =
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
      uuidFields.forEach((uf) => {
        const v = formData[uf]
        if (v !== undefined && v !== null && v !== '') {
          if (!uuidRegex.test(String(v))) {
            newErrors[uf] = `${uf} must be a valid UUID`
          }
        }
      })

      // Quantity: numeric with up to 4 decimal places
      const qty = formData.Quantity
      if (qty !== undefined && qty !== null && qty !== '') {
        const num = Number(qty)
        if (Number.isNaN(num)) {
          newErrors.Quantity = 'Quantity must be a number'
        } else {
          const parts = String(num).split('.')
          if (parts[1] && parts[1].length > 4) {
            newErrors.Quantity = 'Quantity must have at most 4 decimal places'
          }
        }
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [fields, formData])

  // Handle form submit
  const handleSubmit = (e) => {
    e.preventDefault()
    if (validate()) {
      // Convert boolean fields to proper boolean type before submission
      const processedData = { ...formData }
      fields.forEach((field) => {
        if (field.type === 'boolean') {
          // Convert 1/0, "true"/"false", truthy/falsy to proper boolean
          const val = processedData[field.name]
          processedData[field.name] =
            val === true || val === 1 || val === '1' || val === 'true'
        }
      })
      onSubmit(processedData)
    }
  }

  // Handle backdrop click
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  // Render field based on type
  const renderField = (field) => {
    const value = formData[field.name] ?? ''
    const hasError = !!errors[field.name]

    switch (field.type) {
      case 'boolean':
        return (
          <div className="form-checkbox-group">
            <input
              type="checkbox"
              id={field.name}
              className="form-checkbox"
              checked={!!value}
              onChange={(e) =>
                handleChange(field.name, e.target.checked, 'boolean')
              }
              disabled={loading}
            />
            <label htmlFor={field.name}>{field.label || field.name}</label>
          </div>
        )

      case 'select': {
        // Inline static options ({ value, label }) take precedence over
        // reference-loaded data; falls back to referenceData for reference selects.
        const inlineOptions = Array.isArray(field.options) ? field.options : null
        const options = inlineOptions || referenceData[field.reference] || []
        const canQuickCreate =
          typeof onQuickCreate === 'function' &&
          field.reference &&
          MODULES[field.reference]
        return (
          <div style={{ display: 'flex', gap: '6px', alignItems: 'stretch' }}>
            <select
              id={field.name}
              className="form-select"
              value={value}
              onChange={(e) => handleChange(field.name, e.target.value, 'string')}
              disabled={loading}
              style={{ ...(hasError ? { borderColor: '#e74c3c' } : {}), flex: 1 }}
            >
              <option value="">Select {field.label || field.name}</option>
              {options.map((opt, idx) => {
                // Inline static option: { value, label }
                if (inlineOptions) {
                  const optVal = opt.value ?? opt
                  const optLbl = opt.label ?? opt.value ?? opt
                  return (
                    <option key={optVal ?? idx} value={optVal}>
                      {optLbl}
                    </option>
                  )
                }
                const optId = opt.id || opt.Id
                // Prefer module-configured displayField (e.g., Tag)
                const displayField = MODULES[field.reference]?.displayField
                let optName = ''
                if (displayField && opt[displayField] !== undefined) {
                  optName = opt[displayField]
                } else {
                  optName =
                    opt.DisplayLabel ||
                    opt.name ||
                    opt.Name ||
                    opt.Type ||
                    opt.typeName ||
                    opt.TypeName ||
                    opt.title ||
                    opt.Title ||
                    opt.UnitName ||
                    opt.ProviderName ||
                    opt.FirstName ||
                    opt.BatchNumber ||
                    opt.TransactionNo ||
                    optId
                }
                // If option has Lat and Lng fields (location), display as "Lat-Lng"
                if (typeof opt.Lat !== 'undefined' && typeof opt.Lng !== 'undefined') {
                  optName = `${opt.Lat}-${opt.Lng}`
                }
                return (
                  <option key={optId || idx} value={optId}>
                    {optName}
                  </option>
                )
              })}
            </select>
            {canQuickCreate && (
              <button
                type="button"
                onClick={() => onQuickCreate(field.name, field.reference)}
                disabled={loading}
                title={`Create new ${MODULES[field.reference]?.label || field.label || field.reference}`}
                style={{
                  padding: '0 10px',
                  minWidth: '36px',
                  background: '#27ae60',
                  color: '#fff',
                  border: '1px solid #219150',
                  borderRadius: '4px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '20px',
                  fontWeight: 'bold',
                  lineHeight: 1,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                +
              </button>
            )}
          </div>
        )
      }

      case 'multiselect': {
        // Multi-select over reference data; stores an array of ids. Rendered as
        // a checkbox list so several channels/variants can be picked per item.
        const options = referenceData[field.reference] || []
        const selected = Array.isArray(value) ? value : []
        const displayField = MODULES[field.reference]?.displayField
        const optLabel = (opt) => {
          if (displayField && opt[displayField] !== undefined) return opt[displayField]
          return opt.DisplayLabel || opt.name || opt.Name || opt.Title || opt.id || opt.Id
        }
        const toggle = (optId) => {
          const next = selected.includes(optId)
            ? selected.filter((v) => v !== optId)
            : [...selected, optId]
          handleChange(field.name, next, 'array')
        }
        return (
          <div
            className="form-multiselect"
            style={{
              border: `1px solid ${hasError ? '#e74c3c' : '#ddd'}`,
              borderRadius: '4px',
              padding: '8px',
              maxHeight: '160px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            {options.length === 0 && (
              <span style={{ color: '#95a5a6', fontSize: '0.9em' }}>No options available</span>
            )}
            {options.map((opt) => {
              const optId = opt.id || opt.Id
              return (
                <label
                  key={optId}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0 }}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(optId)}
                    onChange={() => toggle(optId)}
                    disabled={loading}
                  />
                  <span>{optLabel(opt)}</span>
                </label>
              )
            })}
          </div>
        )
      }

      case 'json': {
        // JSON columns (e.g. Channels/Prices/Variants). The API returns them as
        // objects/arrays; render them as pretty-printed JSON text for editing.
        const jsonText =
          value !== null && typeof value === 'object'
            ? JSON.stringify(value, null, 2)
            : value
        return (
          <textarea
            id={field.name}
            className="form-textarea"
            value={jsonText}
            onChange={(e) => handleChange(field.name, e.target.value, 'string')}
            placeholder={field.placeholder || '{ }'}
            disabled={loading}
            rows={field.rows || 5}
            style={{
              fontFamily: 'monospace',
              ...(hasError ? { borderColor: '#e74c3c' } : {}),
            }}
          />
        )
      }

      case 'textarea':
        return (
          <textarea
            id={field.name}
            className="form-textarea"
            value={value}
            onChange={(e) => handleChange(field.name, e.target.value, 'string')}
            placeholder={
              field.placeholder ||
              `Enter ${(field.label || field.name || '').toLowerCase()}`
            }
            disabled={loading}
            maxLength={field.maxLength}
            style={hasError ? { borderColor: '#e74c3c' } : {}}
          />
        )

      case 'number':
        return (
          <input
            type="number"
            id={field.name}
            className="form-input"
            value={value}
            onChange={(e) => handleChange(field.name, e.target.value, 'number')}
            placeholder={
              field.placeholder ||
              `Enter ${(field.label || field.name || '').toLowerCase()}`
            }
            disabled={loading}
            min={field.min}
            max={field.max}
            step={field.step || 'any'}
            style={hasError ? { borderColor: '#e74c3c' } : {}}
          />
        )

      case 'date':
        return (
          <input
            type="date"
            id={field.name}
            className="form-input"
            value={value}
            onChange={(e) => handleChange(field.name, e.target.value, 'string')}
            disabled={loading}
            style={hasError ? { borderColor: '#e74c3c' } : {}}
          />
        )

      case 'datetime':
        return (
          <input
            type="datetime-local"
            id={field.name}
            className="form-input"
            value={value}
            onChange={(e) => handleChange(field.name, e.target.value, 'string')}
            disabled={loading}
            style={hasError ? { borderColor: '#e74c3c' } : {}}
          />
        )

      case 'email':
        return (
          <input
            type="email"
            id={field.name}
            className="form-input"
            value={value}
            onChange={(e) => handleChange(field.name, e.target.value, 'string')}
            placeholder={
              field.placeholder ||
              `Enter ${(field.label || field.name || '').toLowerCase()}`
            }
            disabled={loading}
            style={hasError ? { borderColor: '#e74c3c' } : {}}
          />
        )

      default:
        return (
          <input
            type="text"
            id={field.name}
            className="form-input"
            value={value}
            onChange={(e) => handleChange(field.name, e.target.value, 'string')}
            placeholder={
              field.placeholder ||
              `Enter ${(field.label || field.name || '').toLowerCase()}`
            }
            disabled={loading}
            maxLength={field.maxLength}
            style={hasError ? { borderColor: '#e74c3c' } : {}}
          />
        )
    }
  }

  if (!isOpen) return null

  // Split fields into rows for 2-column layout (skip hidden fields and wide fields)
  const visibleFields = fields.filter((f) => !f.hidden)

  return (
    <div
      className={`modal-overlay${elevated ? ' modal-overlay-nested' : ''}`}
      onClick={handleBackdropClick}
    >
      <div className="modal">
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose} disabled={loading}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {visibleFields.map((field) => (
              <div
                key={field.name}
                className="form-group"
                style={field.wide ? { gridColumn: '1 / -1' } : {}}
              >
                {field.type !== 'boolean' && (
                  <label className="form-label" htmlFor={field.name}>
                    {field.label || field.name}
                    {field.required && <span className="required"> *</span>}
                  </label>
                )}
                {renderField(field)}
                {errors[field.name] && (
                  <div className="form-error">{errors[field.name]}</div>
                )}
              </div>
            ))}
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? 'Saving...' : initialData ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default FormModal
