import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app, { initDatabase } from '../../src/backend/app';

// ============================================================
// FK-42: 后端审批API综合测试
// 覆盖 US011 (三Tab审批列表) + US012 (审批详情页)
// 共 9 个测试用例
// ============================================================

const SESSION_A = 'fk42-backend-session-a';
const SESSION_B = 'fk42-backend-session-b';
const APPROVER = 'fk42-backend-approver';

let deptId: string;

// 测试用申请 ID
let pendingApp1: string;
let pendingApp2: string;
let approvedApp: string;
let returnedApp: string;
let rejectedApp: string;
let sessionBApp: string;

/** 快速创建一条申请 */
async function createApplication(session: string, visitorName: string, phone: string) {
  const res = await request(app)
    .post('/api/applications')
    .send({
      session_id: session,
      visitor_name: visitorName,
      phone,
      id_card: '110101199001011234',
      company: '测试单位',
      visitor_count: 2,
      is_driving: false,
      contact_person: '对接人',
      department_id: deptId,
      visit_start_time: '2025-06-15T09:00:00.000Z',
      visit_end_time: '2025-06-15T17:00:00.000Z',
      visit_purpose: 'US011-US012测试',
    });
  expect(res.body.code).toBe(0);
  return res.body.data.id as string;
}

describe('FK-42 后端审批API测试 (US011 + US012)', () => {
  beforeAll(async () => {
    await initDatabase();

    // 获取部门 ID
    const deptsRes = await request(app).get('/api/departments');
    deptId = deptsRes.body.data[0].id;

    // 创建 SESSION_A 的申请
    pendingApp1 = await createApplication(SESSION_A, '张三', '13800138000');
    pendingApp2 = await createApplication(SESSION_A, '李四', '13900139000');
    approvedApp = await createApplication(SESSION_A, '王五', '13700137000');
    returnedApp = await createApplication(SESSION_A, '赵六', '13600136000');
    rejectedApp = await createApplication(SESSION_A, '钱七', '13500135000');

    // 创建 SESSION_B 的申请
    sessionBApp = await createApplication(SESSION_B, '孙八', '13400134000');

    // 执行审批操作
    await request(app)
      .post(`/api/approvals/${approvedApp}/approve`)
      .send({ operator_session_id: APPROVER });

    await request(app)
      .post(`/api/approvals/${returnedApp}/return`)
      .send({ operator_session_id: APPROVER, reason: '信息不完整' });

    await request(app)
      .post(`/api/approvals/${rejectedApp}/reject`)
      .send({ operator_session_id: APPROVER, reason: '不符合入校条件' });
  });

  // ============================================================
  // US011: 三Tab审批列表分类视图
  // ============================================================
  describe('US011: 三Tab审批列表分类视图', () => {
    // #1 正常流程：筛选并查看待处理审批列表
    it('#1 待处理列表仅返回 pending 状态记录，含完整字段，按提交时间倒序', async () => {
      const res = await request(app).get('/api/approvals/pending');

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data).toHaveProperty('items');
      expect(res.body.data).toHaveProperty('total');

      const items = res.body.data.items;
      expect(items.length).toBeGreaterThanOrEqual(2);

      // 所有记录必须是 pending 状态
      for (const item of items) {
        expect(item.approval_status).toBe('pending');
      }

      // 必须包含我们的 pending 申请
      const ids = items.map((a: { id: string }) => a.id);
      expect(ids).toContain(pendingApp1);
      expect(ids).toContain(pendingApp2);
      expect(ids).toContain(sessionBApp);

      // 不应包含已处理的申请
      expect(ids).not.toContain(approvedApp);
      expect(ids).not.toContain(returnedApp);
      expect(ids).not.toContain(rejectedApp);

      // 每条记录含完整字段
      const first = items[0];
      expect(first).toHaveProperty('visitor_name');
      expect(first).toHaveProperty('phone');
      expect(first).toHaveProperty('contact_person');
      expect(first).toHaveProperty('visit_start_time');
      expect(first).toHaveProperty('visit_end_time');
      expect(first).toHaveProperty('visit_purpose');
      expect(first).toHaveProperty('approval_status');

      // 按提交时间倒序
      for (let i = 0; i < items.length - 1; i++) {
        const current = new Date(items[i].created_at).getTime();
        const next = new Date(items[i + 1].created_at).getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });

    // #2 正常流程：使用筛选条件过滤待处理列表
    it('#2 使用访客姓名+手机号组合筛选，AND逻辑过滤，结果按时间倒序', async () => {
      // 按姓名筛选
      const nameRes = await request(app)
        .get('/api/approvals/pending')
        .query({ name: '张三' });

      expect(nameRes.body.code).toBe(0);
      const nameItems = nameRes.body.data.items;
      expect(nameItems.length).toBe(1);
      expect(nameItems[0].visitor_name).toBe('张三');
      expect(nameItems[0].approval_status).toBe('pending');

      // 按手机号筛选
      const phoneRes = await request(app)
        .get('/api/approvals/pending')
        .query({ phone: '13800138000' });

      expect(phoneRes.body.code).toBe(0);
      const phoneItems = phoneRes.body.data.items;
      expect(phoneItems.length).toBe(1);
      expect(phoneItems[0].phone).toBe('13800138000');

      // 姓名+手机号 AND 组合（匹配）
      const bothRes = await request(app)
        .get('/api/approvals/pending')
        .query({ name: '张三', phone: '13800138000' });

      expect(bothRes.body.code).toBe(0);
      expect(bothRes.body.data.items.length).toBe(1);

      // 姓名+手机号 AND 组合（不匹配）
      const noMatchRes = await request(app)
        .get('/api/approvals/pending')
        .query({ name: '张三', phone: '13900139000' });

      expect(noMatchRes.body.code).toBe(0);
      expect(noMatchRes.body.data.items.length).toBe(0);
    });

    // #3 无效场景：待处理列表加载非待审批记录
    it('#3 待处理列表不会返回非 pending 状态的记录（数据完整性校验）', async () => {
      const res = await request(app).get('/api/approvals/pending');
      expect(res.body.code).toBe(0);

      const items = res.body.data.items;
      // 验证所有返回的记录都是 pending 状态（不应有任何非 pending 记录混入）
      const nonPendingItems = items.filter(
        (a: { approval_status: string }) => a.approval_status !== 'pending'
      );
      expect(nonPendingItems).toHaveLength(0);
    });

    // #4 无效场景：Tab切换传递错误分类参数
    it('#4 请求不存在的 Tab 端点时返回 404（错误分类参数防护）', async () => {
      const res = await request(app).get('/api/approvals/invalid_tab');
      expect(res.status).toBe(404);
    });

    // #5 无效场景：列表未按提交时间降序排列
    it('#5 三个 Tab 列表均严格按 created_at 降序排列', async () => {
      // pending Tab
      const pendingRes = await request(app).get('/api/approvals/pending');
      const pendingItems = pendingRes.body.data.items;
      for (let i = 0; i < pendingItems.length - 1; i++) {
        const curr = new Date(pendingItems[i].created_at).getTime();
        const next = new Date(pendingItems[i + 1].created_at).getTime();
        expect(curr).toBeGreaterThanOrEqual(next);
      }

      // created Tab
      const createdRes = await request(app)
        .get('/api/approvals/created')
        .query({ session_id: SESSION_A });
      const createdItems = createdRes.body.data.items;
      for (let i = 0; i < createdItems.length - 1; i++) {
        const curr = new Date(createdItems[i].created_at).getTime();
        const next = new Date(createdItems[i + 1].created_at).getTime();
        expect(curr).toBeGreaterThanOrEqual(next);
      }

      // processed Tab
      const processedRes = await request(app)
        .get('/api/approvals/processed')
        .query({ session_id: APPROVER });
      const processedItems = processedRes.body.data.items;
      for (let i = 0; i < processedItems.length - 1; i++) {
        const curr = new Date(processedItems[i].created_at).getTime();
        const next = new Date(processedItems[i + 1].created_at).getTime();
        expect(curr).toBeGreaterThanOrEqual(next);
      }
    });
  });

  // ============================================================
  // US012: 审批详情页
  // ============================================================
  describe('US012: 审批详情页', () => {
    // #6 正常流程：查看申请完整详情以辅助审批决策
    it('#6 详情页返回完整字段（14字段+审批状态+提交时间）+操作按钮状态正确', async () => {
      const res = await request(app).get(`/api/applications/${pendingApp1}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);

      const data = res.body.data;
      // 14 个必填字段
      expect(data.visitor_name).toBe('张三');
      expect(data.phone).toBe('13800138000');
      expect(data.id_card).toBe('110101199001011234');
      expect(data.company).toBe('测试单位');
      expect(data.visitor_count).toBe(2);
      expect(data.is_driving).toBe(false);
      expect(data.contact_person).toBe('对接人');
      expect(data.department_id).toBe(deptId);
      expect(data.visit_start_time).toBe('2025-06-15T09:00:00.000Z');
      expect(data.visit_end_time).toBe('2025-06-15T17:00:00.000Z');
      expect(data.visit_purpose).toBe('US011-US012测试');
      expect(data).toHaveProperty('attachment_url');
      // 审批状态 + 提交时间
      expect(data.approval_status).toBe('pending');
      expect(data).toHaveProperty('created_at');

      // pending 状态下操作按钮可用（前端判断逻辑）
      expect(data.approval_status).toBe('pending');
    });

    // #7 无效场景：详情页数据加载不完整
    it('#7 详情接口返回的所有必填字段不为 null/undefined（数据完整性校验）', async () => {
      const res = await request(app).get(`/api/applications/${pendingApp1}`);
      expect(res.body.code).toBe(0);

      const data = res.body.data;
      const requiredFields = [
        'id', 'visitor_name', 'phone', 'visitor_count', 'is_driving',
        'contact_person', 'department_id', 'visit_start_time',
        'visit_end_time', 'visit_purpose', 'approval_status',
        'session_id', 'version', 'created_at', 'updated_at',
      ];
      for (const field of requiredFields) {
        expect(data[field]).not.toBeNull();
        expect(data[field]).not.toBeUndefined();
      }
    });

    // #8 无效场景：非待审批状态下审批按钮不可用
    it('#8 已同意/已退回/已拒绝的申请详情中 approval_status 非 pending（前端据此禁用按钮）', async () => {
      // 已同意
      const approvedRes = await request(app).get(`/api/applications/${approvedApp}`);
      expect(approvedRes.body.data.approval_status).toBe('approved');
      expect(approvedRes.body.data.approval_status).not.toBe('pending');

      // 已退回
      const returnedRes = await request(app).get(`/api/applications/${returnedApp}`);
      expect(returnedRes.body.data.approval_status).toBe('returned');
      expect(returnedRes.body.data.approval_status).not.toBe('pending');

      // 已拒绝
      const rejectedRes = await request(app).get(`/api/applications/${rejectedApp}`);
      expect(rejectedRes.body.data.approval_status).toBe('rejected');
      expect(rejectedRes.body.data.approval_status).not.toBe('pending');
    });

    // #9 无效场景：附件加载失败
    it('#9 附件字段为 null 时不影响详情正常展示（附件加载容错）', async () => {
      // 创建不带附件的申请
      const res = await request(app)
        .post('/api/applications')
        .send({
          session_id: SESSION_A,
          visitor_name: '无附件访客',
          phone: '13100131000',
          visitor_count: 1,
          is_driving: false,
          contact_person: '对接人',
          department_id: deptId,
          visit_start_time: '2025-06-15T09:00:00.000Z',
          visit_end_time: '2025-06-15T17:00:00.000Z',
          visit_purpose: '测试附件为空场景',
        });
      expect(res.body.code).toBe(0);
      const appId = res.body.data.id;

      // 获取详情，attachment_url 应为 null，其他字段正常
      const detailRes = await request(app).get(`/api/applications/${appId}`);
      expect(detailRes.body.code).toBe(0);
      expect(detailRes.body.data.attachment_url).toBeNull();
      expect(detailRes.body.data.visitor_name).toBe('无附件访客');
      expect(detailRes.body.data.phone).toBe('13100131000');
      expect(detailRes.body.data.approval_status).toBe('pending');
    });
  });
});
