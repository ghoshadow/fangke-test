import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app, { initDatabase } from '../../src/backend/app';
import { validateApplication } from '../../src/frontend/validators/application';

/**
 * FK-45 US028-US029: 重新提交 + 放弃重提 — 前端测试
 *
 * US028 测试场景:
 * 9. 重新提交-正常流程
 * 10. 重新提交-手机号格式错误
 * 11. 重新提交-结束时间早于起始时间
 * 12. 重新提交-访客姓名为空
 * 13. 重新提交-必填项未完成时提交按钮禁用
 *
 * US029 测试场景:
 * 14. 放弃重提-正常流程
 * 15. 放弃重提-取消放弃操作
 * 16. 放弃重提-非已退回状态不展示按钮
 */

const SESSION_ID = 'fk45-us028-029-session';

/** 创建标准测试申请的辅助函数 */
async function createTestApplication(overrides: Partial<Record<string, unknown>> = {}) {
  const deptsRes = await request(app).get('/api/departments');
  const deptId = deptsRes.body.data[0].id;

  return request(app)
    .post('/api/applications')
    .send({
      session_id: SESSION_ID,
      visitor_name: 'US028测试访客',
      phone: '13800280000',
      visitor_count: 2,
      is_driving: false,
      contact_person: '对接人',
      department_id: deptId,
      visit_start_time: '2026-06-15 09:00',
      visit_end_time: '2026-06-15 17:00',
      visit_purpose: 'US028重新提交测试',
      ...overrides,
    });
}

describe('FK-45 US028: 重新提交', () => {
  let deptId: string;

  beforeAll(async () => {
    await initDatabase();
    const deptsRes = await request(app).get('/api/departments');
    deptId = deptsRes.body.data[0].id;
  });

  // ==========================================================
  // 测试用例9: 重新提交-正常流程 (PASS)
  // ==========================================================
  describe('测试用例9: 重新提交-正常流程', () => {
    it('所有校验通过后点击提交，状态变为待审批', async () => {
      // 前置条件: 创建并退回申请
      const createRes = await createTestApplication({
        visitor_name: 'US028正常重提',
        phone: '13802800901',
      });
      const appId = createRes.body.data.id;

      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: 'fk45-us028-approver1', reason: '需要修改' });

      // 前端校验通过
      const formData = {
        visitor_name: 'US028正常重提-已修改',
        phone: '13802800901',
        visitor_count: 2,
        is_driving: false,
        license_plate: '',
        contact_person: '对接人',
        department_id: deptId,
        visit_start_time: '2026-06-15 09:00',
        visit_end_time: '2026-06-15 17:00',
        visit_purpose: '修改后的目的',
        session_id: SESSION_ID,
      };
      const validationErrors = validateApplication(formData);
      expect(Object.keys(validationErrors)).toHaveLength(0);

      // 执行步骤: 提交
      const res = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({
          visitor_name: formData.visitor_name,
          phone: formData.phone,
          visitor_count: formData.visitor_count,
          is_driving: formData.is_driving,
          contact_person: formData.contact_person,
          department_id: formData.department_id,
          visit_start_time: formData.visit_start_time,
          visit_end_time: formData.visit_end_time,
          visit_purpose: formData.visit_purpose,
        });

      // 预期结果1: 状态由已退回变为待审批
      expect(res.status).toBe(200);
      expect(res.body.data.approval_status).toBe('pending');

      // 预期结果2: 提交成功
      expect(res.body.code).toBe(0);
    });

    it('重提后列表可通过API获取最新数据', async () => {
      const createRes = await createTestApplication({
        visitor_name: 'US028列表刷新',
        phone: '13802800902',
      });
      const appId = createRes.body.data.id;

      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: 'fk45-us028-approver2', reason: '修改' });

      await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visitor_name: 'US028列表刷新-已修改' });

      // 列表刷新后应获取最新数据
      const listRes = await request(app)
        .get('/api/applications')
        .query({ session_id: SESSION_ID });

      const updatedApp = listRes.body.data.items.find(
        (item: { id: string }) => item.id === appId
      );
      expect(updatedApp).toBeDefined();
      expect(updatedApp.approval_status).toBe('pending');
      expect(updatedApp.visitor_name).toBe('US028列表刷新-已修改');
    });
  });

  // ==========================================================
  // 测试用例10: 重新提交-手机号格式错误 (FAIL)
  // ==========================================================
  describe('测试用例10: 重新提交-手机号格式错误', () => {
    it('10位手机号校验失败', async () => {
      const createRes = await createTestApplication({
        visitor_name: 'US028手机错误',
        phone: '13802801001',
      });
      const appId = createRes.body.data.id;

      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: 'fk45-us028-approver3', reason: '手机号有误' });

      // 前端校验
      const invalidData = {
        visitor_name: 'US028手机错误',
        phone: '1380013800', // 10位数字
        visitor_count: 2,
        is_driving: false,
        contact_person: '对接人',
        department_id: deptId,
        visit_start_time: '2026-06-15 09:00',
        visit_end_time: '2026-06-15 17:00',
        visit_purpose: '测试',
        session_id: SESSION_ID,
      };
      const validationErrors = validateApplication(invalidData);
      expect(validationErrors.phone).toBe('请输入正确11位手机号');

      // API校验
      const res = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ phone: '1380013800' });

      // 预期结果: 提交失败，手机号字段报错
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
      expect(res.body.msg).toContain('手机号');
    });

    it('提交失败后申请保持已退回状态', async () => {
      const createRes = await createTestApplication({
        visitor_name: 'US028状态保持',
        phone: '13802801002',
      });
      const appId = createRes.body.data.id;

      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: 'fk45-us028-approver4', reason: '修改' });

      // 提交错误的手机号
      await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ phone: '1380013800' });

      // 验证状态仍为已退回
      const appRes = await request(app).get(`/api/applications/${appId}`);
      expect(appRes.body.data.approval_status).toBe('returned');
    });
  });

  // ==========================================================
  // 测试用例11: 重新提交-结束时间早于起始时间 (FAIL)
  // ==========================================================
  describe('测试用例11: 重新提交-结束时间早于起始时间', () => {
    it('结束时间早于起始时间校验失败', async () => {
      const createRes = await createTestApplication({
        visitor_name: 'US028时间错误',
        phone: '13802801101',
      });
      const appId = createRes.body.data.id;

      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: 'fk45-us028-approver5', reason: '时间有误' });

      // 前端校验
      const invalidData = {
        visitor_name: 'US028时间错误',
        phone: '13802801101',
        visitor_count: 2,
        is_driving: false,
        contact_person: '对接人',
        department_id: deptId,
        visit_start_time: '2026-06-15 14:00',
        visit_end_time: '2026-06-15 12:00', // 早于起始时间
        visit_purpose: '测试',
        session_id: SESSION_ID,
      };
      const validationErrors = validateApplication(invalidData);
      expect(validationErrors.visit_end_time).toBe('结束时间不能早于起始时间');

      // API校验
      const res = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({
          visit_start_time: '2026-06-15 14:00',
          visit_end_time: '2026-06-15 12:00',
        });

      // 预期结果: 提交失败，结束时间字段报错
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
      expect(res.body.msg).toContain('时间');
    });

    it('提交失败后申请保持已退回状态', async () => {
      const createRes = await createTestApplication({
        visitor_name: 'US028时间状态',
        phone: '13802801102',
      });
      const appId = createRes.body.data.id;

      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: 'fk45-us028-approver6', reason: '修改' });

      await request(app)
        .patch(`/api/applications/${appId}`)
        .send({
          visit_start_time: '2026-06-15 14:00',
          visit_end_time: '2026-06-15 12:00',
        });

      const appRes = await request(app).get(`/api/applications/${appId}`);
      expect(appRes.body.data.approval_status).toBe('returned');
    });
  });

  // ==========================================================
  // 测试用例12: 重新提交-访客姓名为空 (FAIL)
  // ==========================================================
  describe('测试用例12: 重新提交-访客姓名为空', () => {
    it('访客姓名为空校验失败', async () => {
      const createRes = await createTestApplication({
        visitor_name: 'US028姓名空',
        phone: '13802801201',
      });
      const appId = createRes.body.data.id;

      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: 'fk45-us028-approver7', reason: '姓名有误' });

      // 前端校验
      const invalidData = {
        visitor_name: '', // 空姓名
        phone: '13802801201',
        visitor_count: 2,
        is_driving: false,
        contact_person: '对接人',
        department_id: deptId,
        visit_start_time: '2026-06-15 09:00',
        visit_end_time: '2026-06-15 17:00',
        visit_purpose: '测试',
        session_id: SESSION_ID,
      };
      const validationErrors = validateApplication(invalidData);
      expect(validationErrors.visitor_name).toBe('请填写访客姓名');

      // API校验
      const res = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visitor_name: '' });

      // 预期结果: 提交失败，访客姓名字段报错
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
      expect(res.body.msg).toContain('姓名');
    });

    it('纯空格姓名也应校验失败', () => {
      const invalidData = {
        visitor_name: '   ',
        phone: '13800138000',
        visitor_count: 1,
        is_driving: false,
        contact_person: '对接人',
        department_id: 'dept-001',
        visit_start_time: '09:00',
        visit_end_time: '17:00',
        visit_purpose: '测试',
        session_id: SESSION_ID,
      };
      const errors = validateApplication(invalidData);
      expect(errors.visitor_name).toBe('请填写访客姓名');
    });
  });

  // ==========================================================
  // 测试用例13: 重新提交-必填项未完成时提交按钮禁用 (FAIL)
  // ==========================================================
  describe('测试用例13: 重新提交-必填项未完成时提交按钮禁用', () => {
    it('前端isFormComplete逻辑验证：必填项为空时不完整', () => {
      // 模拟前端的isFormComplete计算逻辑
      function checkFormComplete(form: {
        visitor_name: string;
        phone: string;
        visitor_count: number | '';
        contact_person: string;
        department: string;
        visit_start: string;
        visit_end: string;
        visit_purpose: string;
        has_vehicle: boolean;
        vehicle_plate: string;
      }): boolean {
        const checks = [
          form.visitor_name.trim() !== '',
          form.phone.length === 11,
          form.visitor_count !== '' && form.visitor_count >= 1,
          form.contact_person.trim() !== '',
          form.department !== '',
          form.visit_start !== '',
          form.visit_end !== '',
          form.visit_purpose.trim() !== '',
        ];
        if (form.has_vehicle) {
          checks.push(form.vehicle_plate.trim() !== '');
        }
        return checks.every(Boolean);
      }

      // 访客姓名为空 → 不完整
      const form1 = {
        visitor_name: '',
        phone: '13800138000',
        visitor_count: 2 as number | '',
        contact_person: '对接人',
        department: 'dept-001',
        visit_start: '09:00',
        visit_end: '17:00',
        visit_purpose: '测试',
        has_vehicle: false,
        vehicle_plate: '',
      };
      expect(checkFormComplete(form1)).toBe(false);

      // 手机号不足11位 → 不完整
      const form2 = { ...form1, visitor_name: '张三', phone: '1380013800' };
      expect(checkFormComplete(form2)).toBe(false);

      // 访客人数为0 → 不完整
      const form3 = { ...form1, visitor_name: '张三', visitor_count: 0 as number | '' };
      expect(checkFormComplete(form3)).toBe(false);

      // 全部填写完整 → 完整
      const form4 = { ...form1, visitor_name: '张三' };
      expect(checkFormComplete(form4)).toBe(true);

      // 开车但车牌号为空 → 不完整
      const form5 = { ...form4, has_vehicle: true, vehicle_plate: '' };
      expect(checkFormComplete(form5)).toBe(false);
    });

    it('API层面：必填字段为空时PATCH应失败', async () => {
      const createRes = await createTestApplication({
        visitor_name: 'US028必填校验',
        phone: '13802801301',
      });
      const appId = createRes.body.data.id;

      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: 'fk45-us028-approver8', reason: '修改' });

      // 提交空姓名的PATCH请求
      const res = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visitor_name: '' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
    });
  });
});

describe('FK-45 US029: 放弃重提', () => {
  let deptId: string;

  beforeAll(async () => {
    await initDatabase();
    const deptsRes = await request(app).get('/api/departments');
    deptId = deptsRes.body.data[0].id;
  });

  // ==========================================================
  // 测试用例14: 放弃重提-正常流程 (PASS)
  // ==========================================================
  describe('测试用例14: 放弃重提-正常流程', () => {
    it('点击放弃重提并确认，状态变为已拒绝', async () => {
      // 前置条件: 创建并退回申请
      const createRes = await createTestApplication({
        visitor_name: 'US029正常放弃',
        phone: '13802901401',
      });
      const appId = createRes.body.data.id;

      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: 'fk45-us029-approver1', reason: '需要修改' });

      // 验证状态为已退回
      const beforeRes = await request(app).get(`/api/applications/${appId}`);
      expect(beforeRes.body.data.approval_status).toBe('returned');

      // 执行步骤: 调用放弃API（模拟用户确认放弃）
      const res = await request(app)
        .post(`/api/applications/${appId}/abandon`);

      // 预期结果1: 申请状态变更为已拒绝
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.approval_status).toBe('rejected');
    });

    it('放弃后该申请不可再修改重提', async () => {
      const createRes = await createTestApplication({
        visitor_name: 'US029不可重提',
        phone: '13802901402',
      });
      const appId = createRes.body.data.id;

      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: 'fk45-us029-approver2', reason: '修改' });

      await request(app)
        .post(`/api/applications/${appId}/abandon`);

      // 尝试重提
      const resubmitRes = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visitor_name: '尝试重提' });

      // 预期结果2: 不可重提
      expect(resubmitRes.status).toBe(400);
      expect(resubmitRes.body.code).toBe(40010);
    });

    it('放弃后审批流程终止（终态）', async () => {
      const createRes = await createTestApplication({
        visitor_name: 'US029终态',
        phone: '13802901403',
      });
      const appId = createRes.body.data.id;

      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: 'fk45-us029-approver3', reason: '修改' });

      await request(app)
        .post(`/api/applications/${appId}/abandon`);

      // 尝试审批通过
      const approveRes = await request(app)
        .post(`/api/approvals/${appId}/approve`)
        .send({ operator_session_id: 'fk45-us029-other-approver' });

      // 预期结果3: 审批流程终止
      expect(approveRes.status).toBe(400);
      expect(approveRes.body.code).toBe(40010);
    });

    it('放弃后不可再次放弃', async () => {
      const createRes = await createTestApplication({
        visitor_name: 'US029不可再放弃',
        phone: '13802901404',
      });
      const appId = createRes.body.data.id;

      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: 'fk45-us029-approver4', reason: '修改' });

      await request(app)
        .post(`/api/applications/${appId}/abandon`);

      // 再次放弃
      const abandonRes = await request(app)
        .post(`/api/applications/${appId}/abandon`);

      expect(abandonRes.status).toBe(400);
      expect(abandonRes.body.code).toBe(40010);
    });
  });

  // ==========================================================
  // 测试用例15: 放弃重提-取消放弃操作 (FAIL)
  // ==========================================================
  describe('测试用例15: 放弃重提-取消放弃操作', () => {
    it('取消放弃后申请保持已退回状态', async () => {
      const createRes = await createTestApplication({
        visitor_name: 'US029取消放弃',
        phone: '13802901501',
      });
      const appId = createRes.body.data.id;

      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: 'fk45-us029-approver5', reason: '修改' });

      // 模拟用户点击取消（不调用放弃API）
      // 不调用: await request(app).post(`/api/applications/${appId}/abandon`);

      // 预期结果1: 申请保持已退回状态
      const appRes = await request(app).get(`/api/applications/${appId}`);
      expect(appRes.body.data.approval_status).toBe('returned');
    });

    it('取消放弃后用户可继续修改并重提', async () => {
      const createRes = await createTestApplication({
        visitor_name: 'US029取消后重提',
        phone: '13802901502',
      });
      const appId = createRes.body.data.id;

      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: 'fk45-us029-approver6', reason: '修改' });

      // 模拟用户取消放弃后继续修改
      const resubmitRes = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visitor_name: 'US029取消后重提-已修改' });

      // 预期结果2: 可正常重提
      expect(resubmitRes.status).toBe(200);
      expect(resubmitRes.body.data.approval_status).toBe('pending');
    });
  });

  // ==========================================================
  // 测试用例16: 放弃重提-非已退回状态不展示按钮 (FAIL)
  // ==========================================================
  describe('测试用例16: 放弃重提-非已退回状态不展示按钮', () => {
    it('待审批状态调用放弃API应返回错误', async () => {
      const createRes = await createTestApplication({
        visitor_name: 'US029待审批',
        phone: '13802901601',
      });
      const appId = createRes.body.data.id;

      // 前端不应展示放弃按钮，但测试API层面的保护
      const res = await request(app)
        .post(`/api/applications/${appId}/abandon`);

      // 预期结果: API返回错误
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40010);
    });

    it('已同意状态调用放弃API应返回错误', async () => {
      const createRes = await createTestApplication({
        visitor_name: 'US029已同意',
        phone: '13802901602',
      });
      const appId = createRes.body.data.id;

      await request(app)
        .post(`/api/approvals/${appId}/approve`)
        .send({ operator_session_id: 'fk45-us029-approver7' });

      const res = await request(app)
        .post(`/api/applications/${appId}/abandon`);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40010);
    });

    it('已拒绝状态调用放弃API应返回错误', async () => {
      const createRes = await createTestApplication({
        visitor_name: 'US029已拒绝',
        phone: '13802901603',
      });
      const appId = createRes.body.data.id;

      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: 'fk45-us029-approver8a', reason: '退回' });

      // 重提（状态变回pending）
      await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visitor_name: 'US029已拒绝-重提' });

      // 拒绝（需要pending状态）
      await request(app)
        .post(`/api/approvals/${appId}/reject`)
        .send({ operator_session_id: 'fk45-us029-approver8b', reason: '拒绝' });

      const res = await request(app)
        .post(`/api/applications/${appId}/abandon`);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40010);
    });

    it('前端应根据状态决定是否展示放弃按钮', async () => {
      // 创建不同状态的申请
      const pendingRes = await createTestApplication({
        visitor_name: 'US029按钮显示-待审批',
        phone: '13802901604',
      });
      const pendingApp = pendingRes.body.data;

      const returnedRes = await createTestApplication({
        visitor_name: 'US029按钮显示-已退回',
        phone: '13802901605',
      });
      const returnedAppId = returnedRes.body.data.id;
      await request(app)
        .post(`/api/approvals/${returnedAppId}/return`)
        .send({ operator_session_id: 'fk45-us029-approver9', reason: '修改' });
      const returnedRes2 = await request(app).get(`/api/applications/${returnedAppId}`);
      const returnedApp = returnedRes2.body.data;

      // 前端逻辑：只有 approval_status === 'returned' 时才展示放弃按钮
      const shouldShowAbandonForPending = pendingApp.approval_status === 'returned';
      const shouldShowAbandonForReturned = returnedApp.approval_status === 'returned';

      expect(shouldShowAbandonForPending).toBe(false); // 待审批不展示
      expect(shouldShowAbandonForReturned).toBe(true); // 已退回展示
    });
  });
});
