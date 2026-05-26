import { Router, Request, Response } from 'express';
import { ApplicationModel } from '../models/application';
import { ok, paginated } from '../helpers/response';
import type { VisitorApplication, RecordQuery } from '@shared/types';

// ============================================================
// /api/records — 记录查询（多条件筛选）
// ============================================================

export const recordRouter = Router();

// GET /api/records — 多维度筛选查询
recordRouter.get('/', (req: Request, res: Response) => {
  const query: RecordQuery = {
    visitor_name: (req.query.visitor_name as string) || undefined,
    phone: (req.query.phone as string) || undefined,
    department_id: (req.query.department_id as string) || undefined,
    approval_status: (req.query.approval_status as RecordQuery['approval_status']) || undefined,
    pass_status: (req.query.pass_status as RecordQuery['pass_status']) || undefined,
    visit_start_from: (req.query.visit_start_from as string) || undefined,
    visit_start_to: (req.query.visit_start_to as string) || undefined,
    created_from: (req.query.created_from as string) || undefined,
    created_to: (req.query.created_to as string) || undefined,
    contact_person: (req.query.contact_person as string) || undefined,
    page: req.query.page ? Number(req.query.page) : undefined,
    page_size: req.query.page_size ? Number(req.query.page_size) : undefined,
  };

  const result = ApplicationModel.recordQuery(query);
  paginated<VisitorApplication>(res, result);
});
