import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { initDatabase } from './config';
import { departmentRouter } from './routes/department';
import { applicationRouter } from './routes/application';
import { approvalRouter } from './routes/approval';
import { passRouter } from './routes/pass';
import { recordRouter } from './routes/record';
import { draftRouter } from './routes/draft';
import type { ApiResponse } from '@shared/types';

// ============================================================
// Express 应用初始化
// ============================================================

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// ---------- 中间件 ----------

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// ---------- Session ID 中间件 ----------
// 无登录系统：通过请求头 X-Session-Id 标识用户身份
// 若未提供则自动生成一个临时 ID

app.use((req, _res, next) => {
  if (!req.headers['x-session-id']) {
    // 前端 api-client 应在首次请求时生成并持久化 session_id
    // 这里仅为兜底，确保后端不会因缺少 session_id 而崩溃
    (req as express.Request & { sessionId: string }).sessionId = 'anonymous';
  } else {
    (req as express.Request & { sessionId: string }).sessionId =
      req.headers['x-session-id'] as string;
  }
  next();
});

// ---------- 文件上传（multer） ----------

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`不支持的文件类型: ${file.mimetype}`));
    }
  },
});

// ---------- 静态文件服务（上传的文件可通过 URL 访问） ----------

app.use('/uploads', express.static(UPLOAD_DIR));

// ---------- API 路由 ----------

app.use('/api/departments', departmentRouter);
app.use('/api/applications', applicationRouter(upload));
app.use('/api/approval', approvalRouter);
app.use('/api/passes', passRouter);
app.use('/api/records', recordRouter);
app.use('/api/drafts', draftRouter);

// ---------- 健康检查 ----------

app.get('/api/health', (_req, res) => {
  const body: ApiResponse = { code: 0, msg: 'ok', data: null };
  res.json(body);
});

// ---------- 全局错误处理 ----------

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server Error]', err.message);

  if (err instanceof multer.MulterError) {
    const body: ApiResponse = { code: 400, msg: `上传失败: ${err.message}`, data: null };
    res.status(400).json(body);
    return;
  }

  const body: ApiResponse = {
    code: 500,
    msg: process.env.NODE_ENV === 'production' ? '服务器内部错误' : err.message,
    data: null,
  };
  res.status(500).json(body);
});

// ---------- 启动（仅直接运行时启动，测试导入时不启动） ----------

const isMainModule =
  typeof require !== 'undefined'
    ? require.main === module
    : import.meta.url === `file://${process.argv[1]}`;

async function start() {
  try {
    await initDatabase();
    console.log('[DB] 数据库初始化完成');

    app.listen(PORT, () => {
      console.log(`[Server] 后端服务已启动: http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('[Server] 启动失败:', err);
    process.exit(1);
  }
}

if (isMainModule) {
  start();
}

export { initDatabase };
export default app;
