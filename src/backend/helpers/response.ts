import type { Response, Request } from 'express';
import type { ApiResponse, PaginatedResponse } from '@shared/types';

// ============================================================
// API 响应助手
// ============================================================

export function ok<T>(res: Response, data: T, msg = 'ok'): void {
  const body: ApiResponse<T> = { code: 0, msg, data };
  res.json(body);
}

export function paginated<T>(res: Response, data: PaginatedResponse<T>['data']): void {
  const body: PaginatedResponse<T> = { code: 0, msg: 'ok', data };
  res.json(body);
}

export function fail(res: Response, code: number, msg: string, status = 400): void {
  const body: ApiResponse<null> = { code, msg, data: null };
  res.status(status).json(body);
}

export function notFound(res: Response, msg = '资源不存在'): void {
  fail(res, 404, msg, 404);
}

/**
 * 从 express.Request 中提取 sessionId
 * 由 app.ts 中的 session 中间件注入
 */
export function getSessionId(req: Request): string {
  return (req as Request & { sessionId?: string }).sessionId ||
    (req.headers['x-session-id'] as string) ||
    'anonymous';
}
