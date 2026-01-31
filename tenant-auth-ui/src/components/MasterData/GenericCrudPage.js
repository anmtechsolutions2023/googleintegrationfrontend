import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { MODULES } from '../../config/modules';
import crudService from '../../services/crudService';
import { MESSAGES, STRINGS, APP_CONFIG } from '../../constants';
import DataTable from './DataTable';
import FormModal from './FormModal';
import ConfirmDialog from './ConfirmDialog';
import './MasterData.css';

// Centralized pagination config
const { DEFAULT_PAGE, DEFAULT_LIMIT } = APP_CONFIG.PAGINATION;

/**
 * GenericCrudPage Component
 * A dynamic page that renders CRUD operations for any module
 * Based on the moduleKey from URL params
 */
const GenericCrudPage = () => {
  const { moduleKey } = useParams();
  const navigate = useNavigate();

  // Get module configuration
  const module = useMemo(() => MODULES[moduleKey], [moduleKey]);

  // State
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [pagination, setPagination] = useState({
    page: DEFAULT_PAGE,
    pageSize: DEFAULT_LIMIT,
    total: 0,
  });

  // Modal states
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formLoading, setFormLoading] = useState(false);

  // Delete confirmation states
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingItem, setDeletingItem] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Reference data for dropdowns
  const [referenceData, setReferenceData] = useState({});

  // Extract reference modules from fields (fields that have type='select' with 'reference')
  const referenceModules = useMemo(() => {
    if (!module?.fields) return [];
    const refs = new Set();
    module.fields.forEach((field) => {
      if (field.type === 'select' && field.reference) {
        refs.add(field.reference);
      }
    });
    return Array.from(refs);
  }, [module]);

  // Redirect if module not found
  useEffect(() => {
    if (!module) {
      navigate('/master', { replace: true });
    }
  }, [module, navigate]);

  // Fetch data - uses API pagination, search is done locally
  const fetchData = useCallback(async () => {
    if (!module) return;

    setLoading(true);
    try {
      const response = await crudService.getAll(moduleKey, {
        page: pagination.page,
        limit: pagination.pageSize,
      });

      // Actual API response format:
      // { success: true, data: {pagination info}, message: [array of records], pagination: "message string" }
      // Note: The API has swapped field names - 'message' contains data, 'data' contains pagination
      let items = [];
      let totalRecords = 0;

      if (response.success !== undefined) {
        // Check if 'message' contains the data array (actual API format)
        if (Array.isArray(response.message)) {
          items = response.message;
          totalRecords = response.data?.total || items.length;
        }
        // Standard format where 'data' is the array
        else if (Array.isArray(response.data)) {
          items = response.data;
          totalRecords = response.pagination?.total || items.length;
        }
      } else if (Array.isArray(response.data)) {
        items = response.data;
        totalRecords =
          response.total || response.pagination?.total || items.length;
      } else if (response.data?.items) {
        items = response.data.items;
        totalRecords = response.data.total || items.length;
      } else if (Array.isArray(response)) {
        items = response;
        totalRecords = items.length;
      }

      setData(items);
      setPagination((prev) => ({
        ...prev,
        total: totalRecords,
      }));
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error(MESSAGES.error.FETCH_FAILED || 'Failed to load data');
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [moduleKey, module, pagination.page, pagination.pageSize]);

  // Fetch reference data for dropdowns
  const fetchReferenceData = useCallback(async () => {
    if (referenceModules.length === 0) return;

    try {
      const refData = {};
      await Promise.all(
        referenceModules.map(async (refModuleKey) => {
          try {
            const response = await crudService.getReferenceData(refModuleKey);
            // Handle different response structures
            let items = [];
            if (Array.isArray(response)) {
              items = response;
            } else if (Array.isArray(response?.data)) {
              items = response.data;
            } else if (response?.items) {
              items = response.items;
            } else if (response?.data?.items) {
              items = response.data.items;
            }
            refData[refModuleKey] = items;
          } catch (err) {
            console.warn(
              `Failed to load reference data for ${refModuleKey}:`,
              err
            );
            refData[refModuleKey] = [];
          }
        })
      );
      setReferenceData(refData);
    } catch (error) {
      console.error('Error fetching reference data:', error);
    }
  }, [referenceModules]);

  // Initial data load
  useEffect(() => {
    if (module) {
      fetchData();
      fetchReferenceData();
    }
  }, [module, fetchData, fetchReferenceData]);

  // Handle search - local filtering only, no API call
  const handleSearch = (e) => {
    setSearchQuery(e.target.value);
  };

  // Handle page change - triggers API call
  const handlePageChange = (newPage) => {
    setPagination((prev) => ({ ...prev, page: newPage }));
  };

  // Handle column sorting - local sorting
  const handleSort = (columnKey) => {
    setSortConfig((prev) => ({
      key: columnKey,
      direction:
        prev.key === columnKey && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  // Open create modal
  const handleCreate = () => {
    setEditingItem(null);
    setFormModalOpen(true);
  };

  // Open edit modal
  const handleEdit = (item) => {
    setEditingItem(item);
    setFormModalOpen(true);
  };

  // Close form modal
  const handleFormClose = () => {
    setFormModalOpen(false);
    setEditingItem(null);
  };

  // System fields that should never be sent to the API
  const SYSTEM_FIELDS = [
    'Id',
    'id',
    'TenantId',
    'tenantId',
    'CreatedAt',
    'UpdatedAt',
    'CreatedOn',
    'UpdatedOn',
    'createdAt',
    'updatedAt',
    'createdOn',
    'updatedOn',
    'CreatedBy',
    'UpdatedBy',
    'createdBy',
    'updatedBy',
    'DeletedAt',
    'deletedAt',
    'DeletedBy',
    'deletedBy',
  ];

  // Helper to strip system fields from form data
  const stripSystemFields = (data) => {
    const cleaned = {};
    Object.keys(data).forEach((key) => {
      if (!SYSTEM_FIELDS.includes(key)) {
        cleaned[key] = data[key];
      }
    });
    return cleaned;
  };

  // Submit form (create/update)
  const handleFormSubmit = async (formData) => {
    setFormLoading(true);
    try {
      // Strip all system fields from the payload
      const cleanedData = stripSystemFields(formData);

      if (editingItem) {
        // Handle both 'id' and 'Id' casing from API
        const itemId = editingItem.id || editingItem.Id;
        await crudService.update(moduleKey, itemId, cleanedData);
        toast.success(
          MESSAGES.success.UPDATE ||
            `${module.label || module.name} updated successfully`
        );
      } else {
        await crudService.create(moduleKey, cleanedData);
        toast.success(
          MESSAGES.success.CREATE ||
            `${module.label || module.name} created successfully`
        );
      }
      handleFormClose();
      fetchData();
    } catch (error) {
      console.error('Error saving:', error);
      const errorMessage =
        error.response?.data?.message ||
        MESSAGES.error.SAVE_FAILED ||
        'Failed to save';
      toast.error(errorMessage);
    } finally {
      setFormLoading(false);
    }
  };

  // Open delete confirmation
  const handleDelete = (item) => {
    setDeletingItem(item);
    setDeleteDialogOpen(true);
  };

  // Confirm delete
  const handleDeleteConfirm = async () => {
    if (!deletingItem) return;

    setDeleteLoading(true);
    try {
      // Handle both 'id' and 'Id' casing from API
      const itemId = deletingItem.id || deletingItem.Id;
      await crudService.remove(moduleKey, itemId);
      toast.success(
        MESSAGES.success.DELETE ||
          `${module.label || module.name} deleted successfully`
      );
      setDeleteDialogOpen(false);
      setDeletingItem(null);
      fetchData();
    } catch (error) {
      console.error('Error deleting:', error);
      const errorMessage =
        error.response?.data?.message ||
        MESSAGES.error.DELETE_FAILED ||
        'Failed to delete';
      toast.error(errorMessage);
    } finally {
      setDeleteLoading(false);
    }
  };

  // Close delete dialog
  const handleDeleteClose = () => {
    setDeleteDialogOpen(false);
    setDeletingItem(null);
  };

  // Filter and sort data locally (client-side)
  const filteredAndSortedData = useMemo(() => {
    let result = [...data];

    // Apply local search filter
    if (searchQuery && module?.searchFields) {
      const query = searchQuery.toLowerCase();
      result = result.filter((item) => {
        // Search in defined search fields
        const matchesSearchFields = module.searchFields.some((field) => {
          const value = item[field];
          return value && String(value).toLowerCase().includes(query);
        });
        // Also search in all string columns for better UX
        const matchesAnyColumn = module.tableColumns?.some((col) => {
          const key = typeof col === 'string' ? col : col.key;
          const value = item[key];
          return value && String(value).toLowerCase().includes(query);
        });
        return matchesSearchFields || matchesAnyColumn;
      });
    }

    // Apply sorting
    if (sortConfig.key) {
      result.sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];

        // Handle null/undefined
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return sortConfig.direction === 'asc' ? 1 : -1;
        if (bVal == null) return sortConfig.direction === 'asc' ? -1 : 1;

        // Compare values
        let comparison = 0;
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          comparison = aVal - bVal;
        } else if (typeof aVal === 'boolean' && typeof bVal === 'boolean') {
          comparison = aVal === bVal ? 0 : aVal ? -1 : 1;
        } else {
          comparison = String(aVal).localeCompare(String(bVal), undefined, {
            numeric: true,
          });
        }

        return sortConfig.direction === 'asc' ? comparison : -comparison;
      });
    }

    return result;
  }, [data, searchQuery, module, sortConfig]);

  // Get display name from reference data
  const getReferenceName = useCallback(
    (refModuleKey, id) => {
      const refs = referenceData[refModuleKey] || [];
      const ref = refs.find((r) => (r.id || r.Id) === id);
      if (!ref) return id;
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
      );
    },
    [referenceData]
  );

  // Build table columns with reference resolution
  const columns = useMemo(() => {
    if (!module?.tableColumns) return [];

    return module.tableColumns.map((col) => {
      // Handle string column names (simple case)
      if (typeof col === 'string') {
        return {
          key: col,
          label: col,
        };
      }
      // Handle object column definitions
      return {
        key: col.key || col.name,
        label: col.label || col.key || col.name,
        width: col.width,
        render: col.reference
          ? (value) => getReferenceName(col.reference, value)
          : col.render,
      };
    });
  }, [module, getReferenceName]);

  if (!module) {
    return null;
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
          <button className="btn btn-primary" onClick={handleCreate}>
            ➕ Add {module.label || module.name}
          </button>
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
        onEdit={handleEdit}
        onDelete={handleDelete}
        pagination={pagination}
        onPageChange={handlePageChange}
        sortConfig={sortConfig}
        onSort={handleSort}
        emptyMessage={`No ${(
          module.label ||
          module.name ||
          ''
        ).toLowerCase()} found. Click "Add ${
          module.label || module.name
        }" to create one.`}
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
        onSubmit={handleFormSubmit}
        loading={formLoading}
        referenceData={referenceData}
      />

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
  );
};

export default GenericCrudPage;
