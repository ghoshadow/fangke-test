import express, { Express } from 'express';
import cors from 'cors';
import { initDatabase } from './config';
import { errorHandler } from './middleware/response';
import applicationRoutes from './routes/application';
import approvalRoutes from './routes/approval';
import passRoutes from './routes/pass';
import recordRoutes from './routes/record';
import draftRoutes from './routes/draft';
import departmentRoutes from './routes/department';

export { initDatabase };

export function createApp(): Express {
  const app = express();

  // 中间件
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // 路由注册
  app.use('/api/applications', applicationRoutes);
  app.use('/api/approvals', approvalRoutes);
  app.use('/api/passes', passRoutes);
  app.use('/api/records', recordRoutes);
  app.use('/api/drafts', draftRoutes);
  app.use('/api/departments', departmentRoutes);

  // 健康检查
  app.get('/api/health', (_req, res) => {
    res.json({ code: 0, msg: 'ok', data: { status: 'running' } });
  });

  // 全局错误处理
  app.use(errorHandler);

  return app;
}

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

async function main() {
  // 初始化数据库（内存 SQLite）
  await initDatabase();
  console.log('✅ 数据库初始化完成');

  const app = createApp();

  app.listen(PORT, () => {
    console.log(`🚀 后端服务已启动: http://localhost:${PORT}`);
  });
}

// 仅在直接运行时启动服务，被 import 时不启动
const isDirectRun =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('/app.ts') || process.argv[1].endsWith('/app.js'));

if (isDirectRun) {
  main().catch((err) => {
    console.error('❌ 启动失败:', err);
    process.exit(1);
  });
}

// 用于 supertest 的默认导出
export default createApp();
