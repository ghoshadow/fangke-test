import { Router, Request, Response } from 'express';
import { DraftModel } from '../models/draft';
import { success, fail } from '../middleware/response';

const router = Router();

/** POST /api/drafts — 暂存草稿 */
router.post('/', (req: Request, res: Response) => {
  const { session_id, application_id, form_data } = req.body;

  if (!session_id) {
    return fail(res, 40000, '缺少 session_id');
  }

  if (!form_data) {
    return fail(res, 40000, '缺少 form_data');
  }

  // form_data 可以是对象或字符串，统一存为 JSON 字符串
  const formDataStr = typeof form_data === 'string' ? form_data : JSON.stringify(form_data);

  const draft = DraftModel.save({
    session_id,
    application_id: application_id || null,
    form_data: formDataStr,
  });

  return success(res, draft);
});

/** GET /api/drafts — 加载草稿 */
router.get('/', (req: Request, res: Response) => {
  const { session_id, application_id } = req.query;

  if (!session_id) {
    return fail(res, 40000, '缺少 session_id');
  }

  let draft = null;
  if (application_id) {
    // 退回重提场景的草稿
    draft = DraftModel.findBySessionAndApplication(
      session_id as string,
      application_id as string,
    );
  } else {
    // 新建场景的草稿
    draft = DraftModel.findBySessionId(session_id as string);
  }

  return success(res, draft);
});

export default router;
