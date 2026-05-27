import { Router, Request, Response } from 'express';
import { VisitorPassModel } from '../models/visitor-pass';
import { ApplicationModel } from '../models/application';
import { getDatabase } from '../config';
import { success, paginated, fail } from '../middleware/response';

const router = Router();

/** GET /api/passes — 通行证列表（支持搜索） */
router.get('/', (req: Request, res: Response) => {
  const { name, phone, id_card, page, page_size } = req.query;
  const pageNum = page ? Number(page) : 1;
  const pageSizeNum = page_size ? Number(page_size) : 20;

  // 如果有搜索关键词，使用多字段搜索（AND 逻辑，仅已审批通过的通行证）
  if (name || phone || id_card) {
    const result = VisitorPassModel.search(
      {
        name: name as string | undefined,
        phone: phone as string | undefined,
        id_card: id_card as string | undefined,
      },
      pageNum,
      pageSizeNum,
    );
    return paginated(res, result);
  }

  // 否则返回全量分页（JOIN application 表获取访客信息，仅已审批通过的通行证）
  const db = getDatabase();
  const offset = (pageNum - 1) * pageSizeNum;

  const countResult = db.exec(
    'SELECT COUNT(*) FROM visitor_pass vp JOIN visitor_application va ON vp.application_id = va.id WHERE va.approval_status = ?',
    ['approved'],
  );
  const total = (countResult[0]?.values[0]?.[0] as number) || 0;

  const sql = `SELECT vp.id, vp.application_id, vp.pass_status, vp.actual_visit_time, vp.created_at,
              va.visitor_name, va.phone, va.id_card, va.visit_start_time, va.visit_end_time
       FROM visitor_pass vp
       JOIN visitor_application va ON vp.application_id = va.id
       WHERE va.approval_status = ?
       ORDER BY vp.created_at DESC
       LIMIT ? OFFSET ?`;

  const result = db.exec(sql, ['approved', pageSizeNum, offset]);
  const items = result.length
    ? result[0].values.map((row: unknown[]) => {
        const r = row as (string | null)[];
        return {
          id: r[0] as string,
          application_id: r[1] as string,
          pass_status: r[2] as string,
          actual_visit_time: r[3] as string | null,
          created_at: r[4] as string,
          visitor_name: r[5] as string,
          phone: r[6] as string,
          id_card: r[7] as string | null,
          visit_start_time: r[8] as string,
          visit_end_time: r[9] as string,
        };
      })
    : [];

  return paginated(res, { items, total, page: pageNum, page_size: pageSizeNum });
});

/** GET /api/passes/:id — 通行证详情 */
router.get('/:id', (req: Request, res: Response) => {
  const pass = VisitorPassModel.findById(req.params.id);
  if (!pass) {
    return fail(res, 40404, '通行证不存在', 404);
  }

  // 关联申请信息
  const app = ApplicationModel.findById(pass.application_id);
  return success(res, { ...pass, application: app });
});

/** POST /api/passes/:id/confirm — 确认到访 */
router.post('/:id/confirm', (req: Request, res: Response) => {
  const { id } = req.params;
  const { actual_visit_time } = req.body;

  // 校验 actual_visit_time: 不可为空，格式 HH:mm
  if (!actual_visit_time || typeof actual_visit_time !== 'string') {
    return fail(res, 40021, '请填写实际到访时间');
  }
  if (!/^\d{2}:\d{2}$/.test(actual_visit_time)) {
    return fail(res, 40021, '到访时间格式必须为 HH:mm');
  }

  const pass = VisitorPassModel.findById(id);
  if (!pass) {
    return fail(res, 40404, '通行证不存在', 404);
  }

  if (pass.pass_status === 'visited') {
    return fail(res, 40020, '已确认到访，不可重复操作');
  }

  try {
    VisitorPassModel.confirmVisit(id, actual_visit_time);
  } catch (err) {
    return fail(res, 40020, (err as Error).message);
  }

  // 同步更新申请表的通行状态
  ApplicationModel.updatePassStatus(pass.application_id, 'visited');

  const updated = VisitorPassModel.findById(id);
  return success(res, updated);
});

export default router;
