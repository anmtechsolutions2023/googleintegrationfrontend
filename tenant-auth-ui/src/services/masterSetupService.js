import api from '../api/api';

// First-time master-data bootstrap — creates the whole Organization → Branch →
// Item tree in one transactional call. Returns { data: { ...idMap } }.
export const bootstrapMasterData = (payload) =>
  api.post('/api/master-data/bootstrap', payload);

export default { bootstrapMasterData };
