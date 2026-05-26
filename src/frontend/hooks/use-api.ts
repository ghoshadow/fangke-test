import { useState, useCallback, useRef, useEffect } from 'react';
import { api, ApiError, NetworkError } from '../lib/api-client';

// ============================================================
// useApi — API 请求状态管理 Hook
// ============================================================

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

interface UseApiResult<T> extends UseApiState<T> {
  execute: (...args: unknown[]) => Promise<T | null>;
  reset: () => void;
}

export function useApi<T = unknown>(
  apiFn: (...args: unknown[]) => Promise<T>,
): UseApiResult<T> {
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const execute = useCallback(
    async (...args: unknown[]): Promise<T | null> => {
      // 取消上一次请求
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const result = await apiFn(...args, controller.signal);
        if (mountedRef.current) {
          setState({ data: result, loading: false, error: null });
        }
        return result;
      } catch (err) {
        if (!mountedRef.current) return null;

        let message = '请求失败，请稍后重试';
        if (err instanceof ApiError) {
          message = err.message;
        } else if (err instanceof NetworkError) {
          message = err.message;
        }

        setState({ data: null, loading: false, error: message });
        return null;
      }
    },
    [apiFn],
  );

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null });
  }, []);

  return { ...state, execute, reset };
}

// ============================================================
// useApiWithParams — 带参数的 GET 请求 Hook（自动触发）
// ============================================================

interface UseApiWithParamsOptions<T> {
  path: string;
  params?: Record<string, string | number | boolean | undefined | null>;
  immediate?: boolean;
  transform?: (data: unknown) => T;
}

export function useApiGet<T = unknown>(
  options: UseApiWithParamsOptions<T>,
): UseApiResult<T> & { refetch: () => void } {
  const { path, params, immediate = true, transform } = options;

  const fetchFn = useCallback(async () => {
    const data = await api.get<T>(path, params);
    return transform ? transform(data) : data;
  }, [path, params, transform]);

  const result = useApi<T>(fetchFn);

  const paramsKey = JSON.stringify(params);
  const prevParamsRef = useRef(paramsKey);

  useEffect(() => {
    if (immediate) {
      if (prevParamsRef.current !== paramsKey) {
        prevParamsRef.current = paramsKey;
      }
      result.execute();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [immediate, paramsKey]);

  const refetch = useCallback(() => {
    result.execute();
  }, [result.execute]);

  return { ...result, refetch };
}
