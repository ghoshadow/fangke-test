import { Router, Request, Response } from 'express';
import { ApplicationModel } from '../models/application';
import { ApprovalRecordModel } from '../models/approval-record';
import { VisitorPassModel } from '../models/visitor-pass';
import { success, paginated, fail } from '../middleware/response';
import type { ApprovalStatusType, PassStatusType } from '../../shared/types';

const router = Router();

/** GET /api/records — 多条件组合查询 */
router.get('/', (req: Request, res: Response) => {
  const {
    name, phone, id_card, contact_person, department,
    company, date_from, date_to, license_plate,
    approval_status, pass_status, page, page_size,
  } = req.query;

  const result = ApplicationModel.recordQuery({
    visitor_name: name as string | undefined,
    phone: phone as string | undefined,
    id_card: id_card as string | undefined,
    contact_person: contact_person as string | undefined,
    department_id: department as string | undefined,
    company: company as string | undefined,
    license_plate: license_plate as string | undefined,
    approval_status: approval_status as ApprovalStatusType | undefined,
    pass_status: pass_status as PassStatusType | undefined,
    visit_start_from: date_from as string | undefined,
    visit_start_to: date_to as string | undefined,
    page: page ? Number(page) : undefined,
    page_size: page_size ? Number(page_size) : undefined,
  });

  return paginated(res, result);
});

/** GET /api/records/:id — 记录详情（含审批记录+通行证） */
router.get('/:id', (req: Request, res: Response) => {
  const app = ApplicationModel.findById(req.params.id);
  if (!app) {
    return fail(res, 40404, '记录不存在', 404);
  }

  // 审批历史（只读）
  const approvalRecords = ApprovalRecordModel.findByApplicationId(req.params.id);

  // 通行证信息
  const pass = VisitorPassModel.findByApplicationId(req.params.id);

  return success(res, {
    application: app,
    approval_records: approvalRecords,
    pass,
  });
});

export default router;
