import { Router, Request, Response } from 'express';
import { ApplicationModel } from '../models/application';
import { DraftModel } from '../models/draft';
import { ApprovalRecordModel } from '../models/approval-record';
import { validateApplication, getFirstError } from '../validators/application';
import { success, paginated, fail } from '../middleware/response';
import type { CreateApplicationInput, ApprovalStatusType } from '../../shared/types';

const router = Router();

/** POST /api/applications — 提交新申请 */
router.post('/', (req: Request, res: Response) => {
  const body = req.body;

  // session_id 必填
  if (!body.session_id) {
    return fail(res, 40000, '缺少 session_id');
  }

  // 全量字段校验
  const input: Partial<CreateApplicationInput> = {
    visitor_name: body.visitor_name,
    phone: body.phone,
    id_card: body.id_card || null,
    company: body.company || null,
    visitor_count: body.visitor_count,
    is_driving: body.is_driving,
    license_plate: body.license_plate || null,
    contact_person: body.contact_person,
    department_id: body.department_id,
    visit_start_time: body.visit_start_time,
    visit_end_time: body.visit_end_time,
    visit_purpose: body.visit_purpose,
    attachment_url: body.attachment_url || null,
    session_id: body.session_id,
  };

  const errors = validateApplication(input);
  const firstError = getFirstError(errors);
  if (firstError) {
    return fail(res, 40001, firstError);
  }

  const app = ApplicationModel.create(input as CreateApplicationInput);

  // 提交成功后清理对应草稿
  DraftModel.deleteBySessionAndApplication(body.session_id, null);

  return success(res, app);
});

/** GET /api/applications/:id/return-reason — 获取退回原因 */
router.get('/:id/return-reason', (req: Request, res: Response) => {
  const app = ApplicationModel.findById(req.params.id);
  if (!app) {
    return fail(res, 40404, '申请不存在', 404);
  }

  const records = ApprovalRecordModel.findByApplicationId(req.params.id);
  // 查找最近一条退回记录
  const returnRecord = records.reverse().find((r) => r.operation_type === 'return');

  return success(res, { reason: returnRecord?.reason || null });
});

/** GET /api/applications/:id — 获取申请详情 */
router.get('/:id', (req: Request, res: Response) => {
  const app = ApplicationModel.findById(req.params.id);
  if (!app) {
    return fail(res, 40404, '申请不存在', 404);
  }
  return success(res, app);
});

/** GET /api/applications — 申请列表(我创建的) */
router.get('/', (req: Request, res: Response) => {
  const { session_id, status, page, page_size } = req.query;

  if (session_id) {
    const result = ApplicationModel.query({
      session_id: session_id as string,
      approval_status: status as ApprovalStatusType | undefined,
      page: page ? Number(page) : undefined,
      page_size: page_size ? Number(page_size) : undefined,
    });
    return paginated(res, result);
  }

  // 无 session_id 时返回空列表
  return paginated(res, { items: [], total: 0, page: 1, page_size: 20 });
});

/** PATCH /api/applications/:id — 更新申请(退回重提) */
router.patch('/:id', (req: Request, res: Response) => {
  const app = ApplicationModel.findById(req.params.id);
  if (!app) {
    return fail(res, 40404, '申请不存在', 404);
  }

  // 只有退回状态才可重提
  if (app.approval_status !== 'returned') {
    return fail(res, 40010, '该申请不可修改');
  }

  const body = req.body;
  const fields: Partial<CreateApplicationInput> = {};

  const allowedKeys: (keyof CreateApplicationInput)[] = [
    'visitor_name', 'phone', 'id_card', 'company', 'visitor_count',
    'is_driving', 'license_plate', 'contact_person', 'department_id',
    'visit_start_time', 'visit_end_time', 'visit_purpose', 'attachment_url',
  ];
  for (const key of allowedKeys) {
    if (key in body) {
      (fields as Record<string, unknown>)[key] = body[key];
    }
  }

  // 退回重提需全量校验：合并现有数据与更新字段
  const merged = { ...app, ...fields, is_driving: fields.is_driving ?? app.is_driving };
  const errors = validateApplication(merged);
  const firstError = getFirstError(errors);
  if (firstError) {
    return fail(res, 40001, firstError);
  }

  ApplicationModel.updateFields(req.params.id, fields);
  const updated = ApplicationModel.findById(req.params.id);

  // 重提成功后清理退回草稿
  DraftModel.deleteBySessionAndApplication(app.session_id, req.params.id);

  return success(res, updated);
});

/** POST /api/applications/:id/abandon — 放弃重提（终态：已拒绝） */
router.post('/:id/abandon', (req: Request, res: Response) => {
  const app = ApplicationModel.findById(req.params.id);
  if (!app) {
    return fail(res, 40404, '申请不存在', 404);
  }

  // 只有退回状态才可放弃
  if (app.approval_status !== 'returned') {
    return fail(res, 40010, '该申请不可放弃');
  }

  // 更新为已拒绝（终态）
  const updated = ApplicationModel.updateApprovalStatus(req.params.id, 'rejected', app.version);
  if (!updated) {
    return fail(res, 40010, '操作失败，请刷新后重试');
  }

  // 清理草稿
  DraftModel.deleteBySessionAndApplication(app.session_id, req.params.id);

  return success(res, ApplicationModel.findById(req.params.id));
});

export default router;
