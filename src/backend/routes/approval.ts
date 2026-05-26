import { Router, Request, Response } from 'express';
import { ApplicationModel } from '../models/application';
import { ApprovalRecordModel } from '../models/approval-record';
import { VisitorPassModel } from '../models/visitor-pass';
import { ok, paginated, fail, notFound, getSessionId } from '../helpers/response';
import type {
  VisitorApplication,
  ApprovalRecord,
  OperationType,
} from '@shared/types';

// ============================================================
// /api/approval — 审批管理
// ============================================================

export const approvalRouter = Router();

// GET /api/approval/pending — 待审批列表
approvalRouter.get('/pending', (req: Request, res: Response) => {
  const { page, page_size } = req.query;

  const result = ApplicationModel.query({
    approval_status: 'pending',
    page: page ? Number(page) : undefined,
    page_size: page_size ? Number(page_size) : undefined,
  });

  paginated<VisitorApplication>(res, result);
});

// GET /api/approval/records/:applicationId — 获取审批记录
approvalRouter.get('/records/:applicationId', (req: Request, res: Response) => {
  const { applicationId } = req.params;
  const records = ApprovalRecordModel.findByApplicationId(applicationId);
  ok<ApprovalRecord[]>(res, records);
});

// POST /api/approval/:id/approve — 同意
approvalRouter.post('/:id/approve', (req: Request, res: Response) => {
  handleApproval(req, res, 'approve');
});

// POST /api/approval/:id/return — 退回
approvalRouter.post('/:id/return', (req: Request, res: Response) => {
  handleApproval(req, res, 'return');
});

// POST /api/approval/:id/reject — 拒绝
approvalRouter.post('/:id/reject', (req: Request, res: Response) => {
  handleApproval(req, res, 'reject');
});

// ============================================================
// 审批处理统一逻辑
// ============================================================

function handleApproval(req: Request, res: Response, action: OperationType): void {
  const { id } = req.params;
  const sessionId = getSessionId(req);
  const { reason } = req.body as { reason?: string };

  const application = ApplicationModel.findById(id);
  if (!application) {
    notFound(res, '申请不存在');
    return;
  }

  if (application.approval_status !== 'pending') {
    fail(res, 422, '该申请已被处理，不可重复操作');
    return;
  }

  // 退回和拒绝必须填写原因
  if ((action === 'return' || action === 'reject') && (!reason || !reason.trim())) {
    fail(res, 422, action === 'return' ? '退回必须填写原因' : '拒绝必须填写原因');
    return;
  }

  const operatedAt = new Date().toISOString();

  // 写审批记录
  ApprovalRecordModel.create({
    application_id: id,
    operation_type: action,
    reason: reason?.trim() || null,
    operator_session_id: sessionId,
    operated_at: operatedAt,
  });

  // 更新申请状态
  const statusMap: Record<OperationType, 'approved' | 'returned' | 'rejected'> = {
    approve: 'approved',
    return: 'returned',
    reject: 'rejected',
  };
  ApplicationModel.updateApprovalStatus(id, statusMap[action]);

  // 审批通过 → 自动生成通行证
  if (action === 'approve') {
    VisitorPassModel.create({ application_id: id });
    // 同时更新申请的 pass_status
    ApplicationModel.updatePassStatus(id, 'not_visited');
  }

  const updated = ApplicationModel.findById(id);
  ok(res, updated, action === 'approve' ? '已同意' : action === 'return' ? '已退回' : '已拒绝');
}
