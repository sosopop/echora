/**
 * fetch 封装
 *
 * - base URL 从 import.meta.env.VITE_API_BASE_URL 读取(默认 /api)
 * - 自动注入 Authorization: Bearer <token>(从 useAuthStore 取)
 * - 命中 401 时调注册的 onUnauthorized 回调(由 main.tsx 注入)
 * - 响应统一解析 { data } / { error } 信封
 */

import type { ApiResponse, ApiError } from '@shared/api';

const baseUrl =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';

let unauthorizedCallback: (() => void) | null = null;
let tokenGetter: () => string | null = () => null;

export function setOnUnauthorized(cb: () => void): void {
  unauthorizedCallback = cb;
}

export function setTokenGetter(getter: () => string | null): void {
  tokenGetter = getter;
}

export function getApiBaseUrl(): string {
  return baseUrl;
}

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly apiError: ApiError
  ) {
    super(formatApiErrorMessage(apiError));
    this.name = 'ApiClientError';
  }
}

interface RequestOptions {
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts: RequestOptions = {}
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(opts.headers ?? {}),
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const token = tokenGetter();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: opts.signal,
  });

  let payload: ApiResponse<T> | null = null;
  try {
    payload = (await res.json()) as ApiResponse<T>;
  } catch {
    /* 响应非 JSON,落入下方分支 */
  }

  if (res.status === 401) {
    unauthorizedCallback?.();
  }

  if (!res.ok || !payload || 'error' in payload) {
    const apiError: ApiError = payload && 'error' in payload
      ? payload.error
      : { code: 'NETWORK_ERROR', message: `HTTP ${res.status}` };
    if (import.meta.env.DEV) {
      console.error('[apiClient] request failed', {
        method,
        path,
        status: res.status,
        error: apiError,
      });
    }
    throw new ApiClientError(res.status, apiError);
  }

  return payload.data;
}

export const apiClient = {
  get<T>(path: string, opts?: RequestOptions): Promise<T> {
    return request<T>('GET', path, undefined, opts);
  },
  post<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return request<T>('POST', path, body, opts);
  },
  put<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return request<T>('PUT', path, body, opts);
  },
  del<T>(path: string, opts?: RequestOptions): Promise<T> {
    return request<T>('DELETE', path, undefined, opts);
  },
};

function formatApiErrorMessage(apiError: ApiError): string {
  if (!import.meta.env.DEV || !apiError.details) return apiError.message;
  return `${apiError.message}\n${JSON.stringify(apiError.details, null, 2)}`;
}
