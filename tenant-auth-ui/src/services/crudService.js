import api from '../api/api';
import { MODULES } from '../config/modules';
import { APP_CONFIG } from '../constants';

// Centralized pagination config
const { DEFAULT_PAGE, DEFAULT_LIMIT, MAX_LIMIT } = APP_CONFIG.PAGINATION;

/**
 * Generic CRUD service for all modules
 * Provides standardized API calls for any module defined in modules.js
 */

// Get all records with pagination
export const getAll = async (moduleKey, params = {}) => {
  const module = MODULES[moduleKey];
  if (!module) throw new Error(`Module ${moduleKey} not found`);

  // API uses 'limit' not 'pageSize', handle both for backward compatibility
  const { page = DEFAULT_PAGE, limit, pageSize, search = '' } = params;
  const recordLimit = limit || pageSize || DEFAULT_LIMIT;
  const queryParams = new URLSearchParams({ page, limit: recordLimit });

  if (search) {
    queryParams.append('search', search);
  }

  const response = await api.get(
    `${module.endpoint}?${queryParams.toString()}`
  );
  return response.data;
};

// Get single record by ID
export const getById = async (moduleKey, id) => {
  const module = MODULES[moduleKey];
  if (!module) throw new Error(`Module ${moduleKey} not found`);

  const response = await api.get(`${module.endpoint}/${id}`);
  return response.data;
};

// Create new record
export const create = async (moduleKey, data) => {
  const module = MODULES[moduleKey];
  if (!module) throw new Error(`Module ${moduleKey} not found`);

  const response = await api.post(module.endpoint, data);
  return response.data;
};

// Update existing record
export const update = async (moduleKey, id, data) => {
  const module = MODULES[moduleKey];
  if (!module) throw new Error(`Module ${moduleKey} not found`);

  const response = await api.put(`${module.endpoint}/${id}`, data);
  return response.data;
};

// Delete record
export const remove = async (moduleKey, id) => {
  const module = MODULES[moduleKey];
  if (!module) throw new Error(`Module ${moduleKey} not found`);

  const response = await api.delete(`${module.endpoint}/${id}`);
  return response.data;
};

// Get reference data for dropdowns
export const getReferenceData = async (moduleKey) => {
  try {
    const module = MODULES[moduleKey];
    if (!module) {
      console.warn(`Module ${moduleKey} not found for reference data`);
      return [];
    }

    // Use MAX_LIMIT from centralized config
    const response = await api.get(
      `${module.endpoint}?page=${DEFAULT_PAGE}&limit=${MAX_LIMIT}`
    );
    const apiResponse = response.data;

    // Actual API response format:
    // { success: true, data: {pagination}, message: [array], pagination: "string" }
    // Note: 'message' contains the data array, not 'data'
    if (apiResponse?.success !== undefined) {
      // Check 'message' first (actual API format)
      if (Array.isArray(apiResponse.message)) {
        return apiResponse.message;
      }
      // Fallback to standard 'data' array
      if (Array.isArray(apiResponse.data)) {
        return apiResponse.data;
      }
    }

    // Handle different response structures as fallback
    if (Array.isArray(apiResponse)) {
      return apiResponse;
    }
    if (apiResponse?.data && Array.isArray(apiResponse.data)) {
      return apiResponse.data;
    }
    if (apiResponse?.items && Array.isArray(apiResponse.items)) {
      return apiResponse.items;
    }
    if (apiResponse?.Data && Array.isArray(apiResponse.Data)) {
      return apiResponse.Data;
    }

    return [];
  } catch (error) {
    console.error(`Failed to load reference data for ${moduleKey}:`, error);
    return [];
  }
};

// Export as named object for convenience
const crudService = {
  getAll,
  getById,
  create,
  update,
  remove,
  getReferenceData,
};

export default crudService;
