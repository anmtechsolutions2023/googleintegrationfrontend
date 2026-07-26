import api from '../api/api';

// First-time master-data bootstrap — creates the whole Organization → Branch →
// Item tree in one transactional call, and marks the tenancy set up.
// Returns { data: { ...idMap, setupToken } }, where setupToken is a refreshed
// JWT with setupCompleted:true — apply it so the setup gate stops blocking.
export const bootstrapMasterData = (payload) =>
  api.post('/api/master-data/bootstrap', payload);

// Authoritative setup status for the caller's tenant, independent of whatever
// the current JWT claims. Returns { data: { status, isComplete, ... } }.
export const getSetupStatus = () => api.get('/api/master-data/status');

export default { bootstrapMasterData, getSetupStatus };
