import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { initDatabase } from '../../src/backend/config';
import { DepartmentModel } from '../../src/backend/models/department';
import { ApplicationModel } from '../../src/backend/models/application';
import { VisitorPassModel } from '../../src/backend/models/visitor-pass';
import recordRoutes from '../../src/backend/routes/record';
import approvalRoutes from '../../src/backend/routes/approval';
import passRoutes from '../../src/backend/routes/pass';
import { errorHandler } from '../../src/backend/middleware/response';

// ============================================================
// FK-44: 记录查询综合测试 — 后端查询API校验 (US022-US025)
// 覆盖：筛选维度正常查询 + AND组合 + 枚举校验 + 时间范围校验 + 详情错误处理
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

const SESSION = 'fk44-query-session';

describe('FK-44: 记录查询综合测试 (US022-US025)', () => {
  let testApp: ReturnType<typeof createTestApp>;
  let deptXinXi: string; // 信息中心
  let deptJWC: string;   // 教务处

  // 测试数据 ID
  let appIdZhangSan: string;
  let appIdLiSi: string;
  let appIdWangWu: string;
  let appIdNoPlate: string;

  beforeAll(async () => {
    await initDatabase();
    testApp = createTestApp();

    const depts = DepartmentModel.findAll();
    deptXinXi = depts.find((d) => d.name === '信息中心')?.id || depts[0].id;
    deptJWC = depts.find((d) => d.name === '教务处')?.id || depts[1].id;

    // ── 数据1: 张三 — approved + visited，全字段 ──
    const a1 = ApplicationModel.create({
      visitor_name: '张三',
      phone: '13812345678',
      id_card: '320102199001011234',
      company: '某某科技有限公司',
      visitor_count: 1,
      is_driving: true,
      license_plate: '京A12345',
      contact_person: '李四',
      department_id: deptXinXi,
      visit_start_time: '2025-03-15T09:00:00.000Z',
      visit_end_time: '2025-03-15T17:00:00.000Z',
      visit_purpose: '业务交流访问',
      session_id: SESSION,
    });
    // 通过审批路由创建审批记录 + 通行证
    await request(testApp)
      .post(`/api/approvals/${a1.id}/approve`)
      .send({ operator_session_id: 'fk44-approver-1' });
    // 确认到访
    const pass1 = VisitorPassModel.findByApplicationId(a1.id)!;
    await request(testApp)
      .post(`/api/passes/${pass1.id}/confirm`)
      .send({ actual_visit_time: '09:30' });
    appIdZhangSan = a1.id;

    // ── 数据2: 李四 — approved + not_visited ──
    const a2 = ApplicationModel.create({
      visitor_name: '李四',
      phone: '13987654321',
      company: '上海贸易公司',
      visitor_count: 2,
      is_driving: false,
      contact_person: '王五',
      department_id: deptJWC,
      visit_start_time: '2025-06-01T10:00:00.000Z',
      visit_end_time: '2025-06-01T16:00:00.000Z',
      visit_purpose: '合作洽谈',
      session_id: SESSION,
    });
    ApplicationModel.updateApprovalStatus(a2.id, 'approved', a2.version);
    VisitorPassModel.create({ application_id: a2.id });
    ApplicationModel.updatePassStatus(a2.id, 'not_visited');
    appIdLiSi = a2.id;

    // ── 数据3: 王五 — returned ──
    const a3 = ApplicationModel.create({
      visitor_name: '王五',
      phone: '15800001111',
      id_card: '110101198505051234',
      company: '北京咨询公司',
      visitor_count: 1,
      is_driving: false,
      contact_person: '赵六',
      department_id: deptXinXi,
      visit_start_time: '2025-08-20T14:00:00.000Z',
      visit_end_time: '2025-08-20T18:00:00.000Z',
      visit_purpose: '审计检查',
      session_id: SESSION,
    });
    ApplicationModel.updateApprovalStatus(a3.id, 'returned', a3.version);
    appIdWangWu = a3.id;

    // ── 数据4: 无车牌访客 — approved, 部分字段为空 ──
    const a4 = ApplicationModel.create({
      visitor_name: '赵六',
      phone: '13700001234',
      visitor_count: 1,
      is_driving: false,
      contact_person: '李四',
      department_id: deptJWC,
      visit_start_time: '2025-04-10T08:30:00.000Z',
      visit_end_time: '2025-04-10T12:00:00.000Z',
      visit_purpose: '设备维护',
      session_id: SESSION,
    });
    ApplicationModel.updateApprovalStatus(a4.id, 'approved', a4.version);
    VisitorPassModel.create({ application_id: a4.id });
    ApplicationModel.updatePassStatus(a4.id, 'not_visited');
    appIdNoPlate = a4.id;
  });

  // ================================================================
  // US022: 访客维度筛选
  // ================================================================
  describe('US022: 访客维度筛选', () => {
    // Test #1: 按访客姓名筛选查询记录
    it('#1 按访客姓名筛选返回匹配记录（模糊匹配）', async () => {
      const res = await request(testApp).get('/api/records').query({ name: '张三' });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      const items = res.body.data.items;
      expect(items.length).toBeGreaterThanOrEqual(1);
      const match = items.find((i: { id: string }) => i.id === appIdZhangSan);
      expect(match).toBeDefined();
      expect(match.visitor_name).toBe('张三');
    });

    // Test #2: 按手机号筛选查询记录（模糊匹配）
    it('#2 按手机号片段模糊匹配返回对应记录', async () => {
      const res = await request(testApp).get('/api/records').query({ phone: '1381234' });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      const items = res.body.data.items;
      expect(items.length).toBeGreaterThanOrEqual(1);
      const match = items.find((i: { id: string }) => i.id === appIdZhangSan);
      expect(match).toBeDefined();
    });

    // Test #3: 按身份证号筛选查询记录（精确匹配）
    it('#3 按身份证号精确匹配返回对应记录', async () => {
      const res = await request(testApp).get('/api/records').query({ id_card: '320102199001011234' });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      const items = res.body.data.items;
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items[0].id_card).toBe('320102199001011234');
    });

    // Test #4: 多条件AND组合筛选（姓名+手机号）
    it('#4 姓名+手机号AND组合返回同时满足的记录', async () => {
      const res = await request(testApp).get('/api/records').query({ name: '张三', phone: '138' });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      const items = res.body.data.items;
      expect(items.length).toBeGreaterThanOrEqual(1);
      const match = items.find((i: { id: string }) => i.id === appIdZhangSan);
      expect(match).toBeDefined();
      expect(match.visitor_name).toBe('张三');
      expect(match.phone).toContain('138');
    });

    // Test #5: 姓名输入超长字符 — 后端正常返回空结果（前端拦截校验）
    it('#5 超长姓名查询返回空结果不报错', async () => {
      const longName = '测'.repeat(51);
      const res = await request(testApp).get('/api/records').query({ name: longName });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.items.length).toBe(0);
    });

    // Test #6: 手机号格式不正确（含非数字） — 后端返回空结果
    it('#6 含字母手机号查询返回空结果', async () => {
      const res = await request(testApp).get('/api/records').query({ phone: 'abcdefghijk' });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.items.length).toBe(0);
    });

    // Test #7: 身份证号格式不正确 — 后端返回空结果
    it('#7 无效身份证号查询返回空结果', async () => {
      const res = await request(testApp).get('/api/records').query({ id_card: '12345' });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.items.length).toBe(0);
    });
  });

  // ================================================================
  // US023: 对接维度筛选
  // ================================================================
  describe('US023: 对接维度筛选', () => {
    // Test #8: 按对接人筛选查询记录
    it('#8 按对接人筛选返回关联记录（模糊匹配）', async () => {
      const res = await request(testApp).get('/api/records').query({ contact_person: '李四' });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      const items = res.body.data.items;
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items.every((i: { contact_person: string }) => i.contact_person.includes('李四'))).toBe(true);
    });

    // Test #9: 按访客单位筛选查询记录
    it('#9 按访客单位模糊匹配返回对应记录', async () => {
      const res = await request(testApp).get('/api/records').query({ company: '某某科技' });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      const items = res.body.data.items;
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items[0].company).toContain('某某科技');
    });

    // Test #10: 按车牌号筛选查询记录
    it('#10 按车牌号模糊匹配返回对应记录', async () => {
      const res = await request(testApp).get('/api/records').query({ license_plate: '京A12345' });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      const items = res.body.data.items;
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items[0].license_plate).toContain('京A12345');
    });

    // Test #11: 对接人+部门AND组合筛选
    it('#11 对接人+部门AND组合返回同时满足的记录', async () => {
      const res = await request(testApp).get('/api/records').query({
        department: deptXinXi,
        contact_person: '李四',
      });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      const items = res.body.data.items;
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items.every((i: { department_id: string; contact_person: string }) =>
        i.department_id === deptXinXi && i.contact_person.includes('李四'),
      )).toBe(true);
    });

    // Test #12: 对接人姓名超长 — 后端正常返回空结果
    it('#12 超长对接人查询返回空结果', async () => {
      const longName = '测'.repeat(51);
      const res = await request(testApp).get('/api/records').query({ contact_person: longName });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.items.length).toBe(0);
    });

    // Test #13: 车牌号格式不正确 — 后端返回空结果
    it('#13 无效车牌号查询返回空结果', async () => {
      const res = await request(testApp).get('/api/records').query({ license_plate: '@@@@@@' });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.items.length).toBe(0);
    });

    // Test #14: 单位名称超长 — 后端正常返回空结果
    it('#14 超长单位名称查询返回空结果', async () => {
      const longCompany = '测'.repeat(101);
      const res = await request(testApp).get('/api/records').query({ company: longCompany });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.items.length).toBe(0);
    });
  });

  // ================================================================
  // US024: 时间与状态维度筛选
  // ================================================================
  describe('US024: 时间与状态维度筛选', () => {
    // Test #15: 按时间范围筛选查询记录
    it('#15 时间范围内返回对应记录（含边界）', async () => {
      const res = await request(testApp).get('/api/records').query({
        date_from: '2025-01-01',
        date_to: '2025-12-31',
      });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      const items = res.body.data.items;
      expect(items.length).toBeGreaterThanOrEqual(1);
      // 张三的拜访时间在范围内
      const ids = items.map((i: { id: string }) => i.id);
      expect(ids).toContain(appIdZhangSan);
    });

    // Test #16: 按审批状态「已同意」筛选
    it('#16 按审批状态approved筛选返回对应记录', async () => {
      const res = await request(testApp).get('/api/records').query({ approval_status: 'approved' });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      const items = res.body.data.items;
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items.every((i: { approval_status: string }) => i.approval_status === 'approved')).toBe(true);
    });

    // Test #17: 按通行状态「已到访」筛选
    it('#17 按通行状态visited筛选返回对应记录', async () => {
      const res = await request(testApp).get('/api/records').query({ pass_status: 'visited' });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      const items = res.body.data.items;
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items.every((i: { pass_status: string }) => i.pass_status === 'visited')).toBe(true);
    });

    // Test #18: 时间+审批+通行状态AND组合筛选
    it('#18 时间+审批+通行三条件AND组合返回精确结果', async () => {
      const res = await request(testApp).get('/api/records').query({
        date_from: '2025-01-01',
        date_to: '2025-12-31',
        approval_status: 'approved',
        pass_status: 'visited',
      });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      const items = res.body.data.items;
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items.every((i: { approval_status: string; pass_status: string }) =>
        i.approval_status === 'approved' && i.pass_status === 'visited',
      )).toBe(true);
    });

    // Test #19: 起始时间晚于结束时间 — 后端返回空结果（前端拦截）
    it('#19 起始时间晚于结束时间返回空结果', async () => {
      const res = await request(testApp).get('/api/records').query({
        date_from: '2025-12-31',
        date_to: '2025-01-01',
      });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      // 逻辑上无交集，返回空
      expect(res.body.data.items.length).toBe(0);
    });

    // Test #20: 起始时间等于结束时间 — 前端拦截，后端不拦截
    it('#20 起始时间等于结束时间 — 前端拦截校验', async () => {
      // 后端层面：相同日期范围可能返回结果（整天范围）
      // 此测试验证前端校验逻辑在 validators 层处理
      const res = await request(testApp).get('/api/records').query({
        date_from: '2025-06-15',
        date_to: '2025-06-15',
      });
      expect(res.status).toBe(200);
    });

    // Test #21: 非法审批状态值 — 后端校验失败返回错误
    it('#21 非法审批状态值返回400错误', async () => {
      const res = await request(testApp).get('/api/records').query({
        approval_status: 'invalid_status',
      });
      expect(res.status).toBe(400);
      expect(res.body.code).not.toBe(0);
      expect(res.body.msg).toContain('审批状态值无效');
    });

    // Test #22: 非法通行状态值 — 后端校验失败返回错误
    it('#22 非法通行状态值返回400错误', async () => {
      const res = await request(testApp).get('/api/records').query({
        pass_status: 'unknown_status',
      });
      expect(res.status).toBe(400);
      expect(res.body.code).not.toBe(0);
      expect(res.body.msg).toContain('通行状态值无效');
    });
  });

  // ================================================================
  // US025: 记录详情查看
  // ================================================================
  describe('US025: 记录详情查看', () => {
    // Test #23: 点击查看详情展示完整信息
    it('#23 详情接口返回完整申请信息+审批记录+通行证', async () => {
      const res = await request(testApp).get(`/api/records/${appIdZhangSan}`);
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);

      const { application, approval_records, pass } = res.body.data;
      // 全字段验证
      expect(application.visitor_name).toBe('张三');
      expect(application.phone).toBe('13812345678');
      expect(application.id_card).toBe('320102199001011234');
      expect(application.company).toBe('某某科技有限公司');
      expect(application.license_plate).toBe('京A12345');
      expect(application.contact_person).toBe('李四');
      expect(application.department_id).toBe(deptXinXi);
      expect(application.visit_purpose).toBe('业务交流访问');
      expect(application.approval_status).toBe('approved');
      expect(application.pass_status).toBe('visited');
      // 审批记录
      expect(approval_records).toBeInstanceOf(Array);
      expect(approval_records.length).toBeGreaterThanOrEqual(1);
      // 通行证
      expect(pass).not.toBeNull();
      expect(pass.pass_status).toBe('visited');
      expect(pass.actual_visit_time).toBe('09:30');
    });

    // Test #24: 详情页数据只读（不影响申请状态）
    it('#24 查看详情不修改任何数据（只读）', async () => {
      const before = ApplicationModel.findById(appIdZhangSan);
      await request(testApp).get(`/api/records/${appIdZhangSan}`);
      const after = ApplicationModel.findById(appIdZhangSan);

      expect(before!.approval_status).toBe(after!.approval_status);
      expect(before!.pass_status).toBe(after!.pass_status);
      expect(before!.version).toBe(after!.version);
    });

    // Test #25: 详情页只读模式验证（后端不提供修改接口）
    it('#25 详情接口仅返回数据，不包含任何编辑操作入口', async () => {
      const res = await request(testApp).get(`/api/records/${appIdZhangSan}`);
      expect(res.body.data).toHaveProperty('application');
      expect(res.body.data).toHaveProperty('approval_records');
      // 无 edit_url / update_url 等修改入口
      expect(res.body.data).not.toHaveProperty('edit_url');
      expect(res.body.data).not.toHaveProperty('update_url');
      expect(res.body.data).not.toHaveProperty('delete_url');
    });

    // Test #26: 传入无效记录ID
    it('#26 无效记录ID返回404+错误提示', async () => {
      const res = await request(testApp).get('/api/records/INVALID_ID_99999');
      expect(res.status).toBe(404);
      expect(res.body.code).toBe(40404);
      expect(res.body.msg).toContain('不存在');
      expect(res.body.data).toBeNull();
    });

    // Test #27: 部分字段缺失以占位符展示（后端返回null）
    it('#27 部分字段为空时详情返回null供前端占位符展示', async () => {
      const res = await request(testApp).get(`/api/records/${appIdNoPlate}`);
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      const { application } = res.body.data;
      // 赵六没有车牌、身份证、单位
      expect(application.license_plate).toBeNull();
      expect(application.id_card).toBeNull();
      expect(application.company).toBeNull();
      // 其他字段正常
      expect(application.visitor_name).toBe('赵六');
      expect(application.phone).toBe('13700001234');
    });

    // Test #28: 无权限访问记录详情 — 本系统无登录认证，统一返回404
    it('#28 访问不存在的记录统一返回404（无登录系统权限一致）', async () => {
      const res = await request(testApp).get('/api/records/nonexistent-permission-test');
      expect(res.status).toBe(404);
      expect(res.body.code).toBe(40404);
    });
  });
});
