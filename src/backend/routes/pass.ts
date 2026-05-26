import { Router, Request, Response } from 'express';
import { VisitorPassModel } from '../models/visitor-pass';
import { ApplicationModel } from '../models/application';
import { success, paginated, fail } from '../middleware/response';

const router = Router();

/** GET /api/passes — 通行证列表（支持搜索） */
router.get('/', (req: Request, res: Response) => {
  const { name, phone, id_card, page, page_size } = req.query;
  const pageNum = page ? Number(page) : 1;
  const pageSizeNum = page_size ? Number(page_size) : 20;

  // 如果有搜索关键词，使用搜索方法
  if (name || phone || id_card) {
    const keyword = (name as string) || (phone as string) || (id_card as string) || '';
    const result = VisitorPassModel.search(keyword, pageNum, pageSizeNum);
    return paginated(res, result);
  }

  // 否则返回全量分页
  const result = VisitorPassModel.query({ page: pageNum, page_size: pageSizeNum });
  return paginated(res, result);
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

  const pass = VisitorPassModel.findById(id);
  if (!pass) {
    return fail(res, 40404, '通行证不存在', 404);
  }

  if (pass.pass_status === 'visited') {
    return fail(res, 40020, '已确认到访，不可重复操作');
  }

  try {
    VisitorPassModel.confirmVisit(id);
  } catch (err) {
    return fail(res, 40020, (err as Error).message);
  }

  // 同步更新申请表的通行状态
  ApplicationModel.updatePassStatus(pass.application_id, 'visited');

  const updated = VisitorPassModel.findById(id);
  return success(res, updated);
});

export default router;
