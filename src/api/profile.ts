/**
 * Profile API 封装
 */

import { apiClient } from './client.js';
import type { ProfileDTO, ProfileUpdateReq } from '@shared/api';

export const profileApi = {
  get(): Promise<ProfileDTO> {
    return apiClient.get<ProfileDTO>('/profile');
  },
  update(patch: ProfileUpdateReq): Promise<ProfileDTO> {
    return apiClient.put<ProfileDTO>('/profile', patch);
  },
};
