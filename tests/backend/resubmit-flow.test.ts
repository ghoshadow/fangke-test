import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app, { initDatabase } from '../../src/backend/app';

/**
 * FK-45: 退回修改重提 — 后端流程测试
 *
 * 测试完整的退回重提业务流程和边界场景
 */

const SESSION_ID = 'fk45-flow-session';

interface ApplicationData {
  id: string;
  visitor_name: string;
  phone: string;
  approval_status: string;
  pass_status: string | null;
  version: number;
}

interface ApprovalRecordData {
  id: string;
  application_id: string;
  operation_type: string;
  reason: string | null;
  operator_session_id: string;
  operated_at: string;
}

/** 创建标准测试申请的辅助函数 */
async function createTestApplication(overrides: Partial<Record<string, unknown>> = {}) {
  const deptsRes = await request(app).get('/api/departments');
  const deptId = deptsRes.body.data[0].id;

  return request(app)
    .post('/api/applications')
    .send({
      session_id: SESSION_ID,
      visitor_name: '流程测试访客',
      phone: '13800138000',
      visitor_count: 2,
      is_driving: false,
      contact_person: '对接人',
      department_id: deptId,
      visit_start_time: '2026-06-15 09:00',
      visit_end_time: '2026-06-15 17:00',
      visit_purpose: '业务拜访',
      ...overrides,
    });
}

describe('FK-45: 退回修改重提 — 后端流程测试', () => {
  let deptId: string;

  beforeAll(async () => {
    await initDatabase();
    const deptsRes = await request(app).get('/api/departments');
    deptId = deptsRes.body.data[0].id;
  });

  // ==========================================================
  // 完整流程测试
  // ==========================================================
  describe('完整退回重提流程', () => {
    it('创建 → 退回 → 修改 → 重提 → 审批通过（正常流程）', async () => {
      // 1. 创建申请
      const createRes = await createTestApplication({
        visitor_name: '正常流程访客',
        phone: '13800310001',
        visit_purpose: '正常流程测试',
      });
      const appId = createRes.body.data.id;
      expect(createRes.body.data.approval_status).toBe('pending');

      // 2. 退回申请
      const returnRes = await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: 'fk45-flow-approver1', reason: '信息不完整' });
      expect(returnRes.body.data.approval_status).toBe('returned');

      // 3. 查看退回原因
      const reasonRes = await request(app).get(`/api/applications/${appId}/return-reason`);
      expect(reasonRes.body.data.reason).toBe('信息不完整');

      // 4. 修改并重提
      const resubmitRes = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({
          visitor_name: '正常流程访客-已补充',
          phone: '13800310001',
          visitor_count: 2,
          is_driving: false,
          contact_person: '对接人',
          department_id: deptId,
          visit_start_time: '2026-06-15 09:00',
          visit_end_time: '2026-06-15 17:00',
          visit_purpose: '正常流程测试-已补充信息',
        });
      expect(resubmitRes.body.data.approval_status).toBe('pending');
      expect(resubmitRes.body.data.visitor_name).toBe('正常流程访客-已补充');

      // 5. 审批通过（需要不同的审批人）
      const approveRes = await request(app)
        .post(`/api/approvals/${appId}/approve`)
        .send({ operator_session_id: 'fk45-flow-approver2' });
      expect(approveRes.body.data.application.approval_status).toBe('approved');

      // 6. 验证通行证已生成
      expect(approveRes.body.data.pass).toBeDefined();
      expect(approveRes.body.data.pass.pass_status).toBe('not_visited');
    });

    it('创建 → 退回 → 放弃重提（终态流程）', async () => {
      // 1. 创建申请
      const createRes = await createTestApplication({
        visitor_name: '放弃流程访客',
        phone: '13800320001',
        visit_purpose: '放弃流程测试',
      });
      const appId = createRes.body.data.id;

      // 2. 退回申请
      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: 'fk45-flow-approver3', reason: '不符合要求' });

      // 3. 放弃重提
      const abandonRes = await request(app)
        .post(`/api/applications/${appId}/abandon`);
      expect(abandonRes.body.data.approval_status).toBe('rejected');

      // 4. 验证终态：不可再操作
      const resubmitRes = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visitor_name: '尝试修改' });
      expect(resubmitRes.status).toBe(400);
    });
  });

  // ==========================================================
  // 多次退回重提
  // ==========================================================
  describe('多次退回重提', () => {
    it('支持多次退回和重提，最终审批通过', async () => {
      const createRes = await createTestApplication({
        visitor_name: '多次重提访客',
        phone: '13800330001',
        visit_purpose: '多次重提测试',
      });
      const appId = createRes.body.data.id;

      // 第一次退回
      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: 'fk45-flow-returner1', reason: '第一次退回：信息不完整' });

      // 第一次重提
      await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visit_purpose: '第一次修改后' });

      // 第二次退回
      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: 'fk45-flow-returner2', reason: '第二次退回：仍需补充' });

      // 第二次重提
      await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visit_purpose: '第二次修改后' });

      // 最终审批通过
      const approveRes = await request(app)
        .post(`/api/approvals/${appId}/approve`)
        .send({ operator_session_id: 'fk45-flow-returner3' });

      expect(approveRes.body.data.application.approval_status).toBe('approved');

      // 验证审批记录完整
      const recordsRes = await request(app).get(`/api/records/${appId}`);
      const records: ApprovalRecordData[] = recordsRes.body.data.approval_records;

      const returnRecords = records.filter((r) => r.operation_type === 'return');
      expect(returnRecords.length).toBe(2);
    });
  });

  // ==========================================================
  // 校验规则测试
  // ==========================================================
  describe('重提时的校验规则', () => {
    it('手机号格式校验（11位以1开头）', async () => {
      const createRes = await createTestApplication({
        visitor_name: '校验手机',
        phone: '13800340001',
      });
      const appId = createRes.body.data.id;

      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: 'fk45-flow-valid1', reason: '手机号有误' });

      // 10位数字 - 失败
      const res1 = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ phone: '1380013800' });
      expect(res1.status).toBe(400);
      expect(res1.body.msg).toContain('手机号');

      // 不以1开头 - 失败
      const res2 = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ phone: '23800138000' });
      expect(res2.status).toBe(400);

      // 正确格式 - 成功
      const res3 = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ phone: '13800340001' });
      expect(res3.status).toBe(200);
    });

    it('访客人数校验（至少1人）', async () => {
      const createRes = await createTestApplication({
        visitor_name: '校验人数',
        phone: '13800350001',
      });
      const appId = createRes.body.data.id;

      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: 'fk45-flow-valid2', reason: '人数有误' });

      // 0人 - 失败
      const res1 = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visitor_count: 0 });
      expect(res1.status).toBe(400);
      expect(res1.body.msg).toContain('人数');

      // 负数 - 失败
      const res2 = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visitor_count: -1 });
      expect(res2.status).toBe(400);

      // 小数 - 失败
      const res3 = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visitor_count: 1.5 });
      expect(res3.status).toBe(400);

      // 正确值 - 成功
      const res4 = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visitor_count: 2 });
      expect(res4.status).toBe(200);
    });

    it('车牌号联动校验（开车时必填）', async () => {
      const createRes = await createTestApplication({
        visitor_name: '校验车牌',
        phone: '13800360001',
        is_driving: false,
      });
      const appId = createRes.body.data.id;

      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: 'fk45-flow-valid3', reason: '车辆信息有误' });

      // 改为开车但不填车牌 - 失败
      const res1 = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ is_driving: true, license_plate: '' });
      expect(res1.status).toBe(400);
      expect(res1.body.msg).toContain('车牌号');

      // 改为开车且填写正确车牌 - 成功
      const res2 = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ is_driving: true, license_plate: '京A12345' });
      expect(res2.status).toBe(200);
    });

    it('时间顺序校验（结束时间不能早于起始时间）', async () => {
      const createRes = await createTestApplication({
        visitor_name: '校验时间',
        phone: '13800370001',
      });
      const appId = createRes.body.data.id;

      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: 'fk45-flow-valid4', reason: '时间有误' });

      // 结束时间早于起始时间 - 失败
      const res1 = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({
          visit_start_time: '2026-06-15 14:00',
          visit_end_time: '2026-06-15 12:00',
        });
      expect(res1.status).toBe(400);
      expect(res1.body.msg).toContain('时间');

      // 结束时间等于起始时间 - 失败
      const res2 = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({
          visit_start_time: '2026-06-15 14:00',
          visit_end_time: '2026-06-15 14:00',
        });
      expect(res2.status).toBe(400);

      // 正确的顺序 - 成功
      const res3 = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({
          visit_start_time: '2026-06-15 09:00',
          visit_end_time: '2026-06-15 17:00',
        });
      expect(res3.status).toBe(200);
    });

    it('必填字段校验（访客姓名为空）', async () => {
      const createRes = await createTestApplication({
        visitor_name: '校验姓名',
        phone: '13800380001',
      });
      const appId = createRes.body.data.id;

      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: 'fk45-flow-valid5', reason: '姓名有误' });

      const res = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visitor_name: '' });

      expect(res.status).toBe(400);
      expect(res.body.msg).toContain('姓名');
    });
  });

  // ==========================================================
  // 状态流转约束
  // ==========================================================
  describe('状态流转约束', () => {
    it('待审批状态不可重提', async () => {
      const createRes = await createTestApplication({
        visitor_name: '待审批不可改',
        phone: '13800390001',
      });
      const appId = createRes.body.data.id;

      const res = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visitor_name: '尝试修改' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40010);
    });

    it('已同意状态不可重提', async () => {
      const createRes = await createTestApplication({
        visitor_name: '已同意不可改',
        phone: '13800400001',
      });
      const appId = createRes.body.data.id;

      await request(app)
        .post(`/api/approvals/${appId}/approve`)
        .send({ operator_session_id: 'fk45-flow-approve-status' });

      const res = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visitor_name: '尝试修改' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40010);
    });

    it('已拒绝状态不可重提（终态）', async () => {
      const createRes = await createTestApplication({
        visitor_name: '已拒绝不可改',
        phone: '13800410001',
      });
      const appId = createRes.body.data.id;

      // 先退回
      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: 'fk45-flow-reject-status1', reason: '退回' });

      // 重提（状态变回pending）
      await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visitor_name: '已拒绝不可改-重提' });

      // 再拒绝（需要pending状态）
      await request(app)
        .post(`/api/approvals/${appId}/reject`)
        .send({ operator_session_id: 'fk45-flow-reject-status2', reason: '拒绝' });

      const res = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visitor_name: '尝试修改' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40010);
    });

    it('已拒绝状态不可再次放弃', async () => {
      const createRes = await createTestApplication({
        visitor_name: '已拒绝不可放弃',
        phone: '13800420001',
      });
      const appId = createRes.body.data.id;

      // 先退回
      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: 'fk45-flow-reject-twice1', reason: '退回' });

      // 放弃重提（变为已拒绝）
      await request(app)
        .post(`/api/applications/${appId}/abandon`);

      // 再次放弃 - 应该失败
      const res = await request(app)
        .post(`/api/applications/${appId}/abandon`);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40010);
    });
  });

  // ==========================================================
  // 乐观锁与并发控制
  // ==========================================================
  describe('乐观锁与并发控制', () => {
    it('重提后版本号正确递增', async () => {
      const createRes = await createTestApplication({
        visitor_name: '版本号测试',
        phone: '13800430001',
      });
      const appId = createRes.body.data.id;
      const v0 = createRes.body.data.version;

      // 退回 (version +1)
      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: 'fk45-flow-version1', reason: '退回' });

      const afterReturn = await request(app).get(`/api/applications/${appId}`);
      expect(afterReturn.body.data.version).toBe(v0 + 1);

      // 重提 (version +1)
      await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visitor_name: '版本号测试-已修改' });

      const afterResubmit = await request(app).get(`/api/applications/${appId}`);
      expect(afterResubmit.body.data.version).toBe(v0 + 2);
    });
  });

  // ==========================================================
  // 部分字段更新
  // ==========================================================
  describe('部分字段更新', () => {
    it('只更新部分字段，其他字段保持不变', async () => {
      const createRes = await createTestApplication({
        visitor_name: '部分更新测试',
        phone: '13800440001',
        company: '原始公司',
        visitor_count: 3,
        visit_purpose: '原始目的',
      });
      const appId = createRes.body.data.id;

      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: 'fk45-flow-partial', reason: '需要修改' });

      // 只更新访客姓名
      const res = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visitor_name: '更新后的姓名' });

      expect(res.status).toBe(200);
      expect(res.body.data.visitor_name).toBe('更新后的姓名');
      // 其他字段应保持不变
      expect(res.body.data.phone).toBe('13800440001');
      expect(res.body.data.visitor_count).toBe(3);
    });
  });
});
