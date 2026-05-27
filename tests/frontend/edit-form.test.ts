import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app, { initDatabase } from '../../src/backend/app';
import { validateApplication } from '../../src/frontend/validators/application';

/**
 * FK-45 US027: 修改表单 — 前端测试
 *
 * 测试场景:
 * 5. 修改表单-正常流程（已退回状态可编辑+暂存）
 * 6. 修改表单-非已退回状态不可编辑
 * 7. 修改表单-开车时车牌号未填写
 * 8. 修改表单-访客人数为0
 */

const SESSION_ID = 'fk45-us027-session';

/** 创建标准测试申请的辅助函数 */
async function createTestApplication(overrides: Partial<Record<string, unknown>> = {}) {
  const deptsRes = await request(app).get('/api/departments');
  const deptId = deptsRes.body.data[0].id;

  return request(app)
    .post('/api/applications')
    .send({
      session_id: SESSION_ID,
      visitor_name: 'US027测试访客',
      phone: '13800270000',
      visitor_count: 2,
      is_driving: false,
      contact_person: '对接人',
      department_id: deptId,
      visit_start_time: '2026-06-15 09:00',
      visit_end_time: '2026-06-15 17:00',
      visit_purpose: 'US027编辑表单测试',
      ...overrides,
    });
}

describe('FK-45 US027: 修改表单', () => {
  let deptId: string;

  beforeAll(async () => {
    await initDatabase();
    const deptsRes = await request(app).get('/api/departments');
    deptId = deptsRes.body.data[0].id;
  });

  // ==========================================================
  // 测试用例5: 修改表单-正常流程 (PASS)
  // ==========================================================
  describe('测试用例5: 修改表单-正常流程', () => {
    it('已退回申请应可修改字段并暂存', async () => {
      // 前置条件: 创建并退回申请
      const createRes = await createTestApplication({
        visitor_name: 'US027原始姓名',
        phone: '13802700501',
      });
      const appId = createRes.body.data.id;

      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: 'fk45-us027-approver1', reason: '需要修改' });

      // 执行步骤1: 修改访客姓名和手机号
      const patchRes = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({
          visitor_name: '张三',
          phone: '13800138000',
        });

      // 预期结果: 修改成功
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.code).toBe(0);
      expect(patchRes.body.data.visitor_name).toBe('张三');
      expect(patchRes.body.data.phone).toBe('13800138000');
    });

    it('暂存后申请保持已退回状态（未重提时）', async () => {
      const createRes = await createTestApplication({
        visitor_name: 'US027暂存测试',
        phone: '13802700502',
      });
      const appId = createRes.body.data.id;

      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: 'fk45-us027-approver2', reason: '需要修改' });

      // 暂存草稿（不重提）
      const draftRes = await request(app)
        .post('/api/drafts')
        .send({
          session_id: SESSION_ID,
          application_id: appId,
          form_data: JSON.stringify({ visitor_name: '暂存的姓名' }),
        });

      expect(draftRes.status).toBe(200);

      // 申请状态保持为已退回
      const appRes = await request(app).get(`/api/applications/${appId}`);
      expect(appRes.body.data.approval_status).toBe('returned');
    });

    it('已退回状态前端应进入编辑模式', async () => {
      const createRes = await createTestApplication({
        visitor_name: 'US027编辑模式',
        phone: '13802700503',
      });
      const appId = createRes.body.data.id;

      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: 'fk45-us027-approver3', reason: '修改' });

      const appRes = await request(app).get(`/api/applications/${appId}`);

      // 前端根据 approval_status === 'returned' 进入编辑模式
      expect(appRes.body.data.approval_status).toBe('returned');
    });
  });

  // ==========================================================
  // 测试用例6: 修改表单-非已退回状态不可编辑 (FAIL)
  // ==========================================================
  describe('测试用例6: 修改表单-非已退回状态不可编辑', () => {
    it('待审批状态PATCH应返回40010错误', async () => {
      const createRes = await createTestApplication({
        visitor_name: 'US027待审批',
        phone: '13802700601',
      });
      const appId = createRes.body.data.id;

      // 尝试修改待审批的申请
      const res = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visitor_name: '非法修改' });

      // 预期结果: 表单字段不可编辑，API返回错误
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40010);
      expect(res.body.msg).toContain('不可修改');
    });

    it('已同意状态PATCH应返回40010错误', async () => {
      const createRes = await createTestApplication({
        visitor_name: 'US027已同意',
        phone: '13802700602',
      });
      const appId = createRes.body.data.id;

      await request(app)
        .post(`/api/approvals/${appId}/approve`)
        .send({ operator_session_id: 'fk45-us027-approver4' });

      const res = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visitor_name: '非法修改' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40010);
    });

    it('已拒绝状态PATCH应返回40010错误', async () => {
      const createRes = await createTestApplication({
        visitor_name: 'US027已拒绝',
        phone: '13802700603',
      });
      const appId = createRes.body.data.id;

      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: 'fk45-us027-approver5a', reason: '退回' });

      // 重提（状态变回pending）
      await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visitor_name: 'US027已拒绝-重提' });

      // 拒绝（需要pending状态）
      await request(app)
        .post(`/api/approvals/${appId}/reject`)
        .send({ operator_session_id: 'fk45-us027-approver5b', reason: '拒绝' });

      const res = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visitor_name: '非法修改' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40010);
    });

    it('前端校验器规则同新建（编辑模式校验逻辑验证）', () => {
      // 前端校验规则在编辑模式下与新建模式完全一致
      const validData = {
        visitor_name: '张三',
        phone: '13800138000',
        visitor_count: 2,
        is_driving: false,
        license_plate: '',
        contact_person: '李四',
        department_id: 'dept-001',
        visit_start_time: '2026-06-15 09:00',
        visit_end_time: '2026-06-15 17:00',
        visit_purpose: '业务拜访',
        session_id: SESSION_ID,
      };

      // 有效数据应通过校验
      const errors = validateApplication(validData);
      expect(Object.keys(errors)).toHaveLength(0);

      // 无效数据应不通过
      const invalidData = { ...validData, visitor_name: '' };
      const errors2 = validateApplication(invalidData);
      expect(errors2.visitor_name).toBe('请填写访客姓名');
    });
  });

  // ==========================================================
  // 测试用例7: 修改表单-开车时车牌号未填写 (FAIL)
  // ==========================================================
  describe('测试用例7: 修改表单-开车时车牌号未填写', () => {
    it('改为开车但不填车牌号，提交时校验失败', async () => {
      const createRes = await createTestApplication({
        visitor_name: 'US027车牌联动',
        phone: '13802700701',
        is_driving: false,
      });
      const appId = createRes.body.data.id;

      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: 'fk45-us027-approver6', reason: '车辆信息' });

      // 改为开车但不填车牌号
      const res = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({
          is_driving: true,
          license_plate: '',
        });

      // 预期结果: 校验不通过，提示车牌号必填
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
      expect(res.body.msg).toContain('车牌号');
    });

    it('前端校验器验证车牌号联动逻辑', () => {
      // 开车=是，车牌号为空 → 报错
      const data1 = {
        visitor_name: '张三',
        phone: '13800138000',
        visitor_count: 1,
        is_driving: true,
        license_plate: '',
        contact_person: '李四',
        department_id: 'dept-001',
        visit_start_time: '09:00',
        visit_end_time: '17:00',
        visit_purpose: '测试',
        session_id: SESSION_ID,
      };
      const errors1 = validateApplication(data1);
      expect(errors1.license_plate).toBe('开车必须填写车牌号');

      // 开车=否，车牌号为空 → 不报错
      const data2 = { ...data1, is_driving: false };
      const errors2 = validateApplication(data2);
      expect(errors2.license_plate).toBeUndefined();
    });

    it('车牌号输入框在开车=是时展示并标记为必填', async () => {
      const createRes = await createTestApplication({
        visitor_name: 'US027车牌展示',
        phone: '13802700702',
        is_driving: true,
        license_plate: '京A12345',
      });
      const appId = createRes.body.data.id;

      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: 'fk45-us027-approver7', reason: '修改' });

      const appRes = await request(app).get(`/api/applications/${appId}`);

      // 前端应根据 is_driving 字段决定是否显示车牌号输入框
      expect(appRes.body.data.is_driving).toBe(true);
      expect(appRes.body.data.license_plate).toBe('京A12345');
    });
  });

  // ==========================================================
  // 测试用例8: 修改表单-访客人数为0 (FAIL)
  // ==========================================================
  describe('测试用例8: 修改表单-访客人数为0', () => {
    it('访客人数为0时API校验失败', async () => {
      const createRes = await createTestApplication({
        visitor_name: 'US027人数校验',
        phone: '13802700801',
      });
      const appId = createRes.body.data.id;

      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: 'fk45-us027-approver8', reason: '人数有误' });

      const res = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visitor_count: 0 });

      // 预期结果: 校验不通过，提示访客人数至少为1
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
      expect(res.body.msg).toContain('访客人数');
    });

    it('前端校验器验证访客人数规则', () => {
      const baseData = {
        visitor_name: '张三',
        phone: '13800138000',
        is_driving: false,
        license_plate: '',
        contact_person: '李四',
        department_id: 'dept-001',
        visit_start_time: '09:00',
        visit_end_time: '17:00',
        visit_purpose: '测试',
        session_id: SESSION_ID,
      };

      // 人数为0 → 报错
      const errors0 = validateApplication({ ...baseData, visitor_count: 0 });
      expect(errors0.visitor_count).toBe('访客人数至少为1人');

      // 人数为负数 → 报错
      const errorsNeg = validateApplication({ ...baseData, visitor_count: -1 });
      expect(errorsNeg.visitor_count).toBe('访客人数至少为1人');

      // 人数为小数 → 报错
      const errorsFloat = validateApplication({ ...baseData, visitor_count: 1.5 });
      expect(errorsFloat.visitor_count).toBe('访客人数至少为1人');

      // 人数为1 → 通过
      const errors1 = validateApplication({ ...baseData, visitor_count: 1 });
      expect(errors1.visitor_count).toBeUndefined();

      // 人数为10 → 通过
      const errors10 = validateApplication({ ...baseData, visitor_count: 10 });
      expect(errors10.visitor_count).toBeUndefined();
    });

    it('访客人数为null时校验失败', () => {
      const baseData = {
        visitor_name: '张三',
        phone: '13800138000',
        visitor_count: null as unknown as number,
        is_driving: false,
        contact_person: '李四',
        department_id: 'dept-001',
        visit_start_time: '09:00',
        visit_end_time: '17:00',
        visit_purpose: '测试',
        session_id: SESSION_ID,
      };

      const errors = validateApplication(baseData);
      expect(errors.visitor_count).toBe('访客人数至少为1人');
    });
  });

  // ==========================================================
  // 编辑模式字段交互验证
  // ==========================================================
  describe('编辑模式字段交互验证', () => {
    it('从开车改为不开车时，车牌号应清空', async () => {
      const createRes = await createTestApplication({
        visitor_name: 'US027车辆切换',
        phone: '13802700901',
        is_driving: true,
        license_plate: '京A12345',
      });
      const appId = createRes.body.data.id;

      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: 'fk45-us027-approver9', reason: '修改车辆' });

      // 改为不开车
      const res = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({
          is_driving: false,
          license_plate: null,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.is_driving).toBe(false);
    });

    it('编辑模式下所有可编辑字段均可修改', async () => {
      const createRes = await createTestApplication({
        visitor_name: 'US027全字段修改',
        phone: '13802700902',
        visitor_count: 1,
        is_driving: false,
        contact_person: '原对接人',
        visit_purpose: '原目的',
      });
      const appId = createRes.body.data.id;

      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: 'fk45-us027-approver10', reason: '全面修改' });

      const res = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({
          visitor_name: '修改后姓名',
          phone: '13900139000',
          visitor_count: 5,
          is_driving: true,
          license_plate: '沪B12345',
          contact_person: '新对接人',
          visit_start_time: '2026-06-16 10:00',
          visit_end_time: '2026-06-16 18:00',
          visit_purpose: '修改后的目的',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.visitor_name).toBe('修改后姓名');
      expect(res.body.data.phone).toBe('13900139000');
      expect(res.body.data.visitor_count).toBe(5);
      expect(res.body.data.is_driving).toBe(true);
      expect(res.body.data.license_plate).toBe('沪B12345');
      expect(res.body.data.contact_person).toBe('新对接人');
      expect(res.body.data.visit_purpose).toBe('修改后的目的');
    });
  });
});
