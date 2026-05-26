import type { ApiResponse } from '@shared/types';

// ============================================================
// REST API 请求封装 — 统一拦截器 + 错误处理
// ============================================================

const BASE_URL = '/api';
const TIMEOUT_MS = 15_000;
const SESSION_STORAGE_KEY = 'fangke_session_id';

// ---------- Session ID 管理 ----------

function getSessionId(): string {
  if (typeof window === 'undefined') return 'anonymous';
  let sid = sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!sid) {
    sid = `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(SESSION_STORAGE_KEY, sid);
  }
  return sid;
}

export { getSessionId };

// ---------- 请求选项 ----------

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined | null>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

// ---------- 错误类 ----------

export class ApiError extends Error {
  constructor(
    public code: number,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

// ---------- 工具函数 ----------

function buildUrl(path: string, params?: RequestOptions['params']): string {
  const url = new URL(`${BASE_URL}${path}`, window.location.origin);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.append(key, String(value));
      }
    });
  }

  return url.pathname + url.search;
}

function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

// ---------- 核心请求函数 ----------

export async function request<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, params, headers, signal } = options;

  // 网络检测
  if (!isOnline()) {
    throw new NetworkError('网络已断开，请检查网络连接后重试');
  }

  const url = buildUrl(path, params);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  // 合并外部 signal
  if (signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  const fetchHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Session-Id': getSessionId(),
    ...headers,
  };

  try {
    const response = await fetch(url, {
      method,
      headers: fetchHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // HTTP 状态码检查
    if (!response.ok) {
      let errorMsg = `请求失败 (${response.status})`;
      try {
        const errorData: ApiResponse = await response.json();
        errorMsg = errorData.msg || errorMsg;
      } catch {
        // 无法解析 JSON，使用默认错误消息
      }
      throw new ApiError(response.status, errorMsg, response.status);
    }

    // 解析响应体
    const data: ApiResponse<T> = await response.json();

    // 业务状态码检查
    if (data.code !== 0) {
      throw new ApiError(data.code, data.msg || '请求失败');
    }

    return data.data;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof ApiError || error instanceof NetworkError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new NetworkError('请求超时，请检查网络后重试');
    }

    throw new NetworkError('网络异常，请稍后重试');
  }
}

// ---------- 便捷方法 ----------

export const api = {
  get<T = unknown>(path: string, params?: RequestOptions['params'], signal?: AbortSignal) {
    return request<T>(path, { method: 'GET', params, signal });
  },

  post<T = unknown>(path: string, body?: unknown, signal?: AbortSignal) {
    return request<T>(path, { method: 'POST', body, signal });
  },

  put<T = unknown>(path: string, body?: unknown, signal?: AbortSignal) {
    return request<T>(path, { method: 'PUT', body, signal });
  },

  patch<T = unknown>(path: string, body?: unknown, signal?: AbortSignal) {
    return request<T>(path, { method: 'PATCH', body, signal });
  },

  delete<T = unknown>(path: string, signal?: AbortSignal) {
    return request<T>(path, { method: 'DELETE', signal });
  },
};

export default api;
