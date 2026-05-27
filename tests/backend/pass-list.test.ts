import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app, { initDatabase } from '../../src/backend/app';

const SESSION_ID = 'pass-list-test-session';
const APPROVER_SESSION = 'pass-list-approver-session';

interface PassItem {
  id: string;
  application_id: string;
  pass_status: string;
  actual_visit_time: string | null;
  created_at: string;
  visitor_name: string;
  phone: string;
  id_card: string | null;
  visit_start_time: string;
  visit_end_time: string;
}

describe('通行证列表概览 (FK-33)', () => {
  let deptId: string;
  let approvedAppId: string;     // 审批通过，未到访
  let visitedAppId: string;      // 审批通过，已到访
  let pendingAppId: string;      // 待审批（不应出现在通行证列表）
  let rejectedAppId: string;     // 已拒绝（不应出现在通行证列表）
  let returnedAppId: string;     // 已退回（不应出现在通行证列表）
  let approvedPassId: string;
  let visitedPassId: string;

  beforeAll(async () => {
    await initDatabase();

    // 获取部门 ID
    const deptsRes = await request(app).get('/api/departments');
    deptId = deptsRes.body.data[0].id;

    // 1. 创建「待审批」申请 —— 不应出现在通行证列表
    const pendingRes = await request(app)
      .post('/api/applications')
      .send({
        visitor_name: '待审批用户',
        phone: '13000000001',
        visitor_count: 1,
        is_driving: false,
        contact_person: '对接人A',
        department_id: deptId,
        visit_start_time: '2024-05-01T09:00:00.000Z',
        visit_end_time: '2024-05-01T12:00:00.000Z',
        visit_purpose: '待审批测试',
        session_id: SESSION_ID,
      });
    pendingAppId = pendingRes.body.data.id;

    // 2. 创建「已拒绝」申请 —— 不应出现在通行证列表
    const rejectedRes = await request(app)
      .post('/api/applications')
      .send({
        visitor_name: '已拒绝用户',
        phone: '13000000002',
        visitor_count: 1,
        is_driving: false,
        contact_person: '对接人B',
        department_id: deptId,
        visit_start_time: '2024-05-02T09:00:00.000Z',
        visit_end_time: '2024-05-02T12:00:00.000Z',
        visit_purpose: '拒绝测试',
        session_id: SESSION_ID,
      });
    rejectedAppId = rejectedRes.body.data.id;

    await request(app)
      .post(`/api/approvals/${rejectedAppId}/reject`)
      .send({ operator_session_id: APPROVER_SESSION, reason: '不符合要求' });

    // 3. 创建「已退回」申请 —— 不应出现在通行证列表
    const returnedRes = await request(app)
      .post('/api/applications')
      .send({
        visitor_name: '已退回用户',
        phone: '13000000003',
        visitor_count: 1,
        is_driving: false,
        contact_person: '对接人C',
        department_id: deptId,
        visit_start_time: '2024-05-03T09:00:00.000Z',
        visit_end_time: '2024-05-03T12:00:00.000Z',
        visit_purpose: '退回测试',
        session_id: SESSION_ID,
      });
    returnedAppId = returnedRes.body.data.id;

    await request(app)
      .post(`/api/approvals/${returnedAppId}/return`)
      .send({ operator_session_id: APPROVER_SESSION, reason: '信息不完整' });

    // 4. 创建并审批通过「未到访」申请 —— 应出现在通行证列表
    const approvedRes = await request(app)
      .post('/api/applications')
      .send({
        visitor_name: '未到访用户',
        phone: '13000000004',
        visitor_count: 2,
        is_driving: false,
        contact_person: '对接人D',
        department_id: deptId,
        visit_start_time: '2024-05-04T09:00:00.000Z',
        visit_end_time: '2024-05-04T17:00:00.000Z',
        visit_purpose: '正常访问',
        session_id: SESSION_ID,
      });
    approvedAppId = approvedRes.body.data.id;

    await request(app)
      .post(`/api/approvals/${approvedAppId}/approve`)
      .send({ operator_session_id: APPROVER_SESSION });

    // 5. 创建并审批通过「已到访」申请 —— 应出现在通行证列表，且显示实际到访时间
    const visitedRes = await request(app)
      .post('/api/applications')
      .send({
        visitor_name: '已到访用户',
        phone: '13000000005',
        visitor_count: 1,
        is_driving: true,
        license_plate: '京A88888',
        contact_person: '对接人E',
        department_id: deptId,
        visit_start_time: '2024-05-05T10:00:00.000Z',
        visit_end_time: '2024-05-05T16:00:00.000Z',
        visit_purpose: '已到访问',
        session_id: SESSION_ID,
      });
    visitedAppId = visitedRes.body.data.id;

    await request(app)
      .post(`/api/approvals/${visitedAppId}/approve`)
      .send({ operator_session_id: APPROVER_SESSION });

    // 确认到访
    const passesRes = await request(app).get('/api/passes');
    const visitedPass = passesRes.body.data.items.find(
      (p: PassItem) => p.application_id === visitedAppId,
    );
    visitedPassId = visitedPass.id;

    await request(app)
      .post(`/api/passes/${visitedPassId}/confirm`)
      .send({ actual_visit_time: '10:25' });

    // 获取未到访的通行证 ID
    const approvedPass = passesRes.body.data.items.find(
      (p: PassItem) => p.application_id === approvedAppId,
    );
    approvedPassId = approvedPass.id;
  });

  // 场景 1：仅展示审批状态=已同意的记录
  describe('场景1: 进入通行证列表', () => {
    it('仅展示审批通过的记录，不包含待审批/已拒绝/已退回的申请', async () => {
      const res = await request(app).get('/api/passes');

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);

      const items: PassItem[] = res.body.data.items;

      // 审批通过的申请应出现在列表中
      const appIds = items.map((p) => p.application_id);
      expect(appIds).toContain(approvedAppId);
      expect(appIds).toContain(visitedAppId);

      // 非审批通过的申请不应出现
      expect(appIds).not.toContain(pendingAppId);
      expect(appIds).not.toContain(rejectedAppId);
      expect(appIds).not.toContain(returnedAppId);
    });
  });

  // 场景 2：列表字段展示
  describe('场景2: 列表字段展示', () => {
    it('每行展示访客姓名、手机号、预约时间段、通行状态', async () => {
      const res = await request(app).get('/api/passes');
      const items: PassItem[] = res.body.data.items;

      const approvedItem = items.find((p) => p.application_id === approvedAppId);
      expect(approvedItem).toBeDefined();

      // 验证必要字段存在且正确
      expect(approvedItem!.visitor_name).toBe('未到访用户');
      expect(approvedItem!.phone).toBe('13000000004');
      expect(approvedItem!.visit_start_time).toBe('2024-05-04T09:00:00.000Z');
      expect(approvedItem!.visit_end_time).toBe('2024-05-04T17:00:00.000Z');
      expect(approvedItem!.pass_status).toBeDefined();
      expect(approvedItem!.id).toBeDefined();
      expect(approvedItem!.application_id).toBeDefined();
      expect(approvedItem!.created_at).toBeDefined();
    });
  });

  // 场景 3：通行状态标识
  describe('场景3: 通行状态标识', () => {
    it('未到访与已到访状态通过不同 pass_status 值清晰区分', async () => {
      const res = await request(app).get('/api/passes');
      const items: PassItem[] = res.body.data.items;

      const notVisitedItem = items.find((p) => p.application_id === approvedAppId);
      const visitedItem = items.find((p) => p.application_id === visitedAppId);

      expect(notVisitedItem).toBeDefined();
      expect(visitedItem).toBeDefined();

      // 未到访状态
      expect(notVisitedItem!.pass_status).toBe('not_visited');

      // 已到访状态
      expect(visitedItem!.pass_status).toBe('visited');

      // 两者状态不同，前端可据此渲染不同颜色/标签
      expect(notVisitedItem!.pass_status).not.toBe(visitedItem!.pass_status);
    });
  });

  // 场景 4：列表排序
  describe('场景4: 列表排序', () => {
    it('默认按创建时间倒序（最新审批的通行证在前）', async () => {
      const res = await request(app).get('/api/passes');
      const items: PassItem[] = res.body.data.items;

      // visitedApp 是在 approvedApp 之后创建并审批的，所以应该排在前面
      const visitedIndex = items.findIndex((p) => p.application_id === visitedAppId);
      const approvedIndex = items.findIndex((p) => p.application_id === approvedAppId);

      expect(visitedIndex).toBeLessThan(approvedIndex);

      // 验证整体按 created_at 倒序
      for (let i = 0; i < items.length - 1; i++) {
        expect(items[i].created_at >= items[i + 1].created_at).toBe(true);
      }
    });
  });

  // 场景 5：列表为空
  describe('场景5: 列表为空', () => {
    it('当没有审批通过的记录时，返回空列表且 total 为 0', async () => {
      // 使用一个精确筛选条件来模拟空结果（搜索一个不存在的身份证号）
      const res = await request(app).get('/api/passes').query({ id_card: '999999999999999999' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.total).toBe(0);
    });

    it('响应中包含分页信息', async () => {
      const res = await request(app).get('/api/passes');

      expect(res.body.data).toHaveProperty('items');
      expect(res.body.data).toHaveProperty('total');
      expect(res.body.data).toHaveProperty('page');
      expect(res.body.data).toHaveProperty('page_size');
      expect(res.body.data.page).toBe(1);
      expect(res.body.data.page_size).toBe(20);
    });
  });

  // 场景 6：已到访记录展示
  describe('场景6: 已到访记录展示', () => {
    it('已到访记录显示 visited 状态及实际到访时间', async () => {
      const res = await request(app).get('/api/passes');
      const items: PassItem[] = res.body.data.items;

      const visitedItem = items.find((p) => p.application_id === visitedAppId);
      expect(visitedItem).toBeDefined();

      // 通行状态为已到访
      expect(visitedItem!.pass_status).toBe('visited');

      // 实际到访时间已记录
      expect(visitedItem!.actual_visit_time).toBe('10:25');
    });

    it('未到访记录的 actual_visit_time 为 null', async () => {
      const res = await request(app).get('/api/passes');
      const items: PassItem[] = res.body.data.items;

      const notVisitedItem = items.find((p) => p.application_id === approvedAppId);
      expect(notVisitedItem).toBeDefined();

      expect(notVisitedItem!.pass_status).toBe('not_visited');
      expect(notVisitedItem!.actual_visit_time).toBeNull();
    });
  });

  // 场景补充：通行证详情 API
  describe('补充: 通行证详情', () => {
    it('GET /api/passes/:id 返回通行证详情及关联申请信息', async () => {
      const res = await request(app).get(`/api/passes/${approvedPassId}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.id).toBe(approvedPassId);
      expect(res.body.data.application).toBeDefined();
      expect(res.body.data.application.visitor_name).toBe('未到访用户');
    });

    it('GET /api/passes/:id 对不存在的通行证返回 404', async () => {
      const res = await request(app).get('/api/passes/nonexistent-id');

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(40404);
    });
  });
});
