import { Router, Request, Response } from 'express';
import type { Multer } from 'multer';
import { ApplicationModel } from '../models/application';
import { VisitorPassModel } from '../models/visitor-pass';
import { DraftModel } from '../models/draft';
import { validate, applicationRules } from '../validators';
import { ok, paginated, fail, notFound, getSessionId } from '../helpers/response';
import type {
  CreateApplicationInput,
  PaginatedResponse,
  VisitorApplication,
} from '@shared/types';

// ============================================================
// /api/applications — 访客申请 CRUD
// ============================================================

export function applicationRouter(upload: Multer): Router {
  const router = Router();

  // POST /api/applications — 创建申请
  router.post('/', (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const sessionId = getSessionId(req);

    const errors = validate(body, applicationRules);
    if (errors) {
      return fail(res, 422, '表单校验失败');
    }

    // 时间逻辑校验：结束时间必须晚于开始时间
    const start = new Date(body.visit_start_time as string);
    const end = new Date(body.visit_end_time as string);
    if (end <= start) {
      return fail(res, 422, '访问结束时间必须晚于开始时间');
    }

    const input: CreateApplicationInput = {
      visitor_name: body.visitor_name as string,
      phone: body.phone as string,
      id_card: (body.id_card as string) || null,
      company: (body.company as string) || null,
      visitor_count: Number(body.visitor_count),
      is_driving: Boolean(body.is_driving),
      license_plate: (body.license_plate as string) || null,
      contact_person: body.contact_person as string,
      department_id: body.department_id as string,
      visit_start_time: body.visit_start_time as string,
      visit_end_time: body.visit_end_time as string,
      visit_purpose: body.visit_purpose as string,
      attachment_url: (body.attachment_url as string) || null,
      session_id: sessionId,
    };

    const application = ApplicationModel.create(input);

    // 提交成功后清理草稿
    DraftModel.deleteBySessionAndApplication(sessionId, null);

    ok(res, application, '申请提交成功');
  });

  // GET /api/applications — 获取我的申请列表（按 session_id）
  router.get('/', (req: Request, res: Response) => {
    const sessionId = getSessionId(req);
    const { approval_status, phone, page, page_size } = req.query;

    const result = ApplicationModel.query({
      session_id: sessionId,
      approval_status: approval_status as string | undefined as never,
      phone: phone as string | undefined,
      page: page ? Number(page) : undefined,
      page_size: page_size ? Number(page_size) : undefined,
    });

    paginated<VisitorApplication>(res, result);
  });

  // GET /api/applications/:id — 获取申请详情
  router.get('/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const application = ApplicationModel.findById(id);

    if (!application) {
      return notFound(res, '申请不存在');
    }

    // 查询关联的通行证
    const pass = VisitorPassModel.findByApplicationId(id);

    ok(res, { ...application, pass });
  });

  // PUT /api/applications/:id — 退回后重新提交
  router.put('/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const sessionId = getSessionId(req);
    const body = req.body as Record<string, unknown>;

    const application = ApplicationModel.findById(id);
    if (!application) {
      return notFound(res, '申请不存在');
    }

    // 只有申请人本人且状态为 returned 才能重提
    if (application.session_id !== sessionId) {
      return fail(res, 403, '无权修改他人申请', 403);
    }
    if (application.approval_status !== 'returned') {
      return fail(res, 422, '只有被退回的申请才能重新提交');
    }

    const errors = validate(body, applicationRules);
    if (errors) {
      return fail(res, 422, '表单校验失败');
    }

    ApplicationModel.updateFields(id, {
      visitor_name: body.visitor_name as string,
      phone: body.phone as string,
      id_card: (body.id_card as string) || null,
      company: (body.company as string) || null,
      visitor_count: Number(body.visitor_count),
      is_driving: Boolean(body.is_driving),
      license_plate: (body.license_plate as string) || null,
      contact_person: body.contact_person as string,
      department_id: body.department_id as string,
      visit_start_time: body.visit_start_time as string,
      visit_end_time: body.visit_end_time as string,
      visit_purpose: body.visit_purpose as string,
      attachment_url: (body.attachment_url as string) || null,
    });

    // 重提成功后清理草稿
    DraftModel.deleteBySessionAndApplication(sessionId, id);

    const updated = ApplicationModel.findById(id);
    ok(res, updated, '申请已重新提交');
  });

  // POST /api/applications/upload — 上传附件
  router.post('/upload', upload.single('file'), (req: Request, res: Response) => {
    if (!req.file) {
      return fail(res, 400, '请选择要上传的文件');
    }
    const url = `/uploads/${req.file.filename}`;
    ok(res, { url }, '上传成功');
  });

  return router;
}
