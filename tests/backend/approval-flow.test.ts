import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app, { initDatabase } from '../../src/backend/app';

// ============================================================
// FK-42: 审批流程集成测试
// 覆盖 US016 (我创建的记录) + US017 (已处理审批历史)
// 共 8 个测试用例
// ============================================================

const USER_A = 'fk42-flow-user-a';
const USER_B = 'fk42-flow-user-b';
const APPROVER = 'fk42-flow-approver';

let deptId: string;

// USER_A 创建的申请
let userAApp1: string;  // 保持 pending
let userAApp2: string;  // 被 APPROVER 同意
let userAApp3: string;  // 被 APPROVER 退回
let userAApp4: string;  // 被 APPROVER 拒绝

// USER_B 创建的申请
let userBApp1: string;  // 保持 pending
let userBApp2: string;  // 被 APPROVER 同意

/** 快速创建申请 */
async function createApp(session: string, visitorName: string, phone: string) {
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
      visit_start_time: '2025-06-15T09:00:00.000Z',
      visit_end_time: '2025-06-15T17:00:00.000Z',
      visit_purpose: 'US016-US017测试',
    });
  expect(res.body.code).toBe(0);
  return res.body.data.id as string;
}

describe('FK-42 审批流程测试 (US016 + US017)', () => {
  beforeAll(async () => {
    await initDatabase();

    const deptsRes = await request(app).get('/api/departments');
    deptId = deptsRes.body.data[0].id;

    // USER_A 创建 4 条申请
    userAApp1 = await createApp(USER_A, '张三A', '13800001001');
    userAApp2 = await createApp(USER_A, '张三A二号', '13800001002');
    userAApp3 = await createApp(USER_A, '张三A三号', '13800001003');
    userAApp4 = await createApp(USER_A, '张三A四号', '13800001004');

    // USER_B 创建 2 条申请
    userBApp1 = await createApp(USER_B, '李四B', '13900002001');
    userBApp2 = await createApp(USER_B, '李四B二号', '13900002002');

    // APPROVER 处理 USER_A 的申请
    await request(app)
      .post(`/api/approvals/${userAApp2}/approve`)
      .send({ operator_session_id: APPROVER });

    await request(app)
      .post(`/api/approvals/${userAApp3}/return`)
      .send({ operator_session_id: APPROVER, reason: '信息不完整' });

    await request(app)
      .post(`/api/approvals/${userAApp4}/reject`)
      .send({ operator_session_id: APPROVER, reason: '不符合入校条件' });

    // APPROVER 处理 USER_B 的申请
    await request(app)
      .post(`/api/approvals/${userBApp2}/approve`)
      .send({ operator_session_id: APPROVER });
  });

  // ============================================================
  // US016: 我创建的申请记录查看
  // ============================================================
  describe('US016: 我创建的申请记录查看', () => {
    // #22 正常流程：查看我创建的申请记录与状态
    it('#22 我创建的 Tab 返回当前用户所有申请（不限状态），按时间倒序', async () => {
      const res = await request(app)
        .get('/api/approvals/created')
        .query({ session_id: USER_A });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);

      const items = res.body.data.items;
      // USER_A 创建了 4 条
      expect(items.length).toBe(4);

      // 包含所有状态
      const ids = items.map((a: { id: string }) => a.id);
      expect(ids).toContain(userAApp1);
      expect(ids).toContain(userAApp2);
      expect(ids).toContain(userAApp3);
      expect(ids).toContain(userAApp4);

      // 状态多样性
      const statuses = items.map((a: { approval_status: string }) => a.approval_status);
      expect(statuses).toContain('pending');
      expect(statuses).toContain('approved');
      expect(statuses).toContain('returned');
      expect(statuses).toContain('rejected');

      // 不包含 USER_B 的申请
      expect(ids).not.toContain(userBApp1);
      expect(ids).not.toContain(userBApp2);

      // 按提交时间倒序
      for (let i = 0; i < items.length - 1; i++) {
        const curr = new Date(items[i].created_at).getTime();
        const next = new Date(items[i + 1].created_at).getTime();
        expect(curr).toBeGreaterThanOrEqual(next);
      }
    });

    // #23 无效场景：加载了非当前用户提交的申请
    it('#23 我创建的 Tab 不会混入其他用户的申请（用户隔离校验）', async () => {
      const res = await request(app)
        .get('/api/approvals/created')
        .query({ session_id: USER_A });

      expect(res.body.code).toBe(0);
      const items = res.body.data.items;

      // 所有记录的 session_id 必须是 USER_A
      for (const item of items) {
        expect(item.session_id).toBe(USER_A);
      }

      // USER_B 的申请不应出现
      const ids = items.map((a: { id: string }) => a.id);
      expect(ids).not.toContain(userBApp1);
      expect(ids).not.toContain(userBApp2);
    });

    // #24 无效场景：筛选条件使用了 OR 逻辑
    it('#24 组合筛选使用 AND 逻辑而非 OR 逻辑', async () => {
      // 姓名="张三A" + 状态="approved" → 只返回 userAApp2
      const res = await request(app)
        .get('/api/approvals/created')
        .query({
          session_id: USER_A,
          name: '张三A二号',
          status: 'approved',
        });

      expect(res.body.code).toBe(0);
      const items = res.body.data.items;
      // AND 逻辑：只有一条同时满足姓名=张三A二号 且 状态=approved
      expect(items.length).toBe(1);
      expect(items[0].visitor_name).toBe('张三A二号');
      expect(items[0].approval_status).toBe('approved');

      // 如果用 OR 逻辑，会返回多条（张三A的其他申请 + 其他approved申请）
      // 验证确实只有 1 条来确认使用了 AND 逻辑
    });

    // #25 无效场景：使用无效的审批状态筛选值
    it('#25 传入无效审批状态值时，API 返回空列表或仅返回匹配的记录（无"审核中"这一状态）', async () => {
      // 传入无效的 status 值
      const res = await request(app)
        .get('/api/approvals/created')
        .query({
          session_id: USER_A,
          status: '审核中',
        });

      expect(res.body.code).toBe(0);
      // 无效状态不匹配任何记录
      expect(res.body.data.items).toHaveLength(0);
    });
  });

  // ============================================================
  // US017: 已处理审批历史查看
  // ============================================================
  describe('US017: 已处理审批历史查看', () => {
    // #26 正常流程：查看我已处理的审批历史记录
    it('#26 我已处理 Tab 返回当前用户处理过的所有记录，含操作结果标识，按时间倒序', async () => {
      const res = await request(app)
        .get('/api/approvals/processed')
        .query({ session_id: APPROVER });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);

      const items = res.body.data.items;
      // APPROVER 处理了 4 条：userAApp2(同意), userAApp3(退回), userAApp4(拒绝), userBApp2(同意)
      expect(items.length).toBe(4);

      const ids = items.map((a: { id: string }) => a.id);
      expect(ids).toContain(userAApp2);
      expect(ids).toContain(userAApp3);
      expect(ids).toContain(userAApp4);
      expect(ids).toContain(userBApp2);

      // 不包含未处理的申请
      expect(ids).not.toContain(userAApp1);
      expect(ids).not.toContain(userBApp1);

      // 操作结果标识正确（通过 approval_status 判断）
      const app2 = items.find((a: { id: string }) => a.id === userAApp2);
      expect(app2.approval_status).toBe('approved');

      const app3 = items.find((a: { id: string }) => a.id === userAApp3);
      expect(app3.approval_status).toBe('returned');

      const app4 = items.find((a: { id: string }) => a.id === userAApp4);
      expect(app4.approval_status).toBe('rejected');

      // 按提交时间倒序
      for (let i = 0; i < items.length - 1; i++) {
        const curr = new Date(items[i].created_at).getTime();
        const next = new Date(items[i + 1].created_at).getTime();
        expect(curr).toBeGreaterThanOrEqual(next);
      }
    });

    // #27 无效场景：加载了非当前用户处理的审批记录
    it('#27 我已处理 Tab 不会混入其他审批人处理的记录', async () => {
      // USER_A 从未处理过任何申请
      const res = await request(app)
        .get('/api/approvals/processed')
        .query({ session_id: USER_A });

      expect(res.body.code).toBe(0);
      expect(res.body.data.items).toHaveLength(0);
    });

    // #28 无效场景：操作结果标识错误
    it('#28 审批记录的 operation_type 与申请 approval_status 一致（操作结果标识正确）', async () => {
      // 通过记录接口验证操作结果标识
      const recordsRes = await request(app).get(`/api/records/${userAApp2}`);
      expect(recordsRes.body.code).toBe(0);
      const records = recordsRes.body.data.approval_records;
      expect(records.length).toBeGreaterThanOrEqual(1);

      const approveRecord = records.find(
        (r: { operation_type: string }) => r.operation_type === 'approve'
      );
      expect(approveRecord).toBeDefined();
      expect(approveRecord.operator_session_id).toBe(APPROVER);

      // 退回记录
      const returnRes = await request(app).get(`/api/records/${userAApp3}`);
      const returnRecords = returnRes.body.data.approval_records;
      const returnRecord = returnRecords.find(
        (r: { operation_type: string }) => r.operation_type === 'return'
      );
      expect(returnRecord).toBeDefined();
      expect(returnRecord.reason).toBe('信息不完整');

      // 拒绝记录
      const rejectRes = await request(app).get(`/api/records/${userAApp4}`);
      const rejectRecords = rejectRes.body.data.approval_records;
      const rejectRecord = rejectRecords.find(
        (r: { operation_type: string }) => r.operation_type === 'reject'
      );
      expect(rejectRecord).toBeDefined();
      expect(rejectRecord.reason).toBe('不符合入校条件');
    });

    // #29 无效场景：尝试修改或删除审批历史记录
    it('#29 审批记录表只写不删不改 — 不提供 UPDATE/DELETE 接口', async () => {
      // 获取审批记录
      const recordsRes = await request(app).get(`/api/records/${userAApp2}`);
      const records = recordsRes.body.data.approval_records;
      expect(records.length).toBeGreaterThanOrEqual(1);
      const recordId = records[0].id;

      // 尝试 PUT 修改 — 无此端点，应返回 404 或 405
      const putRes = await request(app)
        .put(`/api/approvals/${recordId}`)
        .send({ reason: '尝试修改' });
      expect([404, 405]).toContain(putRes.status);

      // 尝试 DELETE 删除 — 无此端点，应返回 404 或 405
      const delRes = await request(app)
        .delete(`/api/approvals/${recordId}`);
      expect([404, 405]).toContain(delRes.status);

      // 验证记录仍然存在且未被修改
      const afterRes = await request(app).get(`/api/records/${userAApp2}`);
      const afterRecords = afterRes.body.data.approval_records;
      const afterRecord = afterRecords.find(
        (r: { id: string }) => r.id === recordId
      );
      expect(afterRecord).toBeDefined();
      expect(afterRecord.operation_type).toBe('approve');
    });
  });
});
