import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { initDatabase } from '../../../src/backend/config';
import { DepartmentModel } from '../../../src/backend/models/department';
import { ApplicationModel } from '../../../src/backend/models/application';
import { VisitorPassModel } from '../../../src/backend/models/visitor-pass';
import { ApprovalRecordModel } from '../../../src/backend/models/approval-record';
import recordRoutes from '../../../src/backend/routes/record';
import approvalRoutes from '../../../src/backend/routes/approval';
import passRoutes from '../../../src/backend/routes/pass';
import { errorHandler } from '../../../src/backend/middleware/response';

// ============================================================
// FK-44: 记录详情前端数据验证 (US025)
// 验证详情页渲染所需的数据结构、空值处理、错误处理
// ============================================================

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/records', recordRoutes);
  app.use('/api/approvals', approvalRoutes);
  app.use('/api/passes', passRoutes);
  app.use(errorHandler);
  return app;
}

/** 模拟前端详情页的空值占位符处理逻辑 */
function displayValue(value: string | null | undefined): string {
  return value || '-';
}

/** 模拟前端详情页的部门名称解析逻辑 */
function getDepartmentName(
  deptId: string,
  departments: { id: string; name: string }[],
): string {
  const dept = departments.find((d) => d.id === deptId);
  return dept?.name || deptId;
}

describe('FK-44: 记录详情页数据验证 (US025)', () => {
  let testApp: ReturnType<typeof createTestApp>;
  let deptId: string;
  let deptName: string;

  let appIdFull: string;    // 全字段填充的申请
  let appIdPartial: string; // 部分字段为空的申请

  beforeAll(async () => {
    await initDatabase();
    testApp = createTestApp();

    const depts = DepartmentModel.findAll();
    deptId = depts[0].id;
    deptName = depts[0].name;

    // ── 全字段填充的申请（approved + visited） ──
    const a1 = ApplicationModel.create({
      visitor_name: '详情全字段访客',
      phone: '13699998888',
      id_card: '320102199505051234',
      company: '测试科技有限公司',
      visitor_count: 2,
      is_driving: true,
      license_plate: '京B88888',
      contact_person: '对接人张',
      department_id: deptId,
      visit_start_time: '2025-04-01T09:00:00.000Z',
      visit_end_time: '2025-04-01T17:00:00.000Z',
      visit_purpose: '综合测试详情验证',
      attachment_url: 'https://example.com/test.pdf',
      session_id: 'fk44-detail-session',
    });
    await request(testApp)
      .post(`/api/approvals/${a1.id}/approve`)
      .send({ operator_session_id: 'fk44-detail-approver' });
    const pass1 = VisitorPassModel.findByApplicationId(a1.id)!;
    await request(testApp)
      .post(`/api/passes/${pass1.id}/confirm`)
      .send({ actual_visit_time: '09:15' });
    appIdFull = a1.id;

    // ── 部分字段为空的申请 ──
    const a2 = ApplicationModel.create({
      visitor_name: '部分空字段访客',
      phone: '13500001111',
      // id_card: null (空)
      // company: null (空)
      visitor_count: 1,
      is_driving: false,
      // license_plate: null (不开车)
      contact_person: '对接人李',
      department_id: deptId,
      visit_start_time: '2025-05-10T14:00:00.000Z',
      visit_end_time: '2025-05-10T16:00:00.000Z',
      visit_purpose: '部分字段空测试',
      // attachment_url: null (空)
      session_id: 'fk44-detail-partial',
    });
    await request(testApp)
      .post(`/api/approvals/${a2.id}/approve`)
      .send({ operator_session_id: 'fk44-detail-approver-2' });
    appIdPartial = a2.id;
  });

  // ================================================================
  // Test #23: 点击查看详情展示完整信息
  // ================================================================
  describe('US025 #23: 详情展示完整信息', () => {
    it('详情接口返回完整的application + approval_records + pass结构', async () => {
      const res = await request(testApp).get(`/api/records/${appIdFull}`);
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);

      const data = res.body.data;
      // 三大块数据结构完整
      expect(data).toHaveProperty('application');
      expect(data).toHaveProperty('approval_records');
      expect(data).toHaveProperty('pass');

      // application全字段
      const app = data.application;
      expect(app.visitor_name).toBe('详情全字段访客');
      expect(app.phone).toBe('13699998888');
      expect(app.id_card).toBe('320102199505051234');
      expect(app.visitor_count).toBe(2);
      expect(app.company).toBe('测试科技有限公司');
      expect(app.license_plate).toBe('京B88888');
      expect(app.contact_person).toBe('对接人张');
      expect(app.department_id).toBe(deptId);
      expect(app.visit_start_time).toBe('2025-04-01T09:00:00.000Z');
      expect(app.visit_end_time).toBe('2025-04-01T17:00:00.000Z');
      expect(app.visit_purpose).toBe('综合测试详情验证');
      expect(app.approval_status).toBe('approved');
      expect(app.pass_status).toBe('visited');
    });

    it('详情页展示全部字段含审批状态、通行状态、实际到访时间', async () => {
      const res = await request(testApp).get(`/api/records/${appIdFull}`);
      const { application, pass } = res.body.data;

      // 审批状态
      expect(application.approval_status).toBe('approved');
      // 通行状态
      expect(application.pass_status).toBe('visited');
      expect(pass.pass_status).toBe('visited');
      // 实际到访时间
      expect(pass.actual_visit_time).toBe('09:15');
    });

    it('部门ID可解析为部门名称', async () => {
      const res = await request(testApp).get(`/api/records/${appIdFull}`);
      const app = res.body.data.application;

      // 前端通过部门列表解析名称
      const depts = DepartmentModel.findAll();
      const name = getDepartmentName(app.department_id, depts);
      expect(name).toBe(deptName);
    });

    it('审批记录包含完整时间线', async () => {
      const res = await request(testApp).get(`/api/records/${appIdFull}`);
      const records = res.body.data.approval_records;
      expect(records.length).toBeGreaterThanOrEqual(1);

      const record = records[0];
      expect(record).toHaveProperty('id');
      expect(record).toHaveProperty('operation_type');
      expect(record).toHaveProperty('operated_at');
      expect(record.operation_type).toBe('approve');
    });
  });

  // ================================================================
  // Test #24: 详情页点击返回按钮回到列表
  // ================================================================
  describe('US025 #24: 详情页返回功能', () => {
    it('详情查看后再次查询列表数据一致', async () => {
      // 先查询列表
      const list1 = await request(testApp)
        .get('/api/records')
        .query({ name: '详情全字段' });
      expect(list1.body.data.items.length).toBeGreaterThanOrEqual(1);

      // 查看详情
      await request(testApp).get(`/api/records/${appIdFull}`);

      // 再次查询列表 — 数据不变
      const list2 = await request(testApp)
        .get('/api/records')
        .query({ name: '详情全字段' });
      expect(list2.body.data.total).toBe(list1.body.data.total);
    });

    it('详情接口不提供任何编辑/修改操作字段', async () => {
      const res = await request(testApp).get(`/api/records/${appIdFull}`);
      const data = res.body.data;
      // 不包含修改相关的 URL 或操作入口
      expect(data).not.toHaveProperty('edit_url');
      expect(data).not.toHaveProperty('update_url');
      expect(data).not.toHaveProperty('delete_url');
      expect(data).not.toHaveProperty('can_edit');
    });
  });

  // ================================================================
  // Test #25: 详情页只读模式验证
  // ================================================================
  describe('US025 #25: 详情页只读模式', () => {
    it('多次查看详情不改变任何状态字段', async () => {
      const before = ApplicationModel.findById(appIdFull);
      await request(testApp).get(`/api/records/${appIdFull}`);
      await request(testApp).get(`/api/records/${appIdFull}`);
      await request(testApp).get(`/api/records/${appIdFull}`);
      const after = ApplicationModel.findById(appIdFull);

      expect(before!.approval_status).toBe(after!.approval_status);
      expect(before!.pass_status).toBe(after!.pass_status);
      expect(before!.version).toBe(after!.version);
      expect(before!.updated_at).toBe(after!.updated_at);
    });

    it('审批记录不可被修改或删除（只写不改）', async () => {
      const res1 = await request(testApp).get(`/api/records/${appIdFull}`);
      const records1 = res1.body.data.approval_records;

      // ApprovalRecordModel 不提供 update/delete 方法
      expect((ApprovalRecordModel as { update?: unknown }).update).toBeUndefined();
      expect((ApprovalRecordModel as { delete?: unknown }).delete).toBeUndefined();

      // 再次查看，审批记录不变
      const res2 = await request(testApp).get(`/api/records/${appIdFull}`);
      const records2 = res2.body.data.approval_records;
      expect(records2.length).toBe(records1.length);
    });
  });

  // ================================================================
  // Test #26: 传入无效记录ID
  // ================================================================
  describe('US025 #26: 无效记录ID处理', () => {
    it('不存在的记录ID返回404 + code=40404', async () => {
      const res = await request(testApp).get('/api/records/INVALID_ID_99999');
      expect(res.status).toBe(404);
      expect(res.body.code).toBe(40404);
      expect(res.body.data).toBeNull();
    });

    it('错误提示信息包含"不存在"关键词', async () => {
      const res = await request(testApp).get('/api/records/INVALID_ID_99999');
      expect(res.body.msg).toContain('不存在');
    });

    it('前端可据此显示"记录信息不存在或已被移除"', async () => {
      const res = await request(testApp).get('/api/records/does-not-exist-either');
      expect(res.status).toBe(404);
      // 前端根据 code=40404 或 error 信息展示对应提示
      expect(res.body.code).toBe(40404);
    });
  });

  // ================================================================
  // Test #27: 部分字段缺失以占位符展示
  // ================================================================
  describe('US025 #27: 缺失字段占位符处理', () => {
    it('后端返回null字段供前端展示占位符', async () => {
      const res = await request(testApp).get(`/api/records/${appIdPartial}`);
      expect(res.status).toBe(200);
      const app = res.body.data.application;

      // 这些字段为空（null）
      expect(app.id_card).toBeNull();
      expect(app.company).toBeNull();
      expect(app.license_plate).toBeNull();
      expect(app.attachment_url).toBeNull();
    });

    it('前端空值占位符逻辑正确：null → "-"', () => {
      // 模拟前端 displayValue 逻辑
      expect(displayValue(null)).toBe('-');
      expect(displayValue(undefined)).toBe('-');
      expect(displayValue('')).toBe('-');
      expect(displayValue('有值内容')).toBe('有值内容');
    });

    it('详情页正常加载：部分字段为空的申请其他字段正常返回', async () => {
      const res = await request(testApp).get(`/api/records/${appIdPartial}`);
      const app = res.body.data.application;

      // 有值的字段正常
      expect(app.visitor_name).toBe('部分空字段访客');
      expect(app.phone).toBe('13500001111');
      expect(app.contact_person).toBe('对接人李');
      expect(app.visit_purpose).toBe('部分字段空测试');
      expect(app.approval_status).toBe('approved');

      // 前端用占位符展示空字段
      expect(displayValue(app.id_card)).toBe('-');
      expect(displayValue(app.company)).toBe('-');
      expect(displayValue(app.license_plate)).toBe('-');
      expect(displayValue(app.attachment_url)).toBe('-');
    });
  });

  // ================================================================
  // Test #28: 无权限访问记录详情
  // ================================================================
  describe('US025 #28: 无权限访问处理', () => {
    it('访问不存在的记录返回404（无登录系统统一处理）', async () => {
      const res = await request(testApp).get('/api/records/no-permission-test-id');
      expect(res.status).toBe(404);
      expect(res.body.code).toBe(40404);
    });

    it('错误消息不包含敏感信息', async () => {
      const res = await request(testApp).get('/api/records/nonexistent');
      // 不暴露 "无权限" 等敏感词，统一为 "不存在"
      expect(res.body.msg).not.toContain('权限');
      expect(res.body.msg).toContain('不存在');
    });
  });
});
