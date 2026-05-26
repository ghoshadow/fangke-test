import { Router, Request, Response } from 'express';
import { VisitorPassModel } from '../models/visitor-pass';
import { ApplicationModel } from '../models/application';
import { ok, paginated, fail, notFound } from '../helpers/response';
import type { VisitorPass } from '@shared/types';

// ============================================================
// /api/passes — 通行证管理
// ============================================================

export const passRouter = Router();

// GET /api/passes — 通行证列表
passRouter.get('/', (req: Request, res: Response) => {
  const { pass_status, page, page_size, keyword } = req.query;

  // 关键词搜索模式（按访客姓名/手机号）
  if (keyword && typeof keyword === 'string' && keyword.trim()) {
    const result = VisitorPassModel.search(
      keyword.trim(),
      page ? Number(page) : undefined,
      page_size ? Number(page_size) : undefined,
    );
    paginated(res, result);
    return;
  }

  const result = VisitorPassModel.query({
    pass_status: pass_status as 'not_visited' | 'visited' | undefined,
    page: page ? Number(page) : undefined,
    page_size: page_size ? Number(page_size) : undefined,
  });

  paginated<VisitorPass>(res, result);
});

// GET /api/passes/:id — 通行证详情（含申请信息）
passRouter.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const pass = VisitorPassModel.findById(id);

  if (!pass) {
    notFound(res, '通行证不存在');
    return;
  }

  const application = ApplicationModel.findById(pass.application_id);
  ok(res, { ...pass, application });
});

// POST /api/passes/:id/confirm — 确认到访
passRouter.post('/:id/confirm', (req: Request, res: Response) => {
  const { id } = req.params;
  const pass = VisitorPassModel.findById(id);

  if (!pass) {
    notFound(res, '通行证不存在');
    return;
  }

  if (pass.pass_status === 'visited') {
    fail(res, 422, '已确认到访，不可重复操作');
    return;
  }

  VisitorPassModel.confirmVisit(id);

  // 同步更新申请表的 pass_status
  ApplicationModel.updatePassStatus(pass.application_id, 'visited');

  const updated = VisitorPassModel.findById(id);
  ok(res, updated, '到访已确认');
});
