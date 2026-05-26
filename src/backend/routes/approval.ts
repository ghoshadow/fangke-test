import { Router, Request, Response } from 'express';
import { ApplicationModel } from '../models/application';
import { ApprovalRecordModel } from '../models/approval-record';
import { VisitorPassModel } from '../models/visitor-pass';
import { validateApprovalOperation, validateReasonRequired } from '../validators/approval';
import { success, paginated, fail } from '../middleware/response';
import { now, getDatabase } from '../config';
import type { ApprovalStatusType } from '../../shared/types';

const router = Router();

/** GET /api/approvals/pending — 待我处理列表 */
router.get('/pending', (req: Request, res: Response) => {
  const { session_id, name, phone, date_from, date_to, status, page, page_size } = req.query;

  // 待处理 = 所有 pending 状态的申请（无登录模式下不过滤 session）
  const result = ApplicationModel.recordQuery({
    visitor_name: name as string | undefined,
    phone: phone as string | undefined,
    approval_status: (status as ApprovalStatusType) || 'pending' as ApprovalStatusType,
    visit_start_from: date_from as string | undefined,
    visit_start_to: date_to as string | undefined,
    page: page ? Number(page) : undefined,
    page_size: page_size ? Number(page_size) : undefined,
  });

  return paginated(res, result);
});

/** GET /api/approvals/created — 我创建的列表 */
router.get('/created', (req: Request, res: Response) => {
  const { session_id } = req.query;
  if (!session_id) {
    return paginated(res, { items: [], total: 0, page: 1, page_size: 20 });
  }
  const items = ApplicationModel.findBySessionId(session_id as string);
  return success(res, items);
});

/** GET /api/approvals/processed — 我已处理列表 */
router.get('/processed', (req: Request, res: Response) => {
  const { session_id } = req.query;
  if (!session_id) {
    return paginated(res, { items: [], total: 0, page: 1, page_size: 20 });
  }

  // 找出该 session 处理过的所有申请 ID
  // 通过 approval_record 表查 operator_session_id 对应的 application_id
  // 然后获取这些申请的详情
  const db = getDatabase();
  const result = db.exec(
    `SELECT DISTINCT application_id FROM approval_record WHERE operator_session_id = ?`,
    [session_id as string]
  );

  if (!result.length || !result[0].values.length) {
    return success(res, []);
  }

  const appIds = result[0].values.map((row: unknown[]) => row[0] as string);
  const items = appIds
    .map((id: string) => ApplicationModel.findById(id))
    .filter(Boolean);

  return success(res, items);
});

/** POST /api/approvals/:id/approve — 同意申请 */
router.post('/:id/approve', (req: Request, res: Response) => {
  const { id } = req.params;
  const { operator_session_id } = req.body;

  if (!operator_session_id) {
    return fail(res, 40000, '缺少 operator_session_id');
  }

  const app = ApplicationModel.findById(id);
  if (!app) {
    return fail(res, 40404, '申请不存在', 404);
  }

  // 校验操作前置条件
  const validation = validateApprovalOperation(id, operator_session_id, app.approval_status);
  if (!validation.valid) {
    return fail(res, validation.code!, validation.msg!);
  }

  // 更新审批状态为 approved
  ApplicationModel.updateApprovalStatus(id, 'approved');

  // 记录审批操作（只写）
  ApprovalRecordModel.create({
    application_id: id,
    operation_type: 'approve',
    reason: null,
    operator_session_id,
    operated_at: now(),
  });

  // 自动生成通行证
  const pass = VisitorPassModel.create({ application_id: id });

  // 更新申请的通行状态
  ApplicationModel.updatePassStatus(id, 'not_visited');

  return success(res, { application: ApplicationModel.findById(id), pass });
});

/** POST /api/approvals/:id/return — 退回申请 */
router.post('/:id/return', (req: Request, res: Response) => {
  const { id } = req.params;
  const { operator_session_id, reason } = req.body;

  if (!operator_session_id) {
    return fail(res, 40000, '缺少 operator_session_id');
  }

  const app = ApplicationModel.findById(id);
  if (!app) {
    return fail(res, 40404, '申请不存在', 404);
  }

  // 校验操作前置条件
  const opValidation = validateApprovalOperation(id, operator_session_id, app.approval_status);
  if (!opValidation.valid) {
    return fail(res, opValidation.code!, opValidation.msg!);
  }

  // 退回必须填写原因
  const reasonValidation = validateReasonRequired(reason, 'return');
  if (!reasonValidation.valid) {
    return fail(res, reasonValidation.code!, reasonValidation.msg!);
  }

  // 更新审批状态为 returned
  ApplicationModel.updateApprovalStatus(id, 'returned');

  // 记录审批操作（只写）
  ApprovalRecordModel.create({
    application_id: id,
    operation_type: 'return',
    reason: reason!,
    operator_session_id,
    operated_at: now(),
  });

  return success(res, ApplicationModel.findById(id));
});

/** POST /api/approvals/:id/reject — 拒绝申请 */
router.post('/:id/reject', (req: Request, res: Response) => {
  const { id } = req.params;
  const { operator_session_id, reason } = req.body;

  if (!operator_session_id) {
    return fail(res, 40000, '缺少 operator_session_id');
  }

  const app = ApplicationModel.findById(id);
  if (!app) {
    return fail(res, 40404, '申请不存在', 404);
  }

  // 校验操作前置条件
  const opValidation = validateApprovalOperation(id, operator_session_id, app.approval_status);
  if (!opValidation.valid) {
    return fail(res, opValidation.code!, opValidation.msg!);
  }

  // 拒绝必须填写原因
  const reasonValidation = validateReasonRequired(reason, 'reject');
  if (!reasonValidation.valid) {
    return fail(res, reasonValidation.code!, reasonValidation.msg!);
  }

  // 更新审批状态为 rejected（终态）
  ApplicationModel.updateApprovalStatus(id, 'rejected');

  // 记录审批操作（只写）
  ApprovalRecordModel.create({
    application_id: id,
    operation_type: 'reject',
    reason: reason!,
    operator_session_id,
    operated_at: now(),
  });

  return success(res, ApplicationModel.findById(id));
});

export default router;
