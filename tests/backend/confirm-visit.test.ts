/**
 * FK-36：确认到访与状态流转 — 完整闭环测试
 *
 * 测试场景覆盖：
 *   #1  确认到访按钮可触发（API 层面：请求能正常响应 200）
 *   #2  选择/确认时间后提交 → 提示"确认到访成功"（code=0）
 *   #3  提交后通行状态：not_visited → visited，记录 actual_visit_time
 *   #4  已到访后刷新详情页 → pass_status=visited，actual_visit_time 存在
 *   #5  对已到访记录再次确认 → 拦截重复操作
 *   #6  确认到访后状态不可回滚（无 API 支持回滚）
 *   #7  确认到访时参数异常（空值/格式错误/不存在的通行证）
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app, { initDatabase } from '../../src/backend/app';

const SESSION_ID = 'fk36-confirm-visit-session';
const APPROVER_SESSION = 'fk36-approver-session';
const headers = { 'X-Session-Id': SESSION_ID };

/**
 * 辅助：创建申请 → 审批通过 → 返回通行证 ID 及申请 ID
 */
async function createApprovedPass(visitorName: string, phone: string): Promise<{
  appId: string;
  passId: string;
}> {
  const deptsRes = await request(app).get('/api/departments');
  const deptId = deptsRes.body.data[0].id;

  const createRes = await request(app)
    .post('/api/applications')
    .send({
      visitor_name: visitorName,
      phone,
      visitor_count: 1,
      is_driving: false,
      contact_person: '对接人',
      department_id: deptId,
      visit_start_time: '2024-05-01T09:00:00.000Z',
      visit_end_time: '2024-05-01T17:00:00.000Z',
      visit_purpose: `FK-36 测试：${visitorName}`,
      session_id: SESSION_ID,
    });

  expect(createRes.status).toBe(200);
  const appId = createRes.body.data.id;

  const approveRes = await request(app)
    .post(`/api/approvals/${appId}/approve`)
    .send({ operator_session_id: APPROVER_SESSION });

  expect(approveRes.status).toBe(200);

  const passesRes = await request(app).get('/api/passes');
  const pass = passesRes.body.data.items.find(
    (p: { application_id: string }) => p.application_id === appId,
  );
  expect(pass).toBeDefined();

  return { appId, passId: pass.id };
}

describe('FK-36：确认到访与状态流转', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  // ========================================================
  // 场景 #2 + #3：成功确认到访 + 状态流转
  // ========================================================
  describe('场景 #2 + #3：提交确认到访后状态流转', () => {
    let passId: string;
    let appId: string;

    beforeAll(async () => {
      const result = await createApprovedPass('到访成功用户', '13000001001');
      passId = result.passId;
      appId = result.appId;
    });

    it('确认到访前通行证状态为 not_visited', async () => {
      const res = await request(app).get(`/api/passes/${passId}`);
      expect(res.status).toBe(200);
      expect(res.body.data.pass_status).toBe('not_visited');
      expect(res.body.data.actual_visit_time).toBeNull();
    });

    it('提交确认到访：返回 code=0 且状态变为 visited', async () => {
      const res = await request(app)
        .post(`/api/passes/${passId}/confirm`)
        .send({ actual_visit_time: '14:30' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.msg).toBe('success');
      expect(res.body.data.pass_status).toBe('visited');
      expect(res.body.data.actual_visit_time).toBe('14:30');
    });

    it('申请表的 pass_status 同步更新为 visited', async () => {
      const appRes = await request(app).get(`/api/applications/${appId}`);
      expect(appRes.status).toBe(200);
      expect(appRes.body.data.pass_status).toBe('visited');
    });
  });

  // ========================================================
  // 场景 #4：已到访后刷新详情页（重新 GET 后状态仍为 visited）
  // ========================================================
  describe('场景 #4：已到访后重新获取详情', () => {
    let passId: string;

    beforeAll(async () => {
      const result = await createApprovedPass('刷新详情用户', '13000001004');
      passId = result.passId;

      // 先确认到访
      await request(app)
        .post(`/api/passes/${passId}/confirm`)
        .send({ actual_visit_time: '10:15' });
    });

    it('重新 GET 通行证详情：pass_status=visited，actual_visit_time 保留', async () => {
      const res = await request(app).get(`/api/passes/${passId}`);
      expect(res.status).toBe(200);
      expect(res.body.data.pass_status).toBe('visited');
      expect(res.body.data.actual_visit_time).toBe('10:15');
    });

    it('已到访通行证在列表中也展示 visited 状态', async () => {
      const res = await request(app).get('/api/passes');
      expect(res.status).toBe(200);
      const pass = res.body.data.items.find(
        (p: { id: string }) => p.id === passId,
      );
      expect(pass).toBeDefined();
      expect(pass.pass_status).toBe('visited');
      expect(pass.actual_visit_time).toBe('10:15');
    });
  });

  // ========================================================
  // 场景 #5：对已到访记录再次确认 → 拦截重复操作
  // ========================================================
  describe('场景 #5：重复确认到访被拦截', () => {
    let passId: string;

    beforeAll(async () => {
      const result = await createApprovedPass('重复确认用户', '13000001005');
      passId = result.passId;

      // 第一次确认成功
      const firstRes = await request(app)
        .post(`/api/passes/${passId}/confirm`)
        .send({ actual_visit_time: '09:00' });
      expect(firstRes.status).toBe(200);
    });

    it('第二次确认到访：返回 code=40020，提示已确认不可重复', async () => {
      const res = await request(app)
        .post(`/api/passes/${passId}/confirm`)
        .send({ actual_visit_time: '11:00' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40020);
      expect(res.body.data).toBeNull();
    });

    it('重复确认后 actual_visit_time 保持第一次的值', async () => {
      const detailRes = await request(app).get(`/api/passes/${passId}`);
      expect(detailRes.body.data.actual_visit_time).toBe('09:00');
    });
  });

  // ========================================================
  // 场景 #6：确认到访后状态不可回滚（无回滚 API）
  // ========================================================
  describe('场景 #6：确认到访后状态不可回滚', () => {
    let passId: string;

    beforeAll(async () => {
      const result = await createApprovedPass('不可回滚用户', '13000001006');
      passId = result.passId;

      await request(app)
        .post(`/api/passes/${passId}/confirm`)
        .send({ actual_visit_time: '08:30' });
    });

    it('通行证不存在"回滚到未到访"的 API，任何再次确认均被拦截', async () => {
      // 尝试用 not_visited 状态再次提交（模拟回滚企图）
      const res = await request(app)
        .post(`/api/passes/${passId}/confirm`)
        .send({ actual_visit_time: '16:00' });

      // 无论传什么时间，已到访后再次 confirm 都会被拦截
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40020);
    });

    it('申请表的 pass_status 仍为 visited，未被重置', async () => {
      const detailRes = await request(app).get(`/api/passes/${passId}`);
      expect(detailRes.body.data.pass_status).toBe('visited');
    });
  });

  // ========================================================
  // 场景 #7：确认到访时参数异常
  // ========================================================
  describe('场景 #7：参数异常与边界情况', () => {
    let passId: string;

    beforeAll(async () => {
      const result = await createApprovedPass('参数异常用户', '13000001007');
      passId = result.passId;
    });

    it('缺少 actual_visit_time：返回 code=40021', async () => {
      const res = await request(app)
        .post(`/api/passes/${passId}/confirm`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40021);
      expect(res.body.data).toBeNull();
    });

    it('actual_visit_time 为空字符串：返回 code=40021', async () => {
      const res = await request(app)
        .post(`/api/passes/${passId}/confirm`)
        .send({ actual_visit_time: '' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40021);
    });

    it('actual_visit_time 格式错误（非 HH:mm）：返回 code=40021', async () => {
      const res = await request(app)
        .post(`/api/passes/${passId}/confirm`)
        .send({ actual_visit_time: '14:30:00' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40021);
    });

    it('actual_visit_time 为纯文本：返回 code=40021', async () => {
      const res = await request(app)
        .post(`/api/passes/${passId}/confirm`)
        .send({ actual_visit_time: '下午两点' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40021);
    });

    it('actual_visit_time 为非字符串类型：返回 code=40021', async () => {
      const res = await request(app)
        .post(`/api/passes/${passId}/confirm`)
        .send({ actual_visit_time: 1430 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40021);
    });

    it('不存在的通行证 ID：返回 404，code=40404', async () => {
      const res = await request(app)
        .post('/api/passes/nonexistent-pass-id/confirm')
        .send({ actual_visit_time: '14:30' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(40404);
    });

    it('参数异常不影响通行证的原始状态', async () => {
      const detailRes = await request(app).get(`/api/passes/${passId}`);
      expect(detailRes.status).toBe(200);
      // 上述错误请求不应改变通行证状态
      expect(detailRes.body.data.pass_status).toBe('not_visited');
      expect(detailRes.body.data.actual_visit_time).toBeNull();
    });

    it('合法请求仍可成功（参数异常后可重试）', async () => {
      const res = await request(app)
        .post(`/api/passes/${passId}/confirm`)
        .send({ actual_visit_time: '15:45' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.pass_status).toBe('visited');
      expect(res.body.data.actual_visit_time).toBe('15:45');
    });
  });

  // ========================================================
  // 场景 #1：GET /api/passes/:id 可正常获取（确认到访前的前置验证）
  // ========================================================
  describe('场景 #1：获取通行证详情以触发确认操作', () => {
    it('已审批通过的通行证可通过 ID 获取，pass_status 为 not_visited', async () => {
      const { passId } = await createApprovedPass('场景1用户', '13000001008');

      const res = await request(app).get(`/api/passes/${passId}`);
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.pass_status).toBe('not_visited');
      expect(res.body.data).toHaveProperty('application');
    });

    it('不存在的通行证返回 404', async () => {
      const res = await request(app).get('/api/passes/nonexistent-id');
      expect(res.status).toBe(404);
      expect(res.body.code).toBe(40404);
    });
  });

  // ========================================================
  // 边界情况：未审批通过的申请没有通行证
  // ========================================================
  describe('边界情况：未审批申请不产生通行证', () => {
    it('pending 状态的申请不出现在通行证列表中', async () => {
      const deptsRes = await request(app).get('/api/departments');
      const deptId = deptsRes.body.data[0].id;

      const createRes = await request(app)
        .post('/api/applications')
        .send({
          visitor_name: '未审批用户',
          phone: '13000001009',
          visitor_count: 1,
          is_driving: false,
          contact_person: '对接人',
          department_id: deptId,
          visit_start_time: '2024-05-01T09:00:00.000Z',
          visit_end_time: '2024-05-01T17:00:00.000Z',
          visit_purpose: '未审批测试',
          session_id: SESSION_ID,
        });

      const appId = createRes.body.data.id;

      const passesRes = await request(app).get('/api/passes');
      const pass = passesRes.body.data.items.find(
        (p: { application_id: string }) => p.application_id === appId,
      );
      expect(pass).toBeUndefined();
    });
  });
});
