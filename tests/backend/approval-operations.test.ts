import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app, { initDatabase } from '../../src/backend/app';

// ─── 测试用 session 常量 ────────────────────────────────────────────────────
const SUBMITTER = 'fk32-submitter';
const APPROVER_1 = 'fk32-approver-1';
const APPROVER_2 = 'fk32-approver-2';

// ─── 各场景专用申请 ID ──────────────────────────────────────────────────────
// 同意场景
let APP_A1: string;  // A1: 正常同意
let APP_A2: string;  // A2: 重复同意（A2a 由 APPROVER_1 同意后，A2b 再尝试操作）
// 退回场景
let APP_B1: string;  // B1: 无原因退回
let APP_B2: string;  // B2: 有原因退回 → B3: 重提
let APP_B4: string;  // B4: 重复退回
// 拒绝场景
let APP_C1: string;  // C1: 无原因拒绝
let APP_C2: string;  // C2: 有原因拒绝 → C3: 终态检验
// 辅助
let DEPT_ID: string;

/** 快速创建一条待审批申请 */
async function createApp(
  session: string,
  visitorName: string,
  phone = '13800001111',
) {
  const res = await request(app)
    .post('/api/applications')
    .send({
      session_id: session,
      visitor_name: visitorName,
      phone,
      visitor_count: 1,
      is_driving: false,
      contact_person: '被访人',
      department_id: DEPT_ID,
      visit_start_time: '2026-06-01T09:00:00.000Z',
      visit_end_time: '2026-06-01T17:00:00.000Z',
      visit_purpose: 'FK-32测试',
    });
  expect(res.body.code).toBe(0);
  return res.body.data.id as string;
}

// ═══════════════════════════════════════════════════════════════════════════
// 测试套件
// ═══════════════════════════════════════════════════════════════════════════
describe('FK-32: 三种审批操作执行', () => {
  beforeAll(async () => {
    await initDatabase();

    // 取第一个部门
    const deptsRes = await request(app).get('/api/departments');
    DEPT_ID = deptsRes.body.data[0].id;

    // 预创建所有测试用申请（均为 pending 状态）
    APP_A1 = await createApp(SUBMITTER, 'FK32-A1同意');
    APP_A2 = await createApp(SUBMITTER, 'FK32-A2重复同意', '13800002222');
    APP_B1 = await createApp(SUBMITTER, 'FK32-B1无原因退回', '13800003333');
    APP_B2 = await createApp(SUBMITTER, 'FK32-B2有原因退回', '13800004444');
    APP_B4 = await createApp(SUBMITTER, 'FK32-B4重复退回', '13800006666');
    APP_C1 = await createApp(SUBMITTER, 'FK32-C1无原因拒绝', '13800007777');
    APP_C2 = await createApp(SUBMITTER, 'FK32-C2有原因拒绝', '13800008888');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // A: 同意操作
  // ─────────────────────────────────────────────────────────────────────────
  describe('A: 同意操作', () => {
    it('A1 - 对待审批申请点同意，状态变为已同意，自动生成通行证', async () => {
      const res = await request(app)
        .post(`/api/approvals/${APP_A1}/approve`)
        .send({ operator_session_id: APPROVER_1 });

      // 基本响应结构
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data).toHaveProperty('application');
      expect(res.body.data).toHaveProperty('pass');

      // 申请状态已同意
      const appData = res.body.data.application;
      expect(appData.approval_status).toBe('approved');

      // 通行证自动生成，通行状态 = 未到访
      const pass = res.body.data.pass;
      expect(pass).toBeDefined();
      expect(pass.application_id).toBe(APP_A1);
      expect(pass.pass_status).toBe('not_visited');
    });

    it('A1 - 同意后申请状态持久化（从详情接口验证）', async () => {
      const res = await request(app).get(`/api/applications/${APP_A1}`);
      expect(res.body.code).toBe(0);
      expect(res.body.data.approval_status).toBe('approved');
    });

    it('A2 - 对已同意申请再点同意，后端拦截（状态非pending）', async () => {
      // 先由 APPROVER_1 同意 APP_A2
      await request(app)
        .post(`/api/approvals/${APP_A2}/approve`)
        .send({ operator_session_id: APPROVER_1 });

      // APPROVER_2 再对同一申请点同意 → 状态已非 pending
      const res = await request(app)
        .post(`/api/approvals/${APP_A2}/approve`)
        .send({ operator_session_id: APPROVER_2 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40010);
      expect(res.body.msg).toContain('该申请已处理，不可重复操作');
    });

    it('A2 - 同一操作人重复同意也被拦截（防重复审批机制）', async () => {
      // APPROVER_1 已同意 APP_A2，再次尝试 → 防重复
      const res = await request(app)
        .post(`/api/approvals/${APP_A2}/approve`)
        .send({ operator_session_id: APPROVER_1 });

      expect(res.status).toBe(400);
      expect([40010, 40011]).toContain(res.body.code);
    });

    it('A3 - 同意后通行证含全字段（姓名、手机、身份证、人数、车牌、时间段、对接人、部门）', async () => {
      // 创建一条包含全字段的申请
      const fullAppRes = await request(app)
        .post('/api/applications')
        .send({
          session_id: SUBMITTER,
          visitor_name: 'FK32-A3全字段',
          phone: '13912345678',
          id_card: '110101199001011234',
          company: '测试科技有限公司',
          visitor_count: 3,
          is_driving: true,
          license_plate: '京A88888',
          contact_person: '张老师',
          department_id: DEPT_ID,
          visit_start_time: '2026-07-01T09:00:00.000Z',
          visit_end_time: '2026-07-01T17:00:00.000Z',
          visit_purpose: 'FK-32 A3全字段验证',
        });
      const fullAppId = fullAppRes.body.data.id;

      // 同意该申请
      await request(app)
        .post(`/api/approvals/${fullAppId}/approve`)
        .send({ operator_session_id: APPROVER_1 });

      // 获取通行证列表，找到对应通行证
      const passesRes = await request(app).get('/api/passes');
      const pass = passesRes.body.data.items.find(
        (p: { application_id: string }) => p.application_id === fullAppId,
      );

      expect(pass).toBeDefined();
      expect(pass.visitor_name).toBe('FK32-A3全字段');
      expect(pass.phone).toBe('13912345678');
      expect(pass.id_card).toBe('110101199001011234');
      expect(pass.pass_status).toBe('not_visited');

      // 通过通行证详情接口验证关联申请的所有字段
      const passDetailRes = await request(app).get(`/api/passes/${pass.id}`);
      expect(passDetailRes.body.code).toBe(0);

      const appInfo = passDetailRes.body.data.application;
      expect(appInfo.visitor_name).toBe('FK32-A3全字段');
      expect(appInfo.phone).toBe('13912345678');
      expect(appInfo.id_card).toBe('110101199001011234');
      expect(appInfo.visitor_count).toBe(3);
      expect(appInfo.is_driving).toBe(true);
      expect(appInfo.license_plate).toBe('京A88888');
      expect(appInfo.contact_person).toBe('张老师');
      expect(appInfo.department_id).toBe(DEPT_ID);
      expect(appInfo.visit_start_time).toBe('2026-07-01T09:00:00.000Z');
      expect(appInfo.visit_end_time).toBe('2026-07-01T17:00:00.000Z');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // B: 退回操作
  // ─────────────────────────────────────────────────────────────────────────
  describe('B: 退回操作', () => {
    it('B1 - 退回时不填原因，阻止提交，提示"退回必须填写原因"', async () => {
      // 完全不传 reason 字段
      const res1 = await request(app)
        .post(`/api/approvals/${APP_B1}/return`)
        .send({ operator_session_id: APPROVER_1 });

      expect(res1.status).toBe(400);
      expect(res1.body.code).toBe(40012);
      expect(res1.body.msg).toBe('退回必须填写原因');

      // 传空字符串 reason
      const res2 = await request(app)
        .post(`/api/approvals/${APP_B1}/return`)
        .send({ operator_session_id: APPROVER_1, reason: '' });

      expect(res2.status).toBe(400);
      expect(res2.body.code).toBe(40012);

      // 传纯空格 reason（也应被拒绝）
      const res3 = await request(app)
        .post(`/api/approvals/${APP_B1}/return`)
        .send({ operator_session_id: APPROVER_1, reason: '   ' });

      expect(res3.status).toBe(400);
      expect(res3.body.code).toBe(40012);
    });

    it('B1 - 退回失败后申请状态保持 pending', async () => {
      const res = await request(app).get(`/api/applications/${APP_B1}`);
      expect(res.body.data.approval_status).toBe('pending');
    });

    it('B2 - 填写原因后退回，状态变为已退回，原因永久留存', async () => {
      const res = await request(app)
        .post(`/api/approvals/${APP_B2}/return`)
        .send({ operator_session_id: APPROVER_1, reason: '申请信息不完整，请补充身份证号' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.approval_status).toBe('returned');
    });

    it('B2 - 退回原因在审批记录中永久留存', async () => {
      const res = await request(app).get(`/api/records/${APP_B2}`);

      expect(res.body.code).toBe(0);
      const records = res.body.data.approval_records;
      expect(records.length).toBeGreaterThanOrEqual(1);

      const returnRecord = records.find(
        (r: { operation_type: string }) => r.operation_type === 'return',
      );
      expect(returnRecord).toBeDefined();
      expect(returnRecord.reason).toBe('申请信息不完整，请补充身份证号');
      expect(returnRecord.operator_session_id).toBe(APPROVER_1);
    });

    it('B3 - 退回后提交人修改并重提，状态重新变为待审批', async () => {
      const res = await request(app)
        .patch(`/api/applications/${APP_B2}`)
        .send({
          session_id: SUBMITTER,
          id_card: '110101199001019999',
          visit_purpose: '已补充完整信息的拜访目的',
        });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.approval_status).toBe('pending');
      expect(res.body.data.id_card).toBe('110101199001019999');
      expect(res.body.data.visit_purpose).toBe('已补充完整信息的拜访目的');
    });

    it('B3 - 重提后重新进入审批队列（另一审批人可操作）', async () => {
      const res = await request(app)
        .post(`/api/approvals/${APP_B2}/approve`)
        .send({ operator_session_id: APPROVER_2 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.application.approval_status).toBe('approved');
      expect(res.body.data.pass).toBeDefined();
    });

    it('B4 - 对已退回申请再退回，阻止操作', async () => {
      // 先将 APP_B4 退回
      await request(app)
        .post(`/api/approvals/${APP_B4}/return`)
        .send({ operator_session_id: APPROVER_1, reason: '信息有误' });

      // 再次退回 → 状态已非 pending
      const res = await request(app)
        .post(`/api/approvals/${APP_B4}/return`)
        .send({ operator_session_id: APPROVER_2, reason: '再次退回' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40010);
      expect(res.body.msg).toContain('该申请已处理，不可重复操作');
    });

    it('B4 - 对已退回申请执行同意操作，同样被拦截', async () => {
      const res = await request(app)
        .post(`/api/approvals/${APP_B4}/approve`)
        .send({ operator_session_id: APPROVER_2 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40010);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // C: 拒绝操作
  // ─────────────────────────────────────────────────────────────────────────
  describe('C: 拒绝操作', () => {
    it('C1 - 拒绝时不填原因，阻止提交，提示"拒绝必须填写原因"', async () => {
      // 完全不传 reason
      const res1 = await request(app)
        .post(`/api/approvals/${APP_C1}/reject`)
        .send({ operator_session_id: APPROVER_1 });

      expect(res1.status).toBe(400);
      expect(res1.body.code).toBe(40012);
      expect(res1.body.msg).toBe('拒绝必须填写原因');

      // 传空字符串
      const res2 = await request(app)
        .post(`/api/approvals/${APP_C1}/reject`)
        .send({ operator_session_id: APPROVER_1, reason: '' });

      expect(res2.status).toBe(400);
      expect(res2.body.code).toBe(40012);
    });

    it('C1 - 拒绝失败后申请状态保持 pending', async () => {
      const res = await request(app).get(`/api/applications/${APP_C1}`);
      expect(res.body.data.approval_status).toBe('pending');
    });

    it('C2 - 填写原因后拒绝，状态变为已拒绝（终态），原因永久留存', async () => {
      const res = await request(app)
        .post(`/api/approvals/${APP_C2}/reject`)
        .send({ operator_session_id: APPROVER_1, reason: '该校近期不接受外来访客参观' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.approval_status).toBe('rejected');
    });

    it('C2 - 拒绝原因在审批记录中永久留存', async () => {
      const res = await request(app).get(`/api/records/${APP_C2}`);

      expect(res.body.code).toBe(0);
      const records = res.body.data.approval_records;
      expect(records.length).toBeGreaterThanOrEqual(1);

      const rejectRecord = records.find(
        (r: { operation_type: string }) => r.operation_type === 'reject',
      );
      expect(rejectRecord).toBeDefined();
      expect(rejectRecord.reason).toBe('该校近期不接受外来访客参观');
      expect(rejectRecord.operator_session_id).toBe(APPROVER_1);
    });

    it('C2 - 已拒绝申请不生成通行证', async () => {
      const passesRes = await request(app).get('/api/passes');
      const pass = passesRes.body.data.items.find(
        (p: { application_id: string }) => p.application_id === APP_C2,
      );
      expect(pass).toBeUndefined();
    });

    it('C3 - 对已拒绝申请再同意，被拦截（终态不可重新激活）', async () => {
      const res = await request(app)
        .post(`/api/approvals/${APP_C2}/approve`)
        .send({ operator_session_id: APPROVER_2 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40010);
    });

    it('C3 - 对已拒绝申请再退回，被拦截', async () => {
      const res = await request(app)
        .post(`/api/approvals/${APP_C2}/return`)
        .send({ operator_session_id: APPROVER_2, reason: '尝试退回已拒绝的申请' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40010);
    });

    it('C3 - 对已拒绝申请再拒绝，被拦截', async () => {
      const res = await request(app)
        .post(`/api/approvals/${APP_C2}/reject`)
        .send({ operator_session_id: APPROVER_2, reason: '再次拒绝' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40010);
    });

    it('C3 - 已拒绝申请不可通过重提接口修改', async () => {
      const res = await request(app)
        .patch(`/api/applications/${APP_C2}`)
        .send({
          session_id: SUBMITTER,
          visit_purpose: '尝试修改已拒绝申请',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40010);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 补充：边界条件
  // ─────────────────────────────────────────────────────────────────────────
  describe('边界条件', () => {
    it('缺少 operator_session_id 时返回错误', async () => {
      const res = await request(app)
        .post(`/api/approvals/${APP_A1}/approve`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40000);
    });

    it('不存在的申请 ID 返回 404', async () => {
      const res = await request(app)
        .post('/api/approvals/nonexistent-id/approve')
        .send({ operator_session_id: APPROVER_1 });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(40404);
    });

    it('原因超过500字符时返回错误', async () => {
      // 创建一条新申请用于测试
      const appId = await createApp(SUBMITTER, 'FK32-原因超长', '13800009999');
      const longReason = '测'.repeat(501);

      const res = await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: APPROVER_1, reason: longReason });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40013);
    });
  });
});
