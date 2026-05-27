import { Router, Request, Response } from 'express';
import { ApplicationModel } from '../models/application';
import { ApprovalRecordModel } from '../models/approval-record';
import { VisitorPassModel } from '../models/visitor-pass';
import { validateApprovalOperation, validateReasonRequired } from '../validators/approval';
import { success, paginated, fail } from '../middleware/response';
import { now, getDatabase } from '../config';
import type { ApprovalStatusType, VisitorApplication } from '../../shared/types';

const router = Router();

/** 内存筛选辅助：对申请数组应用筛选条件 */
function filterApplications(
  items: VisitorApplication[],
  filters: {
    name?: string;
    phone?: string;
    date_from?: string;
    date_to?: string;
    status?: string;
  },
): VisitorApplication[] {
  let result = items;
  if (filters.name) {
    result = result.filter((a) => a.visitor_name.includes(filters.name!));
  }
  if (filters.phone) {
    result = result.filter((a) => a.phone === filters.phone);
  }
  if (filters.date_from) {
    result = result.filter((a) => a.visit_start_time >= filters.date_from!);
  }
  if (filters.date_to) {
    result = result.filter((a) => a.visit_start_time <= filters.date_to! + ' 23:59:59');
  }
  if (filters.status) {
    result = result.filter((a) => a.approval_status === filters.status);
  }
  return result;
}

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
  const { session_id, name, phone, date_from, date_to, status, page, page_size } = req.query;
  if (!session_id) {
    return paginated(res, { items: [], total: 0, page: 1, page_size: 20 });
  }

  let items = ApplicationModel.findBySessionId(session_id as string);

  // 应用筛选条件
  items = filterApplications(items, {
    name: name as string | undefined,
    phone: phone as string | undefined,
    date_from: date_from as string | undefined,
    date_to: date_to as string | undefined,
    status: status as string | undefined,
  });

  // 分页
  const p = page ? Number(page) : 1;
  const ps = page_size ? Number(page_size) : 20;
  const total = items.length;
  const start = (p - 1) * ps;
  const paged = items.slice(start, start + ps);

  return paginated(res, { items: paged, total, page: p, page_size: ps });
});

/** GET /api/approvals/processed — 我已处理列表 */
router.get('/processed', (req: Request, res: Response) => {
  const { session_id, name, phone, date_from, date_to, status, page, page_size } = req.query;
  if (!session_id) {
    return paginated(res, { items: [], total: 0, page: 1, page_size: 20 });
  }

  const db = getDatabase();
  const result = db.exec(
    `SELECT DISTINCT application_id FROM approval_record WHERE operator_session_id = ?`,
    [session_id as string],
  );

  if (!result.length || !result[0].values.length) {
    return paginated(res, { items: [], total: 0, page: 1, page_size: 20 });
  }

  const appIds = result[0].values.map((row: unknown[]) => row[0] as string);
  let items = appIds
    .map((id: string) => ApplicationModel.findById(id))
    .filter(Boolean) as VisitorApplication[];

  // 应用筛选条件
  items = filterApplications(items, {
    name: name as string | undefined,
    phone: phone as string | undefined,
    date_from: date_from as string | undefined,
    date_to: date_to as string | undefined,
    status: status as string | undefined,
  });

  // 分页
  const p = page ? Number(page) : 1;
  const ps = page_size ? Number(page_size) : 20;
  const total = items.length;
  const start = (p - 1) * ps;
  const paged = items.slice(start, start + ps);

  return paginated(res, { items: paged, total, page: p, page_size: ps });
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

  // 更新审批状态为 approved（乐观锁）
  const updated = ApplicationModel.updateApprovalStatus(id, 'approved', app.version);
  if (!updated) {
    return fail(res, 40010, '该申请已被其他用户处理，请刷新后重试');
  }

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

  // 更新审批状态为 returned（乐观锁）
  const updatedReturn = ApplicationModel.updateApprovalStatus(id, 'returned', app.version);
  if (!updatedReturn) {
    return fail(res, 40010, '该申请已被其他用户处理，请刷新后重试');
  }

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

  // 更新审批状态为 rejected（终态）（乐观锁）
  const updatedReject = ApplicationModel.updateApprovalStatus(id, 'rejected', app.version);
  if (!updatedReject) {
    return fail(res, 40010, '该申请已被其他用户处理，请刷新后重试');
  }

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
