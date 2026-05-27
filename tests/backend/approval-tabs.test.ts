import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app, { initDatabase } from '../../src/backend/app';

// ============================================================
// FK-31: 三Tab审批列表分类视图测试
// 覆盖8个测试场景:
// 1. 切换到"待我处理"Tab → 仅展示审批状态=待审批的记录
// 2. 切换到"我创建的"Tab → 展示当前用户提交的所有记录（不限状态）
// 3. 切换到"我已处理"Tab → 展示当前用户处理过的所有记录
// 4. Tab切换时筛选条件 → 自动重置，不保留上一Tab条件
// 5. 列表按提交时间排序 → 默认按提交时间倒序（最新在前）
// 6. 待处理列表为空 → 展示空状态提示
// 7. 按访客姓名+审批状态组合筛选 → AND逻辑过滤，倒序排列
// 8. 按手机号/预约时间段筛选 → 支持模糊匹配，结果符合条件
// ============================================================

const CREATOR_SESSION = 'fk31-creator-session';
const APPROVER_SESSION = 'fk31-approver-session';
const OTHER_SESSION = 'fk31-other-session';

describe('FK-31: 三Tab审批列表分类视图', () => {
  let deptId: string;
  let pendingAppId: string;    // 保持 pending 状态
  let approvedAppId: string;   // 将被 approved
  let returnedAppId: string;   // 将被 returned
  let rejectedAppId: string;   // 将被 rejected
  let otherUserAppId: string;  // 另一个用户创建的申请

  beforeAll(async () => {
    await initDatabase();

    // 获取部门 ID
    const deptsRes = await request(app).get('/api/departments');
    deptId = deptsRes.body.data[0].id;

    // --- 创建测试数据 ---

    // 申请1: 保持 pending 状态（由 CREATOR_SESSION 创建）
    const res1 = await request(app)
      .post('/api/applications')
      .send({
        visitor_name: '张三',
        phone: '13800001111',
        visitor_count: 1,
        is_driving: false,
        contact_person: '李教授',
        department_id: deptId,
        visit_start_time: '2024-06-01T09:00:00.000Z',
        visit_end_time: '2024-06-01T17:00:00.000Z',
        visit_purpose: '学术交流',
        session_id: CREATOR_SESSION,
      });
    pendingAppId = res1.body.data.id;

    // 申请2: 将被 APPROVER_SESSION 同意（由 CREATOR_SESSION 创建）
    const res2 = await request(app)
      .post('/api/applications')
      .send({
        visitor_name: '李四',
        phone: '13800002222',
        visitor_count: 2,
        is_driving: true,
        license_plate: '京A12345',
        contact_person: '王处长',
        department_id: deptId,
        visit_start_time: '2024-06-02T10:00:00.000Z',
        visit_end_time: '2024-06-02T16:00:00.000Z',
        visit_purpose: '项目汇报',
        session_id: CREATOR_SESSION,
      });
    approvedAppId = res2.body.data.id;

    // 申请3: 将被 APPROVER_SESSION 退回（由 CREATOR_SESSION 创建）
    const res3 = await request(app)
      .post('/api/applications')
      .send({
        visitor_name: '王五',
        phone: '13800003333',
        visitor_count: 1,
        is_driving: false,
        contact_person: '赵主任',
        department_id: deptId,
        visit_start_time: '2024-06-03T14:00:00.000Z',
        visit_end_time: '2024-06-03T17:00:00.000Z',
        visit_purpose: '合同签署',
        session_id: CREATOR_SESSION,
      });
    returnedAppId = res3.body.data.id;

    // 申请4: 将被 APPROVER_SESSION 拒绝（由 CREATOR_SESSION 创建）
    const res4 = await request(app)
      .post('/api/applications')
      .send({
        visitor_name: '赵六',
        phone: '13800004444',
        visitor_count: 3,
        is_driving: false,
        contact_person: '钱院长',
        department_id: deptId,
        visit_start_time: '2024-06-04T08:00:00.000Z',
        visit_end_time: '2024-06-04T12:00:00.000Z',
        visit_purpose: '校园参观',
        session_id: CREATOR_SESSION,
      });
    rejectedAppId = res4.body.data.id;

    // 申请5: 由 OTHER_SESSION 创建（保持 pending）
    const res5 = await request(app)
      .post('/api/applications')
      .send({
        visitor_name: '周七',
        phone: '13800005555',
        visitor_count: 1,
        is_driving: false,
        contact_person: '孙老师',
        department_id: deptId,
        visit_start_time: '2024-06-05T09:00:00.000Z',
        visit_end_time: '2024-06-05T17:00:00.000Z',
        visit_purpose: '面试',
        session_id: OTHER_SESSION,
      });
    otherUserAppId = res5.body.data.id;

    // --- 执行审批操作 ---

    // 同意申请2
    await request(app)
      .post(`/api/approvals/${approvedAppId}/approve`)
      .set({ 'X-Session-Id': APPROVER_SESSION })
      .send({ operator_session_id: APPROVER_SESSION });

    // 退回申请3
    await request(app)
      .post(`/api/approvals/${returnedAppId}/return`)
      .set({ 'X-Session-Id': APPROVER_SESSION })
      .send({ operator_session_id: APPROVER_SESSION, reason: '信息不完整，请补充' });

    // 拒绝申请4
    await request(app)
      .post(`/api/approvals/${rejectedAppId}/reject`)
      .set({ 'X-Session-Id': APPROVER_SESSION })
      .send({ operator_session_id: APPROVER_SESSION, reason: '不符合入校条件' });
  });

  // ============================================================
  // 场景1: 切换到"待我处理"Tab — 仅展示审批状态=待审批的记录
  // ============================================================
  describe('场景1: 待我处理 Tab (GET /api/approvals/pending)', () => {
    it('仅返回 pending 状态的申请', async () => {
      const res = await request(app).get('/api/approvals/pending');
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data).toHaveProperty('items');
      expect(res.body.data).toHaveProperty('total');

      const items = res.body.data.items;
      expect(items.length).toBeGreaterThanOrEqual(2); // pendingAppId + otherUserAppId

      // 所有返回的记录都必须是 pending 状态
      const allPending = items.every(
        (a: { approval_status: string }) => a.approval_status === 'pending'
      );
      expect(allPending).toBe(true);

      // 必须包含我们创建的 pending 申请
      const ids = items.map((a: { id: string }) => a.id);
      expect(ids).toContain(pendingAppId);
      expect(ids).toContain(otherUserAppId);

      // 不应包含已审批/退回/拒绝的申请
      expect(ids).not.toContain(approvedAppId);
      expect(ids).not.toContain(returnedAppId);
      expect(ids).not.toContain(rejectedAppId);
    });
  });

  // ============================================================
  // 场景2: 切换到"我创建的"Tab — 展示当前用户提交的所有记录（不限状态）
  // ============================================================
  describe('场景2: 我创建的 Tab (GET /api/approvals/created)', () => {
    it('返回当前用户创建的所有申请（不限状态）', async () => {
      const res = await request(app)
        .get('/api/approvals/created')
        .query({ session_id: CREATOR_SESSION });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);

      const items = res.body.data.items;
      // CREATOR_SESSION 创建了4个申请：pending, approved, returned, rejected
      expect(items.length).toBe(4);

      // 应包含所有状态的申请
      const ids = items.map((a: { id: string }) => a.id);
      expect(ids).toContain(pendingAppId);
      expect(ids).toContain(approvedAppId);
      expect(ids).toContain(returnedAppId);
      expect(ids).toContain(rejectedAppId);

      // 不应包含其他用户的申请
      expect(ids).not.toContain(otherUserAppId);

      // 验证状态多样性
      const statuses = items.map((a: { approval_status: string }) => a.approval_status);
      expect(statuses).toContain('pending');
      expect(statuses).toContain('approved');
      expect(statuses).toContain('returned');
      expect(statuses).toContain('rejected');
    });

    it('不传 session_id 时返回空列表', async () => {
      const res = await request(app).get('/api/approvals/created');
      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.total).toBe(0);
    });

    it('另一个用户只看到自己创建的申请', async () => {
      const res = await request(app)
        .get('/api/approvals/created')
        .query({ session_id: OTHER_SESSION });

      expect(res.status).toBe(200);
      const items = res.body.data.items;
      expect(items.length).toBe(1);
      expect(items[0].id).toBe(otherUserAppId);
    });
  });

  // ============================================================
  // 场景3: 切换到"我已处理"Tab — 展示当前用户处理过的所有记录
  // ============================================================
  describe('场景3: 我已处理 Tab (GET /api/approvals/processed)', () => {
    it('返回当前用户处理过的所有申请', async () => {
      const res = await request(app)
        .get('/api/approvals/processed')
        .query({ session_id: APPROVER_SESSION });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);

      const items = res.body.data.items;
      // APPROVER_SESSION 处理了3个申请：approved, returned, rejected
      expect(items.length).toBe(3);

      const ids = items.map((a: { id: string }) => a.id);
      expect(ids).toContain(approvedAppId);
      expect(ids).toContain(returnedAppId);
      expect(ids).toContain(rejectedAppId);

      // 不应包含未处理的 pending 申请
      expect(ids).not.toContain(pendingAppId);
      expect(ids).not.toContain(otherUserAppId);
    });

    it('不传 session_id 时返回空列表', async () => {
      const res = await request(app).get('/api/approvals/processed');
      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.total).toBe(0);
    });

    it('未处理过任何申请的用户返回空列表', async () => {
      const res = await request(app)
        .get('/api/approvals/processed')
        .query({ session_id: 'no-action-session' });

      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.total).toBe(0);
    });
  });

  // ============================================================
  // 场景4: Tab切换时筛选条件 — 自动重置，不保留上一Tab条件
  // (后端验证：各Tab端点独立接受筛选参数，互不影响)
  // ============================================================
  describe('场景4: 各Tab筛选条件独立（不互相影响）', () => {
    it('pending Tab 带筛选条件不影响 created Tab 的结果', async () => {
      // 先在 pending Tab 使用 name 筛选
      const pendingRes = await request(app)
        .get('/api/approvals/pending')
        .query({ name: '张三' });

      expect(pendingRes.status).toBe(200);
      const pendingItems = pendingRes.body.data.items;
      expect(pendingItems.length).toBe(1);
      expect(pendingItems[0].visitor_name).toBe('张三');

      // 然后切换到 created Tab，不带任何筛选条件 — 应返回所有记录
      const createdRes = await request(app)
        .get('/api/approvals/created')
        .query({ session_id: CREATOR_SESSION });

      expect(createdRes.status).toBe(200);
      expect(createdRes.body.data.items.length).toBe(4);
    });

    it('created Tab 带 status 筛选不影响 processed Tab 的结果', async () => {
      // 在 created Tab 使用 status=pending 筛选
      const createdRes = await request(app)
        .get('/api/approvals/created')
        .query({ session_id: CREATOR_SESSION, status: 'pending' });

      expect(createdRes.status).toBe(200);
      expect(createdRes.body.data.items.length).toBe(1);

      // processed Tab 不带筛选条件 — 应返回所有已处理的记录
      const processedRes = await request(app)
        .get('/api/approvals/processed')
        .query({ session_id: APPROVER_SESSION });

      expect(processedRes.status).toBe(200);
      expect(processedRes.body.data.items.length).toBe(3);
    });

    it('同一筛选条件在不同 Tab 产生不同的结果集', async () => {
      const nameFilter = '李四';

      // pending Tab 筛选"李四" — 李四已 approved，所以不应出现
      const pendingRes = await request(app)
        .get('/api/approvals/pending')
        .query({ name: nameFilter });
      expect(pendingRes.body.data.items.length).toBe(0);

      // created Tab 筛选"李四" — 应找到
      const createdRes = await request(app)
        .get('/api/approvals/created')
        .query({ session_id: CREATOR_SESSION, name: nameFilter });
      expect(createdRes.body.data.items.length).toBe(1);
      expect(createdRes.body.data.items[0].visitor_name).toBe('李四');

      // processed Tab 筛选"李四" — 李四已被 APPROVER_SESSION 处理，应找到
      const processedRes = await request(app)
        .get('/api/approvals/processed')
        .query({ session_id: APPROVER_SESSION, name: nameFilter });
      expect(processedRes.body.data.items.length).toBe(1);
      expect(processedRes.body.data.items[0].visitor_name).toBe('李四');
    });
  });

  // ============================================================
  // 场景5: 列表按提交时间排序 — 默认按提交时间倒序（最新在前）
  // ============================================================
  describe('场景5: 列表按提交时间倒序排列', () => {
    it('pending Tab 按 created_at 倒序排列', async () => {
      const res = await request(app).get('/api/approvals/pending');
      expect(res.status).toBe(200);

      const items = res.body.data.items;
      if (items.length >= 2) {
        for (let i = 0; i < items.length - 1; i++) {
          const current = new Date(items[i].created_at).getTime();
          const next = new Date(items[i + 1].created_at).getTime();
          expect(current).toBeGreaterThanOrEqual(next);
        }
      }
    });

    it('created Tab 按 created_at 倒序排列', async () => {
      const res = await request(app)
        .get('/api/approvals/created')
        .query({ session_id: CREATOR_SESSION });

      expect(res.status).toBe(200);

      const items = res.body.data.items;
      expect(items.length).toBe(4);
      for (let i = 0; i < items.length - 1; i++) {
        const current = new Date(items[i].created_at).getTime();
        const next = new Date(items[i + 1].created_at).getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });

    it('processed Tab 按 created_at 倒序排列', async () => {
      const res = await request(app)
        .get('/api/approvals/processed')
        .query({ session_id: APPROVER_SESSION });

      expect(res.status).toBe(200);

      const items = res.body.data.items;
      expect(items.length).toBe(3);
      for (let i = 0; i < items.length - 1; i++) {
        const current = new Date(items[i].created_at).getTime();
        const next = new Date(items[i + 1].created_at).getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });
  });

  // ============================================================
  // 场景6: 待处理列表为空 — 展示空状态
  // ============================================================
  describe('场景6: 列表为空时返回空数据', () => {
    it('pending Tab 筛选后无结果时返回空列表', async () => {
      const res = await request(app)
        .get('/api/approvals/pending')
        .query({ name: '不存在的访客姓名' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.total).toBe(0);
    });

    it('created Tab 使用不存在的 session 时返回空列表', async () => {
      const res = await request(app)
        .get('/api/approvals/created')
        .query({ session_id: 'nonexistent-session-fk31' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.total).toBe(0);
    });

    it('processed Tab 无处理记录时返回空列表', async () => {
      const res = await request(app)
        .get('/api/approvals/processed')
        .query({ session_id: CREATOR_SESSION }); // CREATOR 未处理过任何申请

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.total).toBe(0);
    });

    it('空列表响应包含正确的分页结构', async () => {
      const res = await request(app)
        .get('/api/approvals/pending')
        .query({ name: '不存在的访客姓名' });

      expect(res.body.data).toHaveProperty('items');
      expect(res.body.data).toHaveProperty('total');
      expect(res.body.data).toHaveProperty('page');
      expect(res.body.data).toHaveProperty('page_size');
    });
  });

  // ============================================================
  // 场景7: 按访客姓名+审批状态组合筛选 — AND逻辑过滤，倒序排列
  // ============================================================
  describe('场景7: 组合筛选（AND逻辑）', () => {
    it('created Tab: 姓名 + 状态 组合筛选返回交集', async () => {
      // 筛选姓名包含"张"且状态为 pending
      const res = await request(app)
        .get('/api/approvals/created')
        .query({
          session_id: CREATOR_SESSION,
          name: '张',
          status: 'pending',
        });

      expect(res.status).toBe(200);
      const items = res.body.data.items;
      expect(items.length).toBe(1);
      expect(items[0].visitor_name).toBe('张三');
      expect(items[0].approval_status).toBe('pending');
    });

    it('created Tab: 姓名匹配但不满足状态时无结果', async () => {
      // 筛选姓名包含"张"且状态为 approved — 张三是 pending，不应匹配
      const res = await request(app)
        .get('/api/approvals/created')
        .query({
          session_id: CREATOR_SESSION,
          name: '张',
          status: 'approved',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual([]);
    });

    it('processed Tab: 姓名 + 状态 组合筛选', async () => {
      // 筛选姓名包含"李"且状态为 approved
      const res = await request(app)
        .get('/api/approvals/processed')
        .query({
          session_id: APPROVER_SESSION,
          name: '李',
          status: 'approved',
        });

      expect(res.status).toBe(200);
      const items = res.body.data.items;
      expect(items.length).toBe(1);
      expect(items[0].visitor_name).toBe('李四');
      expect(items[0].approval_status).toBe('approved');
    });

    it('processed Tab: 状态筛选返回多个结果时按时间倒序', async () => {
      // 仅按状态筛选（不限制姓名），processed 中有 approved/returned/rejected
      const res = await request(app)
        .get('/api/approvals/processed')
        .query({ session_id: APPROVER_SESSION });

      expect(res.status).toBe(200);
      const items = res.body.data.items;
      expect(items.length).toBe(3);

      // 验证倒序
      for (let i = 0; i < items.length - 1; i++) {
        const current = new Date(items[i].created_at).getTime();
        const next = new Date(items[i + 1].created_at).getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });
  });

  // ============================================================
  // 场景8: 按手机号/预约时间段筛选
  // ============================================================
  describe('场景8: 手机号与预约时间段筛选', () => {
    it('pending Tab: 按手机号精确筛选', async () => {
      const res = await request(app)
        .get('/api/approvals/pending')
        .query({ phone: '13800001111' });

      expect(res.status).toBe(200);
      const items = res.body.data.items;
      expect(items.length).toBe(1);
      expect(items[0].phone).toBe('13800001111');
      expect(items[0].visitor_name).toBe('张三');
    });

    it('created Tab: 按手机号筛选', async () => {
      const res = await request(app)
        .get('/api/approvals/created')
        .query({ session_id: CREATOR_SESSION, phone: '13800002222' });

      expect(res.status).toBe(200);
      const items = res.body.data.items;
      expect(items.length).toBe(1);
      expect(items[0].visitor_name).toBe('李四');
    });

    it('手机号不匹配时返回空列表', async () => {
      const res = await request(app)
        .get('/api/approvals/pending')
        .query({ phone: '19999999999' });

      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual([]);
    });

    it('pending Tab: 按预约时间段筛选 (date_from + date_to)', async () => {
      const res = await request(app)
        .get('/api/approvals/pending')
        .query({
          date_from: '2024-06-01',
          date_to: '2024-06-01',
        });

      expect(res.status).toBe(200);
      const items = res.body.data.items;
      // 只有张三的申请在 2024-06-01（且为 pending）
      expect(items.length).toBeGreaterThanOrEqual(1);
      const found = items.find((a: { id: string }) => a.id === pendingAppId);
      expect(found).toBeDefined();
      expect(found.visitor_name).toBe('张三');
    });

    it('created Tab: 按预约时间段筛选', async () => {
      const res = await request(app)
        .get('/api/approvals/created')
        .query({
          session_id: CREATOR_SESSION,
          date_from: '2024-06-02',
          date_to: '2024-06-03',
        });

      expect(res.status).toBe(200);
      const items = res.body.data.items;
      // 李四(6/2) 和 王五(6/3) 应匹配
      expect(items.length).toBe(2);
      const names = items.map((a: { visitor_name: string }) => a.visitor_name);
      expect(names).toContain('李四');
      expect(names).toContain('王五');
    });

    it('processed Tab: 按预约时间段筛选', async () => {
      const res = await request(app)
        .get('/api/approvals/processed')
        .query({
          session_id: APPROVER_SESSION,
          date_from: '2024-06-04',
          date_to: '2024-06-04',
        });

      expect(res.status).toBe(200);
      const items = res.body.data.items;
      // 只有赵六(6/4) 应匹配
      expect(items.length).toBe(1);
      expect(items[0].visitor_name).toBe('赵六');
    });

    it('时间段筛选超出范围时返回空列表', async () => {
      const res = await request(app)
        .get('/api/approvals/pending')
        .query({
          date_from: '2025-01-01',
          date_to: '2025-12-31',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual([]);
    });
  });
});
