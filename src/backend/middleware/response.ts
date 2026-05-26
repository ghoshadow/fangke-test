import { Request, Response, NextFunction } from 'express';
import type { ApiResponse, PaginatedData } from '../../shared/types';

/** 统一成功响应 */
export function success<T>(res: Response, data: T, msg = 'success'): Response<ApiResponse<T>> {
  return res.json({ code: 0, msg, data });
}

/** 统一分页响应 */
export function paginated<T>(res: Response, data: PaginatedData<T>): Response<ApiResponse<PaginatedData<T>>> {
  return res.json({ code: 0, msg: 'success', data });
}

/** 统一失败响应 */
export function fail(res: Response, code: number, msg: string, httpStatus = 400): Response<ApiResponse<null>> {
  return res.status(httpStatus).json({ code, msg, data: null });
}

/** 全局错误处理中间件 */
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  console.error('[Server Error]', err.message);
  res.status(500).json({ code: 50000, msg: '服务器内部错误', data: null });
}
