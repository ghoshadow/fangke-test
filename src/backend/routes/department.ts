import { Router, Request, Response } from 'express';
import { DepartmentModel } from '../models/department';
import { ok } from '../helpers/response';

// ============================================================
// GET /api/departments — 获取所有部门列表
// ============================================================

export const departmentRouter = Router();

departmentRouter.get('/', (_req: Request, res: Response) => {
  const departments = DepartmentModel.findAll();
  ok(res, departments);
});
