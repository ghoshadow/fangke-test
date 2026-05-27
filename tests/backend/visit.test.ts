/**
 * FK-43: 【综合测试】通行核验 — US020 确认到访操作 + US021 通行状态更新
 *
 * 测试用例覆盖：
 *   US020 #13 确认到访-正常流程弹出时间选择器
 *   US020 #14 确认到访-选择时间并提交成功
 *   US020 #15 确认到访-未选择实际到访时间直接提交（VR1）
 *   US020 #16 确认到访-对已到访记录重复操作（VR2）
 *   US020 #17 确认到访-审批状态非已同意（VR3）
 *   US021 #18 查看通行状态更新-详情页状态更新确认
 *   US021 #19 查看通行状态更新-列表页状态同步确认
 *   US021 #20 查看通行状态更新-对终态记录尝试操作（VR1）
 *   US021 #21 查看通行状态更新-已到访但缺少实际到访时间（VR2）
 */

import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { initDatabase } from '../../src/backend/config';
import { DepartmentModel } from '../../src/backend/models/department';
import { ApplicationModel } from '../../src/backend/models/application';
import { VisitorPassModel } from '../../src/backend/models/visitor-pass';
import passRoutes from '../../src/backend/routes/pass';
import { errorHandler } from '../../src/backend/middleware/response';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/passes', passRoutes);
  app.use(errorHandler);
  return app;
}

describe('FK-43: US020 + US021 确认到访与通行状态更新', () => {
  let testApp: ReturnType<typeof createTestApp>;
  let deptId: string;

  beforeAll(async () => {
    await initDatabase();
    testApp = createTestApp();
    const depts = DepartmentModel.findAll();
    deptId = depts[0].id;
  });

  /** 辅助：创建一个已审批通过的通行证 */
  function createApprovedPass(overrides: {
    visitor_name?: string;
    phone?: string;
    id_card?: string;
    session_id?: string;
  } = {}) {
    const app = ApplicationModel.create({
      visitor_name: overrides.visitor_name ?? '到访测试访客',
      phone: overrides.phone ?? '13100001111',
      id_card: overrides.id_card ?? '110101199001011234',
      visitor_count: 1,
      is_driving: false,
      contact_person: '对接人',
      department_id: deptId,
      visit_start_time: '2024-05-15T09:00:00.000Z',
      visit_end_time: '2024-05-15T17:00:00.000Z',
      visit_purpose: '确认到访测试',
      session_id: overrides.session_id ?? 'fk43-visit-session',
    });

    ApplicationModel.updateApprovalStatus(app.id, 'approved', app.version);
    const pass = VisitorPassModel.create({ application_id: app.id });

    return { application: app, pass };
  }

  // ============================================================
  // US020 #13: 确认到访-正常流程弹出时间选择器
  // ============================================================
  describe('US020 #13: 确认到访-正常流程', () => {
    it('通行证审批状态为已同意且通行状态为未到访，可执行确认到访', async () => {
      const { pass } = createApprovedPass({ visitor_name: '正常流程访客', phone: '13100001001' });

      // 验证初始状态
      const detailRes = await request(testApp).get(`/api/passes/${pass.id}`);
      expect(detailRes.status).toBe(200);
      expect(detailRes.body.data.pass_status).toBe('not_visited');
      expect(detailRes.body.data.application.approval_status).toBe('approved');
    });

    it('确认到访接口接收 HH:mm 格式的实际到访时间', async () => {
      const { pass } = createApprovedPass({ visitor_name: '时间格式访客', phone: '13100001002' });

      const res = await request(testApp)
        .post(`/api/passes/${pass.id}/confirm`)
        .send({ actual_visit_time: '14:30' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
    });

    it('时间选择器精确到时分', async () => {
      const { pass } = createApprovedPass({ visitor_name: '精确时分访客', phone: '13100001003' });

      // HH:mm 格式确认到访
      const res = await request(testApp)
        .post(`/api/passes/${pass.id}/confirm`)
        .send({ actual_visit_time: '09:05' });

      expect(res.status).toBe(200);
      expect(res.body.data.actual_visit_time).toBe('09:05');
    });
  });

  // ============================================================
  // US020 #14: 确认到访-选择时间并提交成功
  // ============================================================
  describe('US020 #14: 确认到访-选择时间并提交成功', () => {
    it('提交确认到访后系统返回成功', async () => {
      const { pass } = createApprovedPass({ visitor_name: '提交成功访客', phone: '13100002001' });

      const res = await request(testApp)
        .post(`/api/passes/${pass.id}/confirm`)
        .send({ actual_visit_time: '14:30' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.msg).toBe('success');
    });

    it('通行状态由"未到访"更新为"已到访"', async () => {
      const { pass } = createApprovedPass({ visitor_name: '状态更新访客', phone: '13100002002' });

      const res = await request(testApp)
        .post(`/api/passes/${pass.id}/confirm`)
        .send({ actual_visit_time: '14:30' });

      expect(res.body.data.pass_status).toBe('visited');
    });

    it('记录不可再回滚，已到访为流程终态', async () => {
      const { pass } = createApprovedPass({ visitor_name: '终态测试访客', phone: '13100002003' });

      // 确认到访
      await request(testApp)
        .post(`/api/passes/${pass.id}/confirm`)
        .send({ actual_visit_time: '10:00' });

      // 再次尝试确认，应被拦截（终态不可回滚）
      const retryRes = await request(testApp)
        .post(`/api/passes/${pass.id}/confirm`)
        .send({ actual_visit_time: '11:00' });

      expect(retryRes.status).toBe(400);
      expect(retryRes.body.code).toBe(40020);
    });

    it('申请表的 pass_status 同步更新为 visited', async () => {
      const { application, pass } = createApprovedPass({ visitor_name: '同步更新访客', phone: '13100002004' });

      await request(testApp)
        .post(`/api/passes/${pass.id}/confirm`)
        .send({ actual_visit_time: '14:30' });

      const updatedApp = ApplicationModel.findById(application.id);
      expect(updatedApp!.pass_status).toBe('visited');
    });
  });

  // ============================================================
  // US020 #15: 确认到访-未选择实际到访时间直接提交（违反VR1）
  // ============================================================
  describe('US020 #15: 未选择实际到访时间直接提交（违反VR1）', () => {
    it('不传 actual_visit_time，系统阻止提交', async () => {
      const { pass } = createApprovedPass({ visitor_name: '缺少时间访客', phone: '13100003001' });

      const res = await request(testApp)
        .post(`/api/passes/${pass.id}/confirm`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40021);
      expect(res.body.data).toBeNull();
    });

    it('actual_visit_time 为空字符串，系统阻止提交', async () => {
      const { pass } = createApprovedPass({ visitor_name: '空字符串时间访客', phone: '13100003002' });

      const res = await request(testApp)
        .post(`/api/passes/${pass.id}/confirm`)
        .send({ actual_visit_time: '' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40021);
    });

    it('actual_visit_time 为 null，系统阻止提交', async () => {
      const { pass } = createApprovedPass({ visitor_name: 'null时间访客', phone: '13100003003' });

      const res = await request(testApp)
        .post(`/api/passes/${pass.id}/confirm`)
        .send({ actual_visit_time: null });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40021);
    });

    it('阻止提交后通行证状态不变', async () => {
      const { pass } = createApprovedPass({ visitor_name: '状态不变访客', phone: '13100003004' });

      // 尝试无时间提交
      await request(testApp)
        .post(`/api/passes/${pass.id}/confirm`)
        .send({});

      // 验证状态未变
      const detailRes = await request(testApp).get(`/api/passes/${pass.id}`);
      expect(detailRes.body.data.pass_status).toBe('not_visited');
      expect(detailRes.body.data.actual_visit_time).toBeNull();
    });
  });

  // ============================================================
  // US020 #16: 确认到访-对已到访记录重复操作（违反VR2）
  // ============================================================
  describe('US020 #16: 对已到访记录重复操作（违反VR2）', () => {
    it('对已到访的通行证再次确认，系统阻止操作', async () => {
      const { pass } = createApprovedPass({ visitor_name: '重复操作访客', phone: '13100004001' });

      // 第一次确认成功
      const firstRes = await request(testApp)
        .post(`/api/passes/${pass.id}/confirm`)
        .send({ actual_visit_time: '09:00' });
      expect(firstRes.status).toBe(200);

      // 第二次确认被拦截
      const secondRes = await request(testApp)
        .post(`/api/passes/${pass.id}/confirm`)
        .send({ actual_visit_time: '11:00' });

      expect(secondRes.status).toBe(400);
      expect(secondRes.body.code).toBe(40020);
    });

    it('重复操作提示信息包含"不可重复"', async () => {
      const { pass } = createApprovedPass({ visitor_name: '提示信息访客', phone: '13100004002' });

      await request(testApp)
        .post(`/api/passes/${pass.id}/confirm`)
        .send({ actual_visit_time: '09:00' });

      const res = await request(testApp)
        .post(`/api/passes/${pass.id}/confirm`)
        .send({ actual_visit_time: '10:00' });

      expect(res.body.msg).toContain('不可重复');
    });

    it('重复确认后 actual_visit_time 保持第一次的值', async () => {
      const { pass } = createApprovedPass({ visitor_name: '时间保持访客', phone: '13100004003' });

      await request(testApp)
        .post(`/api/passes/${pass.id}/confirm`)
        .send({ actual_visit_time: '08:30' });

      // 尝试第二次确认
      await request(testApp)
        .post(`/api/passes/${pass.id}/confirm`)
        .send({ actual_visit_time: '15:00' });

      // 验证时间未变
      const detailRes = await request(testApp).get(`/api/passes/${pass.id}`);
      expect(detailRes.body.data.actual_visit_time).toBe('08:30');
    });
  });

  // ============================================================
  // US020 #17: 确认到访-审批状态非已同意（违反VR3）
  // ============================================================
  describe('US020 #17: 确认到访-审批状态非已同意（违反VR3）', () => {
    it('审批中的申请对应通行证（异常数据），确认到访被拦截', async () => {
      // 创建 pending 申请并手动创建通行证（模拟异常数据）
      const pendingApp = ApplicationModel.create({
        visitor_name: '审批中访客',
        phone: '13100005001',
        visitor_count: 1,
        is_driving: false,
        contact_person: '对接人',
        department_id: deptId,
        visit_start_time: '2024-05-15T09:00:00.000Z',
        visit_end_time: '2024-05-15T17:00:00.000Z',
        visit_purpose: '审批中确认测试',
        session_id: 'fk43-visit-pending',
      });
      const abnormalPass = VisitorPassModel.create({ application_id: pendingApp.id });

      const res = await request(testApp)
        .post(`/api/passes/${abnormalPass.id}/confirm`)
        .send({ actual_visit_time: '14:00' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40022);
      expect(res.body.msg).toContain('未审批通过');
    });

    it('已拒绝的申请对应通行证（异常数据），确认到访被拦截', async () => {
      const rejectedApp = ApplicationModel.create({
        visitor_name: '已拒绝访客',
        phone: '13100005002',
        visitor_count: 1,
        is_driving: false,
        contact_person: '对接人',
        department_id: deptId,
        visit_start_time: '2024-05-15T09:00:00.000Z',
        visit_end_time: '2024-05-15T17:00:00.000Z',
        visit_purpose: '已拒绝确认测试',
        session_id: 'fk43-visit-rejected',
      });
      ApplicationModel.updateApprovalStatus(rejectedApp.id, 'rejected', rejectedApp.version);
      const abnormalPass = VisitorPassModel.create({ application_id: rejectedApp.id });

      const res = await request(testApp)
        .post(`/api/passes/${abnormalPass.id}/confirm`)
        .send({ actual_visit_time: '14:00' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40022);
      expect(res.body.msg).toContain('未审批通过');
    });

    it('审批状态拦截不影响正常通行证的确认操作', async () => {
      const { pass } = createApprovedPass({ visitor_name: '正常确认访客', phone: '13100005003' });

      const res = await request(testApp)
        .post(`/api/passes/${pass.id}/confirm`)
        .send({ actual_visit_time: '14:30' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
    });
  });

  // ============================================================
  // US021 #18: 查看通行状态更新-详情页状态更新确认
  // ============================================================
  describe('US021 #18: 详情页状态更新确认', () => {
    it('确认到访后，详情页通行状态字段显示为"已到访"', async () => {
      const { pass } = createApprovedPass({ visitor_name: '详情状态更新访客', phone: '13100006001' });

      await request(testApp)
        .post(`/api/passes/${pass.id}/confirm`)
        .send({ actual_visit_time: '14:30' });

      const res = await request(testApp).get(`/api/passes/${pass.id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.pass_status).toBe('visited');
    });

    it('实际到访时间字段已填充为刚填写的值', async () => {
      const { pass } = createApprovedPass({ visitor_name: '到访时间填充访客', phone: '13100006002' });

      await request(testApp)
        .post(`/api/passes/${pass.id}/confirm`)
        .send({ actual_visit_time: '14:30' });

      const res = await request(testApp).get(`/api/passes/${pass.id}`);
      expect(res.body.data.actual_visit_time).toBe('14:30');
    });

    it('确认到访后再次查看详情，通行状态仍为已到访（终态）', async () => {
      const { pass } = createApprovedPass({ visitor_name: '终态持久访客', phone: '13100006003' });

      await request(testApp)
        .post(`/api/passes/${pass.id}/confirm`)
        .send({ actual_visit_time: '09:15' });

      // 多次查看详情，状态不变
      const res1 = await request(testApp).get(`/api/passes/${pass.id}`);
      expect(res1.body.data.pass_status).toBe('visited');
      expect(res1.body.data.actual_visit_time).toBe('09:15');

      const res2 = await request(testApp).get(`/api/passes/${pass.id}`);
      expect(res2.body.data.pass_status).toBe('visited');
      expect(res2.body.data.actual_visit_time).toBe('09:15');
    });
  });

  // ============================================================
  // US021 #19: 查看通行状态更新-列表页状态同步确认
  // ============================================================
  describe('US021 #19: 列表页状态同步确认', () => {
    it('确认到访后，列表页中该访客的通行状态由"未到访"更新为"已到访"', async () => {
      const { pass } = createApprovedPass({ visitor_name: '列表同步访客', phone: '13100007001' });

      // 确认到访前，列表中应为 not_visited
      const beforeRes = await request(testApp).get('/api/passes');
      const beforeItem = beforeRes.body.data.items.find(
        (i: { id: string }) => i.id === pass.id,
      );
      expect(beforeItem).toBeDefined();
      expect(beforeItem.pass_status).toBe('not_visited');

      // 执行确认到访
      await request(testApp)
        .post(`/api/passes/${pass.id}/confirm`)
        .send({ actual_visit_time: '14:30' });

      // 确认到访后，列表中应为 visited
      const afterRes = await request(testApp).get('/api/passes');
      const afterItem = afterRes.body.data.items.find(
        (i: { id: string }) => i.id === pass.id,
      );
      expect(afterItem).toBeDefined();
      expect(afterItem.pass_status).toBe('visited');
    });

    it('前端展示与后端数据保持一致', async () => {
      const { pass } = createApprovedPass({ visitor_name: '前后端一致访客', phone: '13100007002' });

      await request(testApp)
        .post(`/api/passes/${pass.id}/confirm`)
        .send({ actual_visit_time: '16:45' });

      // 列表接口和详情接口返回的状态应一致
      const listRes = await request(testApp).get('/api/passes');
      const detailRes = await request(testApp).get(`/api/passes/${pass.id}`);

      const listItem = listRes.body.data.items.find(
        (i: { id: string }) => i.id === pass.id,
      );

      expect(listItem.pass_status).toBe(detailRes.body.data.pass_status);
      expect(listItem.pass_status).toBe('visited');
    });
  });

  // ============================================================
  // US021 #20: 查看通行状态更新-对终态记录尝试操作（违反VR1）
  // ============================================================
  describe('US021 #20: 对终态记录尝试操作（违反VR1）', () => {
    it('已到访的通行证再次确认到访，返回错误提示', async () => {
      const { pass } = createApprovedPass({ visitor_name: '终态操作访客', phone: '13100008001' });

      // 先确认到访
      await request(testApp)
        .post(`/api/passes/${pass.id}/confirm`)
        .send({ actual_visit_time: '09:00' });

      // 再次尝试确认
      const res = await request(testApp)
        .post(`/api/passes/${pass.id}/confirm`)
        .send({ actual_visit_time: '10:00' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40020);
      expect(res.body.msg).toContain('不可重复');
    });

    it('终态记录仅可查看不可再执行任何变更操作', async () => {
      const { pass } = createApprovedPass({ visitor_name: '仅查看访客', phone: '13100008002' });

      // 确认到访
      await request(testApp)
        .post(`/api/passes/${pass.id}/confirm`)
        .send({ actual_visit_time: '11:00' });

      // 详情可查看
      const detailRes = await request(testApp).get(`/api/passes/${pass.id}`);
      expect(detailRes.status).toBe(200);
      expect(detailRes.body.data.pass_status).toBe('visited');
      expect(detailRes.body.data.actual_visit_time).toBe('11:00');

      // 变更操作被拦截
      const changeRes = await request(testApp)
        .post(`/api/passes/${pass.id}/confirm`)
        .send({ actual_visit_time: '15:00' });
      expect(changeRes.status).toBe(400);
    });

    it('终态记录的实际到访时间不被后续操作覆盖', async () => {
      const { pass } = createApprovedPass({ visitor_name: '时间不覆盖访客', phone: '13100008003' });

      await request(testApp)
        .post(`/api/passes/${pass.id}/confirm`)
        .send({ actual_visit_time: '08:00' });

      // 尝试用不同时间再次确认
      await request(testApp)
        .post(`/api/passes/${pass.id}/confirm`)
        .send({ actual_visit_time: '18:00' });

      const res = await request(testApp).get(`/api/passes/${pass.id}`);
      expect(res.body.data.actual_visit_time).toBe('08:00'); // 保持原值
    });
  });

  // ============================================================
  // US021 #21: 查看通行状态更新-已到访但缺少实际到访时间（违反VR2）
  // ============================================================
  describe('US021 #21: 已到访但缺少实际到访时间（违反VR2）', () => {
    it('模拟数据异常：已到访但缺少实际到访时间', async () => {
      // 通过模型直接创建异常数据：已到访但 actual_visit_time 为空
      const { application, pass } = createApprovedPass({
        visitor_name: '数据异常访客',
        phone: '13100009001',
      });

      // 直接通过数据库操作制造异常数据
      const { getDatabase } = await import('../../src/backend/config');
      const db = getDatabase();
      db.run(
        "UPDATE visitor_pass SET pass_status = 'visited', actual_visit_time = NULL WHERE id = ?",
        [pass.id],
      );

      // 查看详情
      const res = await request(testApp).get(`/api/passes/${pass.id}`);
      expect(res.status).toBe(200);

      const data = res.body.data;
      // 通行状态为已到访
      expect(data.pass_status).toBe('visited');
      // 但实际到访时间为空（数据异常）
      expect(data.actual_visit_time).toBeNull();
    });

    it('正常确认到访的记录不会出现数据异常', async () => {
      const { pass } = createApprovedPass({ visitor_name: '正常无异常访客', phone: '13100009002' });

      await request(testApp)
        .post(`/api/passes/${pass.id}/confirm`)
        .send({ actual_visit_time: '14:30' });

      const res = await request(testApp).get(`/api/passes/${pass.id}`);
      const data = res.body.data;

      // 正常流程：已到访 + 有实际到访时间
      expect(data.pass_status).toBe('visited');
      expect(data.actual_visit_time).toBe('14:30');
      expect(data.actual_visit_time).not.toBeNull();
    });

    it('数据异常检测：前端可通过 pass_status=visited 且 actual_visit_time=null 判断', () => {
      // 模拟前端数据异常检测逻辑
      const passData = { pass_status: 'visited', actual_visit_time: null };
      const isAnomaly = passData.pass_status === 'visited' && passData.actual_visit_time === null;
      expect(isAnomaly).toBe(true);

      // 正常数据不应触发
      const normalData = { pass_status: 'visited', actual_visit_time: '14:30' };
      const isNormalAnomaly = normalData.pass_status === 'visited' && normalData.actual_visit_time === null;
      expect(isNormalAnomaly).toBe(false);
    });
  });
});
