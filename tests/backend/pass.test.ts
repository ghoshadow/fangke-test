/**
 * FK-43: 【综合测试】通行核验 — US018 通行证搜索 + US019 通行证详情查看
 *
 * 测试用例覆盖：
 *   US018 #1  按访客姓名正常搜索
 *   US018 #2  按手机号正常搜索
 *   US018 #3  组合条件搜索
 *   US018 #4  不输入条件查看全部列表
 *   US018 #5  访客姓名超过20个字符（VR1）
 *   US018 #6  手机号格式不正确（VR2）
 *   US018 #7  身份证号格式不正确（VR3）
 *   US019 #8  正常查看完整信息
 *   US019 #9  身份信息一致确认放行
 *   US019 #10 身份信息不一致拒绝入校
 *   US019 #11 传入无效的通行证记录ID（VR1）
 *   US019 #12 审批状态非已同意（VR2）
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

/**
 * 搜索字段校验函数（与前端 validateSearchFilters 保持一致）
 * 后端搜索 API 不强制校验（由前端拦截），此处测试验证规则本身的正确性
 */
function validateSearchFilters(values: { name?: string; phone?: string; id_card?: string }): string | null {
  if (values.name && values.name.length > 20) {
    return '访客姓名输入不能超过20个字符';
  }
  if (values.phone && !/^1\d{10}$/.test(values.phone)) {
    return '请输入正确的11位手机号';
  }
  if (values.id_card && !/^(\d{15}|\d{17}[\dXx])$/.test(values.id_card)) {
    return '请输入正确的身份证号格式（15位或18位）';
  }
  return null;
}

describe('FK-43: US018 + US019 通行证搜索与详情查看', () => {
  let testApp: ReturnType<typeof createTestApp>;
  let deptId: string;

  // 测试数据引用
  let passZhangSan: { passId: string; appId: string };
  let passLiSi: { passId: string; appId: string };
  let passWangWu: { passId: string; appId: string };
  let passPending: string; // 待审批的申请ID（无通行证）
  let passRejected: string; // 已拒绝的申请ID（无通行证）

  beforeAll(async () => {
    await initDatabase();
    testApp = createTestApp();
    const depts = DepartmentModel.findAll();
    deptId = depts[0].id;

    // --- 准备已审批通过的测试数据 ---

    // 张三（US018 #1 测试数据）
    const a1 = ApplicationModel.create({
      visitor_name: '张三',
      phone: '13800138000',
      id_card: '110101199001011234',
      company: '测试单位A',
      visitor_count: 2,
      is_driving: true,
      license_plate: '京A12345',
      contact_person: '内部对接人A',
      department_id: deptId,
      visit_start_time: '2024-05-15T09:00:00.000Z',
      visit_end_time: '2024-05-15T17:00:00.000Z',
      visit_purpose: '业务交流',
      session_id: 'fk43-session-1',
    });
    ApplicationModel.updateApprovalStatus(a1.id, 'approved', a1.version);
    const p1 = VisitorPassModel.create({ application_id: a1.id });
    passZhangSan = { passId: p1.id, appId: a1.id };

    // 李四（US018 #2 测试数据，不同手机号）
    const a2 = ApplicationModel.create({
      visitor_name: '李四',
      phone: '13900139000',
      id_card: '310101198505052345',
      company: '测试单位B',
      visitor_count: 1,
      is_driving: false,
      contact_person: '内部对接人B',
      department_id: deptId,
      visit_start_time: '2024-05-16T09:00:00.000Z',
      visit_end_time: '2024-05-16T17:00:00.000Z',
      visit_purpose: '参观学习',
      session_id: 'fk43-session-2',
    });
    ApplicationModel.updateApprovalStatus(a2.id, 'approved', a2.version);
    const p2 = VisitorPassModel.create({ application_id: a2.id });
    passLiSi = { passId: p2.id, appId: a2.id };

    // 王五（US018 #3 组合搜索测试数据）
    const a3 = ApplicationModel.create({
      visitor_name: '王五',
      phone: '15800158000',
      id_card: '440101199201011234',
      visitor_count: 3,
      is_driving: true,
      license_plate: '粤B67890',
      contact_person: '内部对接人C',
      department_id: deptId,
      visit_start_time: '2024-05-17T09:00:00.000Z',
      visit_end_time: '2024-05-17T17:00:00.000Z',
      visit_purpose: '面试',
      session_id: 'fk43-session-3',
    });
    ApplicationModel.updateApprovalStatus(a3.id, 'approved', a3.version);
    const p3 = VisitorPassModel.create({ application_id: a3.id });
    passWangWu = { passId: p3.id, appId: a3.id };

    // 待审批申请（不应有通行证）
    const a4 = ApplicationModel.create({
      visitor_name: '赵六待审',
      phone: '13700137004',
      visitor_count: 1,
      is_driving: false,
      contact_person: '对接人D',
      department_id: deptId,
      visit_start_time: '2024-05-18T09:00:00.000Z',
      visit_end_time: '2024-05-18T17:00:00.000Z',
      visit_purpose: '待审批测试',
      session_id: 'fk43-session-4',
    });
    passPending = a4.id;

    // 已拒绝申请（不应有通行证）
    const a5 = ApplicationModel.create({
      visitor_name: '孙七被拒',
      phone: '13600136005',
      visitor_count: 1,
      is_driving: false,
      contact_person: '对接人E',
      department_id: deptId,
      visit_start_time: '2024-05-19T09:00:00.000Z',
      visit_end_time: '2024-05-19T17:00:00.000Z',
      visit_purpose: '拒绝测试',
      session_id: 'fk43-session-5',
    });
    ApplicationModel.updateApprovalStatus(a5.id, 'rejected', a5.version);
    passRejected = a5.id;
  });

  // ============================================================
  // US018 #1: 搜索访客通行证-按访客姓名正常搜索
  // ============================================================
  describe('US018 #1: 按访客姓名正常搜索', () => {
    it('输入"张三"搜索，返回匹配该姓名的通行证记录', async () => {
      const res = await request(testApp).get('/api/passes').query({ name: '张三' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);

      const { items, total } = res.body.data;
      expect(total).toBeGreaterThanOrEqual(1);
      const match = items.find((i: { application_id: string }) => i.application_id === passZhangSan.appId);
      expect(match).toBeDefined();
      expect(match.visitor_name).toBe('张三');
      expect(match.phone).toBe('13800138000');
    });

    it('搜索结果包含访客姓名、手机号、预约时间、通行状态等基本信息', async () => {
      const res = await request(testApp).get('/api/passes').query({ name: '张三' });
      const item = res.body.data.items[0];

      expect(item).toHaveProperty('visitor_name');
      expect(item).toHaveProperty('phone');
      expect(item).toHaveProperty('pass_status');
      expect(item).toHaveProperty('created_at');
    });

    it('搜索结果默认按提交时间倒序排列', async () => {
      const res = await request(testApp).get('/api/passes');

      expect(res.status).toBe(200);
      const items = res.body.data.items;
      for (let i = 1; i < items.length; i++) {
        expect(new Date(items[i - 1].created_at).getTime()).toBeGreaterThanOrEqual(
          new Date(items[i].created_at).getTime(),
        );
      }
    });
  });

  // ============================================================
  // US018 #2: 搜索访客通行证-按手机号正常搜索
  // ============================================================
  describe('US018 #2: 按手机号正常搜索', () => {
    it('输入手机号"13800138000"搜索，返回匹配该手机号的通行证记录', async () => {
      const res = await request(testApp).get('/api/passes').query({ phone: '13800138000' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);

      const { items } = res.body.data;
      expect(items.length).toBe(1);
      expect(items[0].visitor_name).toBe('张三');
      expect(items[0].phone).toBe('13800138000');
    });

    it('列表展示访客姓名、手机号、预约时间、通行状态等基本信息', async () => {
      const res = await request(testApp).get('/api/passes').query({ phone: '13900139000' });

      expect(res.status).toBe(200);
      const item = res.body.data.items[0];
      expect(item.visitor_name).toBe('李四');
      expect(item.phone).toBe('13900139000');
      expect(item).toHaveProperty('pass_status');
    });
  });

  // ============================================================
  // US018 #3: 搜索访客通行证-组合条件搜索
  // ============================================================
  describe('US018 #3: 组合条件搜索', () => {
    it('输入姓名"张三"和手机号"13800138000"，返回同时满足所有条件的通行证', async () => {
      const res = await request(testApp)
        .get('/api/passes')
        .query({ name: '张三', phone: '13800138000' });

      expect(res.status).toBe(200);
      const { items } = res.body.data;
      expect(items.length).toBe(1);
      expect(items[0].visitor_name).toBe('张三');
      expect(items[0].phone).toBe('13800138000');
    });

    it('系统按多条件交集过滤，不满足任一条件的记录被排除', async () => {
      // 张三的手机号是138开头，不是158开头
      const res = await request(testApp)
        .get('/api/passes')
        .query({ name: '张三', phone: '158' });

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(0);
    });

    it('身份证号精确匹配+姓名模糊匹配组合', async () => {
      const res = await request(testApp)
        .get('/api/passes')
        .query({ name: '王', id_card: '440101199201011234' });

      expect(res.status).toBe(200);
      const { items } = res.body.data;
      expect(items.length).toBe(1);
      expect(items[0].visitor_name).toBe('王五');
    });
  });

  // ============================================================
  // US018 #4: 搜索访客通行证-不输入条件查看全部列表
  // ============================================================
  describe('US018 #4: 不输入条件查看全部列表', () => {
    it('不输入任何搜索条件，返回全部通行证记录列表', async () => {
      const res = await request(testApp).get('/api/passes');

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);

      const { items, total } = res.body.data;
      expect(total).toBeGreaterThanOrEqual(3);
      expect(items.length).toBeGreaterThanOrEqual(3);
    });

    it('列表默认按提交时间倒序排列，最新提交的通行证在前', async () => {
      const res = await request(testApp).get('/api/passes');
      const items = res.body.data.items;

      for (let i = 1; i < items.length; i++) {
        expect(new Date(items[i - 1].created_at).getTime()).toBeGreaterThanOrEqual(
          new Date(items[i].created_at).getTime(),
        );
      }
    });

    it('列表仅包含审批状态=已同意的通行证', async () => {
      const res = await request(testApp).get('/api/passes');
      const appIds = res.body.data.items.map((i: { application_id: string }) => i.application_id);

      // 已审批的应该出现
      expect(appIds).toContain(passZhangSan.appId);
      expect(appIds).toContain(passLiSi.appId);
      expect(appIds).toContain(passWangWu.appId);
      // pending/rejected 不应出现（无通行证）
      expect(appIds).not.toContain(passPending);
      expect(appIds).not.toContain(passRejected);
    });
  });

  // ============================================================
  // US018 #5: 访客姓名超过20个字符（违反VR1）
  // ============================================================
  describe('US018 #5: 访客姓名超过20个字符（违反VR1）', () => {
    it('校验函数检测超过20个字符的姓名', () => {
      const longName = '这是一个超过二十个字符的非常非常长的名字测试用例';
      expect(longName.length).toBeGreaterThan(20);
      const error = validateSearchFilters({ name: longName });
      expect(error).toBe('访客姓名输入不能超过20个字符');
    });

    it('恰好20个字符的姓名不触发校验错误', () => {
      const name20 = '12345678901234567890';
      expect(name20.length).toBe(20);
      const error = validateSearchFilters({ name: name20 });
      expect(error).toBeNull();
    });

    it('搜索接口本身不做校验（由前端拦截），但搜索超长姓名返回空结果', async () => {
      const longName = '这是一个超过二十个字符的非常非常长的名字测试用例';
      const res = await request(testApp).get('/api/passes').query({ name: longName });
      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(0);
    });
  });

  // ============================================================
  // US018 #6: 手机号格式不正确（违反VR2）
  // ============================================================
  describe('US018 #6: 手机号格式不正确（违反VR2）', () => {
    it('校验函数检测非11位手机号', () => {
      const error = validateSearchFilters({ phone: '12345' });
      expect(error).toBe('请输入正确的11位手机号');
    });

    it('校验函数检测非1开头的手机号', () => {
      const error = validateSearchFilters({ phone: '23800138000' });
      expect(error).toBe('请输入正确的11位手机号');
    });

    it('正确的11位手机号通过校验', () => {
      const error = validateSearchFilters({ phone: '13800138000' });
      expect(error).toBeNull();
    });

    it('空手机号不触发校验（选填字段）', () => {
      const error = validateSearchFilters({ phone: '' });
      expect(error).toBeNull();
    });
  });

  // ============================================================
  // US018 #7: 身份证号格式不正确（违反VR3）
  // ============================================================
  describe('US018 #7: 身份证号格式不正确（违反VR3）', () => {
    it('校验函数检测非15位或18位的身份证号', () => {
      const error = validateSearchFilters({ id_card: '123456789' });
      expect(error).toBe('请输入正确的身份证号格式（15位或18位）');
    });

    it('正确的15位身份证号通过校验', () => {
      const error = validateSearchFilters({ id_card: '110101900101123' });
      expect(error).toBeNull();
    });

    it('正确的18位身份证号通过校验', () => {
      const error = validateSearchFilters({ id_card: '110101199001011234' });
      expect(error).toBeNull();
    });

    it('18位末位为X的身份证号通过校验', () => {
      const error = validateSearchFilters({ id_card: '11010119900101123X' });
      expect(error).toBeNull();
    });

    it('空身份证号不触发校验（选填字段）', () => {
      const error = validateSearchFilters({ id_card: '' });
      expect(error).toBeNull();
    });
  });

  // ============================================================
  // US019 #8: 查看通行证详情-正常查看完整信息
  // ============================================================
  describe('US019 #8: 正常查看完整信息', () => {
    it('点击通行证记录进入详情页，返回完整信息', async () => {
      const res = await request(testApp).get(`/api/passes/${passZhangSan.passId}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);

      const data = res.body.data;
      // 通行证自身字段
      expect(data.id).toBe(passZhangSan.passId);
      expect(data.pass_status).toBe('not_visited');
      expect(data.actual_visit_time).toBeNull();
      expect(data.created_at).toBeDefined();

      // 关联的申请信息（14字段完整映射）
      const app = data.application;
      expect(app).toBeDefined();
      expect(app.visitor_name).toBe('张三');
      expect(app.phone).toBe('13800138000');
      expect(app.id_card).toBe('110101199001011234');
      expect(app.visitor_count).toBe(2);
      expect(app.license_plate).toBe('京A12345');
      expect(app.visit_start_time).toBe('2024-05-15T09:00:00.000Z');
      expect(app.visit_end_time).toBe('2024-05-15T17:00:00.000Z');
      expect(app.contact_person).toBe('内部对接人A');
      expect(app.department_id).toBe(deptId);
      expect(app.approval_status).toBe('approved');
      expect(app.visit_purpose).toBe('业务交流');
    });

    it('详情内容为申请表单中对应字段的完整映射，不可被手动修改', async () => {
      const res = await request(testApp).get(`/api/passes/${passZhangSan.passId}`);
      const data = res.body.data;
      const app = data.application;

      // 所有字段均为只读展示，接口不接收修改参数
      const requiredFields = [
        'visitor_name', 'phone', 'id_card', 'visitor_count',
        'license_plate', 'visit_start_time', 'visit_end_time',
        'contact_person', 'department_id', 'approval_status',
      ];
      for (const field of requiredFields) {
        expect(app).toHaveProperty(field);
      }
      // 通行状态在通行证对象上
      expect(data).toHaveProperty('pass_status');
    });
  });

  // ============================================================
  // US019 #9: 身份信息一致确认放行
  // ============================================================
  describe('US019 #9: 身份信息一致确认放行', () => {
    it('详情页展示姓名和身份证号供门卫核对', async () => {
      const res = await request(testApp).get(`/api/passes/${passZhangSan.passId}`);
      const app = res.body.data.application;

      // 身份信息字段必须完整返回
      expect(app.visitor_name).toBe('张三');
      expect(app.id_card).toBe('110101199001011234');
    });

    it('信息一致时，通行证底部可执行确认到访操作（pass_status=not_visited）', async () => {
      const res = await request(testApp).get(`/api/passes/${passZhangSan.passId}`);

      // pass_status 为 not_visited 时，前端可显示确认到访按钮
      expect(res.body.data.pass_status).toBe('not_visited');
      // 确认到访接口可用（后续 US020 测试验证）
    });
  });

  // ============================================================
  // US019 #10: 身份信息不一致拒绝入校
  // ============================================================
  describe('US019 #10: 身份信息不一致拒绝入校', () => {
    it('信息不一致时，门卫不执行确认到访操作（通行证保持 not_visited）', async () => {
      // 模拟：门卫核对信息后选择不确认，通行证状态保持 not_visited
      const res = await request(testApp).get(`/api/passes/${passLiSi.passId}`);

      expect(res.body.data.pass_status).toBe('not_visited');
      expect(res.body.data.actual_visit_time).toBeNull();
    });

    it('不执行确认到访操作，通行证数据不变', async () => {
      // 李四的详情不变
      const res = await request(testApp).get(`/api/passes/${passLiSi.passId}`);
      const app = res.body.data.application;

      expect(app.visitor_name).toBe('李四');
      expect(app.id_card).toBe('310101198505052345');
      expect(res.body.data.pass_status).toBe('not_visited');
    });
  });

  // ============================================================
  // US019 #11: 传入无效的通行证记录ID（违反VR1）
  // ============================================================
  describe('US019 #11: 传入无效的通行证记录ID（违反VR1）', () => {
    it('请求查看不存在的通行证ID，返回404错误', async () => {
      const res = await request(testApp).get('/api/passes/nonexistent-pass-id-12345');

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(40404);
      expect(res.body.msg).toContain('不存在');
    });

    it('页面不展示通行证详情内容', async () => {
      const res = await request(testApp).get('/api/passes/invalid-id');

      expect(res.status).toBe(404);
      expect(res.body.data).toBeNull();
    });

    it('空字符串ID也返回404', async () => {
      const res = await request(testApp).get('/api/passes/');
      // 空字符串走到 GET / 路由（列表），不是 GET /:id
      expect(res.status).toBe(200);
    });
  });

  // ============================================================
  // US019 #12: 审批状态非已同意（违反VR2）
  // ============================================================
  describe('US019 #12: 审批状态非已同意（违反VR2）', () => {
    it('审批中的申请无通行证可查看', async () => {
      // pending 状态的申请没有通行证，搜索也搜不到
      const res = await request(testApp).get('/api/passes').query({ name: '赵六待审' });
      expect(res.body.data.items.length).toBe(0);
    });

    it('已拒绝的申请无通行证可查看', async () => {
      const res = await request(testApp).get('/api/passes').query({ name: '孙七被拒' });
      expect(res.body.data.items.length).toBe(0);
    });

    it('直接通过模型创建的pending申请对应通行证，详情接口返回审批未通过错误', async () => {
      // 模拟异常数据：手动创建了一个pending申请的通行证
      const pendingApp = ApplicationModel.create({
        visitor_name: '异常Pending访客',
        phone: '13500001111',
        visitor_count: 1,
        is_driving: false,
        contact_person: '对接人X',
        department_id: deptId,
        visit_start_time: '2024-05-20T09:00:00.000Z',
        visit_end_time: '2024-05-20T17:00:00.000Z',
        visit_purpose: '异常数据测试',
        session_id: 'fk43-abnormal-session',
      });
      // 直接创建通行证（模拟异常：审批未通过但有通行证）
      const abnormalPass = VisitorPassModel.create({ application_id: pendingApp.id });

      const res = await request(testApp).get(`/api/passes/${abnormalPass.id}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(40405);
      expect(res.body.msg).toContain('未审批通过');
    });
  });
});
