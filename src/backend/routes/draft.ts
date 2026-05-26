import { Router, Request, Response } from 'express';
import { DraftModel } from '../models/draft';
import { ok, fail, notFound, getSessionId } from '../helpers/response';

// ============================================================
// /api/drafts — 草稿管理
// ============================================================

export const draftRouter = Router();

// POST /api/drafts — 保存草稿（UPSERT）
draftRouter.post('/', (req: Request, res: Response) => {
  const sessionId = getSessionId(req);
  const { application_id, form_data } = req.body as {
    application_id?: string;
    form_data?: unknown;
  };

  if (!form_data) {
    fail(res, 422, 'form_data 不能为空');
    return;
  }

  const draft = DraftModel.save({
    session_id: sessionId,
    application_id: application_id || null,
    form_data: typeof form_data === 'string' ? form_data : JSON.stringify(form_data),
  });

  ok(res, draft, '草稿已保存');
});

// GET /api/drafts — 获取我的草稿（新建场景）
draftRouter.get('/', (req: Request, res: Response) => {
  const sessionId = getSessionId(req);
  const { application_id } = req.query;

  let draft;
  if (application_id && typeof application_id === 'string') {
    draft = DraftModel.findBySessionAndApplication(sessionId, application_id);
  } else {
    draft = DraftModel.findBySessionId(sessionId);
  }

  if (!draft) {
    notFound(res, '暂无草稿');
    return;
  }

  // 尝试解析 form_data JSON
  let parsedData = draft.form_data;
  try {
    parsedData = JSON.parse(draft.form_data);
  } catch {
    // form_data 不是 JSON，保持原样返回
  }

  ok(res, { ...draft, form_data: parsedData });
});

// DELETE /api/drafts — 删除草稿
draftRouter.delete('/', (req: Request, res: Response) => {
  const sessionId = getSessionId(req);
  const { application_id } = req.query;

  if (application_id && typeof application_id === 'string') {
    DraftModel.deleteBySessionAndApplication(sessionId, application_id);
  } else {
    DraftModel.deleteBySessionAndApplication(sessionId, null);
  }

  ok(res, null, '草稿已删除');
});
