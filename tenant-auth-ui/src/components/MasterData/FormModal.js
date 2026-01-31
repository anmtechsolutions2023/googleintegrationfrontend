import React, { useState, useEffect, useCallback } from 'react';
import './MasterData.css';

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
}) => {
  const [formData, setFormData] = useState({});
  const [errors, setErrors] = useState({});

  // Initialize form data when modal opens or initialData changes
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData(initialData);
      } else {
        // Initialize with default values
        const defaults = {};
        fields.forEach((field) => {
          if (field.default !== undefined) {
            defaults[field.name] = field.default;
          } else if (field.type === 'boolean') {
            defaults[field.name] = false;
          } else {
            defaults[field.name] = '';
          }
        });
        setFormData(defaults);
      }
      setErrors({});
    }
  }, [isOpen, initialData, fields]);

  // Handle input change
  const handleChange = useCallback(
    (fieldName, value, fieldType) => {
      let processedValue = value;

      // Type conversion
      if (fieldType === 'number') {
        processedValue = value === '' ? '' : Number(value);
      } else if (fieldType === 'boolean') {
        processedValue = Boolean(value);
      }

      setFormData((prev) => ({
        ...prev,
        [fieldName]: processedValue,
      }));

      // Clear error for this field
      if (errors[fieldName]) {
        setErrors((prev) => {
          const newErrors = { ...prev };
          delete newErrors[fieldName];
          return newErrors;
        });
      }
    },
    [errors]
  );

  // Validate form
  const validate = useCallback(() => {
    const newErrors = {};

    fields.forEach((field) => {
      const value = formData[field.name];

      // Required validation
      if (field.required) {
        if (value === undefined || value === null || value === '') {
          newErrors[field.name] = `${field.label || field.name} is required`;
          return;
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
        } must be less than ${field.maxLength} characters`;
      }

      // Min/Max number validation
      if (field.type === 'number' && value !== '' && value !== undefined) {
        if (field.min !== undefined && value < field.min) {
          newErrors[field.name] = `${
            field.label || field.name
          } must be at least ${field.min}`;
        }
        if (field.max !== undefined && value > field.max) {
          newErrors[field.name] = `${
            field.label || field.name
          } must be at most ${field.max}`;
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [fields, formData]);

  // Handle form submit
  const handleSubmit = (e) => {
    e.preventDefault();
    if (validate()) {
      // Convert boolean fields to proper boolean type before submission
      const processedData = { ...formData };
      fields.forEach((field) => {
        if (field.type === 'boolean') {
          // Convert 1/0, "true"/"false", truthy/falsy to proper boolean
          const val = processedData[field.name];
          processedData[field.name] =
            val === true || val === 1 || val === '1' || val === 'true';
        }
      });
      onSubmit(processedData);
    }
  };

  // Handle backdrop click
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Render field based on type
  const renderField = (field) => {
    const value = formData[field.name] ?? '';
    const hasError = !!errors[field.name];

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
        );

      case 'select':
        const options = referenceData[field.reference] || [];
        return (
          <select
            id={field.name}
            className="form-select"
            value={value}
            onChange={(e) => handleChange(field.name, e.target.value, 'string')}
            disabled={loading}
            style={hasError ? { borderColor: '#e74c3c' } : {}}
          >
            <option value="">Select {field.label || field.name}</option>
            {options.map((opt, idx) => {
              const optId = opt.id || opt.Id;
              const optName =
                opt.name ||
                opt.Name ||
                opt.typeName ||
                opt.TypeName ||
                opt.title ||
                opt.Title ||
                opt.UnitName ||
                opt.ProviderName ||
                opt.FirstName ||
                opt.BatchNumber ||
                opt.TransactionNo ||
                optId;
              return (
                <option key={optId || idx} value={optId}>
                  {optName}
                </option>
              );
            })}
          </select>
        );

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
        );

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
        );

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
        );

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
        );

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
        );

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
        );
    }
  };

  if (!isOpen) return null;

  // Split fields into rows for 2-column layout (skip hidden fields and wide fields)
  const visibleFields = fields.filter((f) => !f.hidden);

  return (
    <div className="modal-overlay" onClick={handleBackdropClick}>
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
  );
};

export default FormModal;
