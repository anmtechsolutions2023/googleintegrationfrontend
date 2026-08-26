import api from '../api/api';

// Bulk import. Tenant admins only — the API refuses everybody else, and the
// Import button is hidden accordingly.
//
// The CSV never leaves the browser as a file: it is parsed here and posted as
// JSON, which is why there is no upload endpoint on the other side.
const BASE = '/api/import';

const unwrap = (body) => body?.data ?? body?.resource ?? body ?? null;

/**
 * Pass one — catalogue items.
 * @param {Array<Object>} rows - Mapped rows: { name, category, unit, price, taxGroup, … }
 * @param {'skip'|'update'} onDuplicate
 * @returns {Promise<Object>} { summary, created, rows }
 */
export const importItems = async (rows, onDuplicate = 'skip') =>
  unwrap((await api.post(`${BASE}/items`, { rows, onDuplicate })).data);

/**
 * Pass two — publish those items onto one branch's menu.
 * @param {Object} payload - { branchDetailId, defaultFoodType, channelIds, variantIds, items }
 * @returns {Promise<Object>} { summary, rows }
 */
export const publishMenuEntries = async (payload) =>
  unwrap((await api.post(`${BASE}/menu-entries`, payload)).data);

/**
 * Checks the browser cannot make for itself — which tax groups price at 0%
 * because they hold no tax types. Writes nothing.
 * @param {string[]} taxGroups
 * @returns {Promise<string[]>} Names of the empty ones.
 */
export const previewChecks = async (taxGroups) => {
  const data = unwrap((await api.post(`${BASE}/preview`, { taxGroups })).data);
  return data?.emptyTaxGroups || [];
};

export default { importItems, publishMenuEntries, previewChecks };
