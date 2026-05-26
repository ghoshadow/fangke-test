import { Router, Request, Response } from 'express';
import { DepartmentModel } from '../models/department';
import { success } from '../middleware/response';

const router = Router();

/** GET /api/departments — 获取部门列表 */
router.get('/', (_req: Request, res: Response) => {
  const departments = DepartmentModel.findAll();
  return success(res, departments);
});

export default router;
