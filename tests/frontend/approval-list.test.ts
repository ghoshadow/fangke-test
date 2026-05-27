import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app, { initDatabase } from '../../src/backend/app';

// ============================================================
// FK-42: 前端审批列表行为测试 (US011)
// 验证前端列表页所依赖的 API 契约
// 共 5 个测试用例
// ============================================================

const SESSION = 'fk42-frontend-list-session';
const APPROVER = 'fk42-frontend-list-approver';

let deptId: string;
let pendingApp1: string;
let pendingApp2: string;
let approvedApp: string;

/** 快速创建申请 */
async function createApp(
  session: string,
  visitorName: string,
  phone: string,
  visitDate: string,
) {
  const res = await request(app)
    .post('/api/applications')
    .send({
      session_id: session,
      visitor_name: visitorName,
      phone,
      visitor_count: 1,
      is_driving: false,
      contact_person: '对接人',
      department_id: deptId,
      visit_start_time: `${visitDate}T09:00:00.000Z`,
      visit_end_time: `${visitDate}T17:00:00.000Z`,
      visit_purpose: 'US011前端列表测试',
    });
  expect(res.body.code).toBe(0);
  return res.body.data.id as string;
}

describe('FK-42 前端审批列表测试 (US011)', () => {
  beforeAll(async () => {
    await initDatabase();

    const deptsRes = await request(app).get('/api/departments');
    deptId = deptsRes.body.data[0].id;

    // 创建多条不同时间的 pending 申请
    pendingApp1 = await createApp(SESSION, '前端列表访客一', '13800100001', '2025-06-10');
    // 短暂延迟确保 created_at 不同
    pendingApp2 = await createApp(SESSION, '前端列表访客二', '13800100002', '2025-06-15');

    // 创建并同意一条申请
    approvedApp = await createApp(SESSION, '已同意访客', '13800100003', '2025-06-20');
    await request(app)
      .post(`/api/approvals/${approvedApp}/approve`)
      .send({ operator_session_id: APPROVER });
  });

  // #1 US011-正常流程：筛选并查看待处理审批列表
  it('#1 待处理 Tab 返回完整字段结构，每行含访客姓名、手机号、对接人、拜访时间、到访事宜、审批状态', async () => {
    const res = await request(app).get('/api/approvals/pending');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);

    const items = res.body.data.items;
    expect(items.length).toBeGreaterThanOrEqual(2);

    // 验证响应包含前端列表所需的所有字段
    const item = items.find((a: { id: string }) => a.id === pendingApp1);
    expect(item).toBeDefined();
    expect(item.visitor_name).toBe('前端列表访客一');
    expect(item.phone).toBe('13800100001');
    expect(item.contact_person).toBe('对接人');
    expect(item.visit_start_time).toContain('2025-06-10');
    expect(item.visit_end_time).toContain('2025-06-10');
    expect(item.visit_purpose).toBe('US011前端列表测试');
    expect(item.approval_status).toBe('pending');

    // 所有记录必须是 pending
    for (const i of items) {
      expect(i.approval_status).toBe('pending');
    }
  });

  // #2 US011-正常流程：使用筛选条件过滤待处理列表
  it('#2 多筛选条件 AND 组合：访客姓名 + 手机号 + 预约时间段联合过滤', async () => {
    // 姓名 + 手机号 匹配
    const matchRes = await request(app)
      .get('/api/approvals/pending')
      .query({ name: '前端列表访客一', phone: '13800100001' });

    expect(matchRes.body.code).toBe(0);
    expect(matchRes.body.data.items.length).toBe(1);
    expect(matchRes.body.data.items[0].id).toBe(pendingApp1);

    // 姓名匹配 + 手机号不匹配 → 空
    const noMatchRes = await request(app)
      .get('/api/approvals/pending')
      .query({ name: '前端列表访客一', phone: '13800100002' });

    expect(noMatchRes.body.code).toBe(0);
    expect(noMatchRes.body.data.items).toHaveLength(0);

    // 时间段筛选
    const dateRes = await request(app)
      .get('/api/approvals/pending')
      .query({ date_from: '2025-06-15', date_to: '2025-06-15' });

    expect(dateRes.body.code).toBe(0);
    const dateItems = dateRes.body.data.items;
    const found = dateItems.find((a: { id: string }) => a.id === pendingApp2);
    expect(found).toBeDefined();

    // 结果仍按时间倒序
    for (let i = 0; i < dateItems.length - 1; i++) {
      const curr = new Date(dateItems[i].created_at).getTime();
      const next = new Date(dateItems[i + 1].created_at).getTime();
      expect(curr).toBeGreaterThanOrEqual(next);
    }
  });

  // #3 US011-无效场景：待处理列表加载非待审批记录
  it('#3 待处理列表 API 保证只返回 pending 状态（不混入已处理记录）', async () => {
    const res = await request(app).get('/api/approvals/pending');
    expect(res.body.code).toBe(0);

    const items = res.body.data.items;
    const ids = items.map((a: { id: string }) => a.id);

    // 已同意的申请不应出现在 pending 列表
    expect(ids).not.toContain(approvedApp);

    // 所有记录状态必须为 pending
    const allPending = items.every(
      (a: { approval_status: string }) => a.approval_status === 'pending'
    );
    expect(allPending).toBe(true);
  });

  // #4 US011-无效场景：Tab切换传递错误分类参数
  it('#4 传递非 pending/created/processed 的路径参数时返回 404', async () => {
    // 无效路径
    const res1 = await request(app).get('/api/approvals/invalid');
    expect(res1.status).toBe(404);

    const res2 = await request(app).get('/api/approvals/unknown');
    expect(res2.status).toBe(404);

    const res3 = await request(app).get('/api/approvals/%E5%AE%A1%E6%A0%B8%E4%B8%AD');
    expect(res3.status).toBe(404);
  });

  // #5 US011-无效场景：列表未按提交时间降序排列
  it('#5 待处理列表严格按 created_at 降序排列（最新在前）', async () => {
    const res = await request(app).get('/api/approvals/pending');
    expect(res.body.code).toBe(0);

    const items = res.body.data.items;
    if (items.length >= 2) {
      for (let i = 0; i < items.length - 1; i++) {
        const curr = new Date(items[i].created_at).getTime();
        const next = new Date(items[i + 1].created_at).getTime();
        expect(curr).toBeGreaterThanOrEqual(next);
      }
    }

    // 验证我创建的列表也是倒序
    const createdRes = await request(app)
      .get('/api/approvals/created')
      .query({ session_id: SESSION });
    const createdItems = createdRes.body.data.items;
    if (createdItems.length >= 2) {
      for (let i = 0; i < createdItems.length - 1; i++) {
        const curr = new Date(createdItems[i].created_at).getTime();
        const next = new Date(createdItems[i + 1].created_at).getTime();
        expect(curr).toBeGreaterThanOrEqual(next);
      }
    }
  });
});
