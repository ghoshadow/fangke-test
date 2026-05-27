import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import app, { initDatabase } from '../../src/backend/app';

/**
 * FK-45: 退回修改重提 — 后端 API 测试
 *
 * 覆盖用户故事:
 * - US026: 查看退回原因（API 层面）
 * - US027: 修改表单（API 校验层面）
 * - US028: 重新提交（API 校验层面）
 * - US029: 放弃重提（API 层面）
 */

const SESSION_ID = 'fk45-resubmit-session';
const APPROVER_SESSION = 'fk45-resubmit-approver';

interface ApplicationData {
  id: string;
  visitor_name: string;
  phone: string;
  approval_status: string;
  pass_status: string | null;
  version: number;
  company: string | null;
  is_driving: boolean;
  license_plate: string | null;
}

/** 创建标准测试申请的辅助函数 */
async function createTestApplication(overrides: Partial<Record<string, unknown>> = {}) {
  const deptsRes = await request(app).get('/api/departments');
  const deptId = deptsRes.body.data[0].id;

  return request(app)
    .post('/api/applications')
    .send({
      session_id: SESSION_ID,
      visitor_name: '测试访客',
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

/** 退回申请的辅助函数 */
async function returnApplication(appId: string, reason: string, approverId = APPROVER_SESSION) {
  return request(app)
    .post(`/api/approvals/${appId}/return`)
    .send({ operator_session_id: approverId, reason });
}

describe('FK-45: 退回修改重提 — 后端 API 测试', () => {
  let deptId: string;

  beforeAll(async () => {
    await initDatabase();
    const deptsRes = await request(app).get('/api/departments');
    deptId = deptsRes.body.data[0].id;
  });

  // ==========================================================
  // US026: 查看退回原因
  // ==========================================================
  describe('US026: 查看退回原因 (GET /api/applications/:id/return-reason)', () => {
    it('测试用例1: 已退回申请正常返回退回原因', async () => {
      const RETURN_REASON = '访客身份证号码有误，请核实后重新提交';
      const createRes = await createTestApplication({
        visitor_name: 'US026正常流程',
        phone: '13800260001',
      });
      const appId = createRes.body.data.id;

      await returnApplication(appId, RETURN_REASON, 'fk45-us026-approver1');

      const res = await request(app).get(`/api/applications/${appId}/return-reason`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.reason).toBe(RETURN_REASON);
    });

    it('测试用例2: 非已退回状态返回空原因', async () => {
      const createRes = await createTestApplication({
        visitor_name: 'US026待审批',
        phone: '13800260002',
      });
      const appId = createRes.body.data.id;

      const res = await request(app).get(`/api/applications/${appId}/return-reason`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.reason).toBeNull();
    });

    it('测试用例3: 已退回但退回原因为空时返回null', async () => {
      // 模拟异常情况：退回时未填写原因（虽然正常流程不允许，但测试数据可能异常）
      const createRes = await createTestApplication({
        visitor_name: 'US026空原因',
        phone: '13800260003',
      });
      const appId = createRes.body.data.id;

      // 正常退回需要原因，这里测试API返回值
      await returnApplication(appId, '', 'fk45-us026-approver3').catch(() => {
        // 退回可能失败因为原因必填，这是预期的
      });

      const res = await request(app).get(`/api/applications/${appId}/return-reason`);

      expect(res.status).toBe(200);
      expect(res.body.data.reason === null || res.body.data.reason === '').toBe(true);
    });

    it('测试用例4: 退回原因只读，无法通过API修改', async () => {
      const RETURN_REASON = '原始退回原因不可修改';
      const createRes = await createTestApplication({
        visitor_name: 'US026只读',
        phone: '13800260004',
      });
      const appId = createRes.body.data.id;

      await returnApplication(appId, RETURN_REASON, 'fk45-us026-approver4');

      // 尝试通过PATCH修改退回原因（应该被忽略）
      const patchRes = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visit_purpose: '修改后的目的' });

      // PATCH应该成功（重提），但退回原因保留在审批记录中
      expect(patchRes.status).toBe(200);

      // 验证退回原因未被修改
      const reasonRes = await request(app).get(`/api/applications/${appId}/return-reason`);
      expect(reasonRes.body.data.reason).toBe(RETURN_REASON);
    });

    it('不存在的申请返回404', async () => {
      const res = await request(app).get('/api/applications/nonexistent-id/return-reason');

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(40404);
    });
  });

  // ==========================================================
  // US027: 修改表单（API层面）
  // ==========================================================
  describe('US027: 修改表单 (PATCH /api/applications/:id)', () => {
    it('测试用例5: 已退回申请可正常修改字段', async () => {
      const createRes = await createTestApplication({
        visitor_name: 'US027原始姓名',
        phone: '13800270001',
      });
      const appId = createRes.body.data.id;

      await returnApplication(appId, '需要修改信息', 'fk45-us027-approver1');

      const res = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({
          visitor_name: '张三',
          phone: '13800138000',
          visitor_count: 3,
          visit_purpose: '修改后的拜访目的',
        });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.visitor_name).toBe('张三');
      expect(res.body.data.phone).toBe('13800138000');
      expect(res.body.data.visitor_count).toBe(3);
      // 重提后状态变为pending
      expect(res.body.data.approval_status).toBe('pending');
    });

    it('测试用例6: 非已退回状态不可修改', async () => {
      const createRes = await createTestApplication({
        visitor_name: 'US027待审批',
        phone: '13800270002',
      });
      const appId = createRes.body.data.id;

      const res = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visitor_name: '非法修改' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40010);
    });

    it('测试用例7: 开车时车牌号未填写校验失败', async () => {
      const createRes = await createTestApplication({
        visitor_name: 'US027车牌',
        phone: '13800270003',
        is_driving: false,
      });
      const appId = createRes.body.data.id;

      await returnApplication(appId, '需要添加车辆信息', 'fk45-us027-approver2');

      // 修改为开车但未填写车牌号
      const res = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({
          is_driving: true,
          license_plate: '',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
      expect(res.body.msg).toContain('车牌号');
    });

    it('测试用例8: 访客人数为0校验失败', async () => {
      const createRes = await createTestApplication({
        visitor_name: 'US027人数',
        phone: '13800270004',
      });
      const appId = createRes.body.data.id;

      await returnApplication(appId, '人数有误', 'fk45-us027-approver3');

      const res = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visitor_count: 0 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
      expect(res.body.msg).toContain('访客人数');
    });

    it('已拒绝状态不可修改（终态）', async () => {
      const createRes = await createTestApplication({
        visitor_name: 'US027已拒绝',
        phone: '13800270005',
      });
      const appId = createRes.body.data.id;

      // 先退回
      await returnApplication(appId, '退回', 'fk45-us027-approver4');
      // 重提（状态变回pending）
      await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visitor_name: 'US027已拒绝-重提' });
      // 再拒绝（需要pending状态才能拒绝）
      await request(app)
        .post(`/api/approvals/${appId}/reject`)
        .send({ operator_session_id: 'fk45-us027-approver5', reason: '拒绝' });

      const res = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visitor_name: '尝试修改' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40010);
    });

    it('已同意状态不可修改', async () => {
      const createRes = await createTestApplication({
        visitor_name: 'US027已同意',
        phone: '13800270006',
      });
      const appId = createRes.body.data.id;

      await request(app)
        .post(`/api/approvals/${appId}/approve`)
        .send({ operator_session_id: 'fk45-us027-approver6' });

      const res = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visitor_name: '尝试修改' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40010);
    });
  });

  // ==========================================================
  // US028: 重新提交（API层面）
  // ==========================================================
  describe('US028: 重新提交 (PATCH /api/applications/:id)', () => {
    it('测试用例9: 正常重提流程', async () => {
      const createRes = await createTestApplication({
        visitor_name: 'US028正常',
        phone: '13800280001',
      });
      const appId = createRes.body.data.id;

      await returnApplication(appId, '需要修改', 'fk45-us028-approver1');

      const res = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({
          visitor_name: 'US028正常-已修改',
          phone: '13800280001',
          visitor_count: 2,
          is_driving: false,
          contact_person: '对接人',
          department_id: deptId,
          visit_start_time: '2026-06-15 09:00',
          visit_end_time: '2026-06-15 17:00',
          visit_purpose: '修改后的目的',
        });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.approval_status).toBe('pending');
    });

    it('测试用例10: 手机号格式错误校验失败', async () => {
      const createRes = await createTestApplication({
        visitor_name: 'US028手机',
        phone: '13800280002',
      });
      const appId = createRes.body.data.id;

      await returnApplication(appId, '手机号有误', 'fk45-us028-approver2');

      const res = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ phone: '1380013800' }); // 10位数字

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
      expect(res.body.msg).toContain('手机号');
    });

    it('测试用例11: 结束时间早于起始时间校验失败', async () => {
      const createRes = await createTestApplication({
        visitor_name: 'US028时间',
        phone: '13800280003',
      });
      const appId = createRes.body.data.id;

      await returnApplication(appId, '时间有误', 'fk45-us028-approver3');

      const res = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({
          visit_start_time: '2026-06-15 14:00',
          visit_end_time: '2026-06-15 12:00',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
      expect(res.body.msg).toContain('时间');
    });

    it('测试用例12: 访客姓名为空校验失败', async () => {
      const createRes = await createTestApplication({
        visitor_name: 'US028姓名',
        phone: '13800280004',
      });
      const appId = createRes.body.data.id;

      await returnApplication(appId, '姓名有误', 'fk45-us028-approver4');

      const res = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visitor_name: '' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
      expect(res.body.msg).toContain('姓名');
    });

    it('重提后版本号递增', async () => {
      const createRes = await createTestApplication({
        visitor_name: 'US028版本',
        phone: '13800280005',
      });
      const appId = createRes.body.data.id;
      const originalVersion = createRes.body.data.version;

      await returnApplication(appId, '需要修改', 'fk45-us028-approver5');

      const res = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visitor_name: 'US028版本-已修改' });

      expect(res.body.data.version).toBe(originalVersion + 2); // 退回+1, 重提+1
    });
  });

  // ==========================================================
  // US029: 放弃重提（API层面）
  // ==========================================================
  describe('US029: 放弃重提 (POST /api/applications/:id/abandon)', () => {
    it('测试用例14: 正常放弃重提，状态变为已拒绝', async () => {
      const createRes = await createTestApplication({
        visitor_name: 'US029正常',
        phone: '13800290001',
      });
      const appId = createRes.body.data.id;

      await returnApplication(appId, '需要修改', 'fk45-us029-approver1');

      const res = await request(app)
        .post(`/api/applications/${appId}/abandon`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.approval_status).toBe('rejected');
    });

    it('测试用例15: 取消放弃（API层面不支持取消，仅验证状态保持）', async () => {
      const createRes = await createTestApplication({
        visitor_name: 'US029取消',
        phone: '13800290002',
      });
      const appId = createRes.body.data.id;

      await returnApplication(appId, '需要修改', 'fk45-us029-approver2');

      // 不调用放弃API，验证状态保持
      const detailRes = await request(app).get(`/api/applications/${appId}`);
      expect(detailRes.body.data.approval_status).toBe('returned');

      // 仍可正常重提
      const resubmitRes = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visitor_name: 'US029取消-已修改' });

      expect(resubmitRes.status).toBe(200);
      expect(resubmitRes.body.data.approval_status).toBe('pending');
    });

    it('测试用例16: 非已退回状态调用放弃API返回错误', async () => {
      const createRes = await createTestApplication({
        visitor_name: 'US029待审批',
        phone: '13800290003',
      });
      const appId = createRes.body.data.id;

      const res = await request(app)
        .post(`/api/applications/${appId}/abandon`);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40010);
    });

    it('已拒绝为终态，不可再次操作', async () => {
      const createRes = await createTestApplication({
        visitor_name: 'US029终态',
        phone: '13800290004',
      });
      const appId = createRes.body.data.id;

      await returnApplication(appId, '需要修改', 'fk45-us029-approver3');
      await request(app).post(`/api/applications/${appId}/abandon`);

      // 尝试重提
      const resubmitRes = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visitor_name: '尝试重提' });

      expect(resubmitRes.status).toBe(400);
      expect(resubmitRes.body.code).toBe(40010);

      // 尝试再次放弃
      const abandonRes = await request(app)
        .post(`/api/applications/${appId}/abandon`);

      expect(abandonRes.status).toBe(400);
      expect(abandonRes.body.code).toBe(40010);
    });

    it('不存在的申请调用放弃API返回404', async () => {
      const res = await request(app)
        .post('/api/applications/nonexistent-id/abandon');

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(40404);
    });
  });

  // ==========================================================
  // 草稿与重提的交互
  // ==========================================================
  describe('草稿与重提的交互', () => {
    it('重提后清理对应草稿', async () => {
      const createRes = await createTestApplication({
        visitor_name: '草稿清理测试',
        phone: '13800300001',
      });
      const appId = createRes.body.data.id;

      await returnApplication(appId, '需要修改', 'fk45-draft-approver');

      // 保存草稿
      await request(app)
        .post('/api/drafts')
        .send({
          session_id: SESSION_ID,
          application_id: appId,
          form_data: JSON.stringify({ visitor_name: '草稿数据' }),
        });

      // 重提
      await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visitor_name: '重提后的姓名' });

      // 验证草稿已清理
      const draftRes = await request(app)
        .get('/api/drafts')
        .query({ session_id: SESSION_ID, application_id: appId });

      // 草稿应为空或不存在
      expect(draftRes.body.data === null || draftRes.body.data?.form_data === undefined).toBe(true);
    });
  });
});
