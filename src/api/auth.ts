/**
 * Auth API 封装
 */

import { apiClient } from './client.js';
import type {
  AuthRegisterReq,
  AuthRegisterResp,
  AuthLoginReq,
  AuthLoginResp,
  MeResp,
} from '@shared/api';

export const authApi = {
  register(body: AuthRegisterReq): Promise<AuthRegisterResp> {
    return apiClient.post<AuthRegisterResp>('/auth/register', body);
  },
  login(body: AuthLoginReq): Promise<AuthLoginResp> {
    return apiClient.post<AuthLoginResp>('/auth/login', body);
  },
  me(): Promise<MeResp> {
    return apiClient.get<MeResp>('/auth/me');
  },
};
