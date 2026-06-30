import api from '../api/api';
import { ENDPOINTS } from '../config/config';

export const getOnboardingStatus = () =>
  api.get(ENDPOINTS.ONBOARDING.STATUS);

export const updateOnboardingNote = (requestNote) =>
  api.put(ENDPOINTS.ONBOARDING.NOTE, { requestNote });

export default { getOnboardingStatus, updateOnboardingNote };
