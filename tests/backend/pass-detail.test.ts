import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { initDatabase } from '../../src/backend/config';
import { DepartmentModel } from '../../src/backend/models/department';
import { ApplicationModel } from '../../src/backend/models/application';
import { VisitorPassModel } from '../../src/backend/models/visitor-pass';
import passRoutes from '../../src/backend/routes/pass';
import { errorHandler } from '../../src/backend/middleware/response';

// ============================================================
// 【测试】通行证详情查看与身份核验 — FK-35
// 测试 GET /api/passes/:id 详情接口 + 身份核验字段一致性
// ============================================================

// 构建最小 express 应用（避免导入 app.ts 的 main() 副作用）
function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/passes', passRoutes);
  app.use(errorHandler);
  return app;
}

describe('通行证详情查看与身份核验', () => {
  let testApp: ReturnType<typeof createTestApp>;
  let deptId: string;

  beforeAll(async () => {
    await initDatabase();
    testApp = createTestApp();
    const depts = DepartmentModel.findAll();
    deptId = depts[0].id;
  });

  // ============================================================
  // 辅助：创建一个申请 + 审批通过 → 生成通行证
  // ============================================================
  async function createApprovedPass(overrides: Partial<{
    visitor_name: string;
    phone: string;
    id_card: string;
    company: string;
    visitor_count: number;
    is_driving: boolean;
    license_plate: string;
    contact_person: string;
    visit_purpose: string;
  }> = {}) {
    const app = ApplicationModel.create({
      visitor_name: overrides.visitor_name ?? '核验访客',
      phone: overrides.phone ?? '13800001111',
      id_card: overrides.id_card ?? '110101199001011234',
      company: overrides.company ?? '测试单位',
      visitor_count: overrides.visitor_count ?? 2,
      is_driving: overrides.is_driving ?? true,
      license_plate: overrides.license_plate ?? '京A88888',
      contact_person: overrides.contact_person ?? '内部对接人',
      department_id: deptId,
      visit_start_time: '2024-06-01T09:00:00.000Z',
      visit_end_time: '2024-06-01T17:00:00.000Z',
      visit_purpose: overrides.visit_purpose ?? '身份核验测试',
      session_id: 'pass-detail-test-session',
    });

    ApplicationModel.updateApprovalStatus(app.id, 'approved', app.version);
    const pass = VisitorPassModel.create({ application_id: app.id });

    return { application: app, pass };
  }

  // ============================================================
  // 场景 1：点击通行证进入详情 → 展示完整访客信息
  // ============================================================
  describe('场景1: 通行证详情展示全字段信息', () => {
    it('GET /api/passes/:id 返回通行证 + 关联申请的完整字段', async () => {
      const { application, pass } = await createApprovedPass({
        visitor_name: '全字段访客',
        phone: '13912345678',
        id_card: '310101198512151234',
        company: '上海测试公司',
        visitor_count: 3,
        is_driving: true,
        license_plate: '沪B12345',
        contact_person: '王主任',
        visit_purpose: '校园参观交流',
      });

      const res = await request(testApp).get(`/api/passes/${pass.id}`);

      // HTTP 状态
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);

      const data = res.body.data;

      // 通行证自身字段
      expect(data.id).toBe(pass.id);
      expect(data.application_id).toBe(application.id);
      expect(data.pass_status).toBe('not_visited');
      expect(data.actual_visit_time).toBeNull();
      expect(data.created_at).toBeDefined();

      // 关联的申请信息 — 14 字段全覆盖
      expect(data.application).toBeDefined();
      const appData = data.application;
      expect(appData.id).toBe(application.id);
      expect(appData.visitor_name).toBe('全字段访客');
      expect(appData.phone).toBe('13912345678');
      expect(appData.id_card).toBe('310101198512151234');
      expect(appData.company).toBe('上海测试公司');
      expect(appData.visitor_count).toBe(3);
      expect(appData.is_driving).toBe(true);
      expect(appData.license_plate).toBe('沪B12345');
      expect(appData.contact_person).toBe('王主任');
      expect(appData.department_id).toBe(deptId);
      expect(appData.visit_start_time).toBe('2024-06-01T09:00:00.000Z');
      expect(appData.visit_end_time).toBe('2024-06-01T17:00:00.000Z');
      expect(appData.visit_purpose).toBe('校园参观交流');
      expect(appData.approval_status).toBe('approved');
    });

    it('详情接口返回的字段覆盖门卫核验所需的全部信息', async () => {
      const { pass } = await createApprovedPass({
        visitor_name: '核验完整性',
        phone: '13700001111',
        id_card: '440101199201011234',
        visitor_count: 1,
      });

      const res = await request(testApp).get(`/api/passes/${pass.id}`);
      const appData = res.body.data.application;

      // 门卫核验身份所需的核心字段必须存在
      const requiredFields = [
        'visitor_name',  // 姓名
        'phone',         // 手机号
        'id_card',       // 身份证号
        'visitor_count', // 人数
        'license_plate', // 车牌号
        'visit_start_time', // 预约开始时间
        'visit_end_time',   // 预约结束时间
        'contact_person',   // 对接人
        'department_id',    // 部门
        'approval_status',  // 审批状态
      ];

      for (const field of requiredFields) {
        expect(appData).toHaveProperty(field);
      }

      // 通行状态在通行证对象上
      expect(res.body.data).toHaveProperty('pass_status');
    });
  });

  // ============================================================
  // 场景 2：通行状态=未到访时 → 详情返回 not_visited
  // ============================================================
  describe('场景2: 通行状态=未到访', () => {
    it('新创建的通行证 pass_status 为 not_visited', async () => {
      const { pass } = await createApprovedPass({ visitor_name: '未到访测试' });

      const res = await request(testApp).get(`/api/passes/${pass.id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.pass_status).toBe('not_visited');
      expect(res.body.data.actual_visit_time).toBeNull();
    });

    it('未到访状态下 actual_visit_time 为 null', async () => {
      const { pass } = await createApprovedPass({ visitor_name: '未到访时间测试' });

      const res = await request(testApp).get(`/api/passes/${pass.id}`);
      const data = res.body.data;

      // 未到访时，actual_visit_time 应为 null，前端不显示实际到访时间
      expect(data.actual_visit_time).toBeNull();
    });
  });

  // ============================================================
  // 场景 3：通行状态=已到访时 → 详情返回 visited
  // ============================================================
  describe('场景3: 通行状态=已到访', () => {
    it('确认到访后 pass_status 变为 visited', async () => {
      const { pass } = await createApprovedPass({ visitor_name: '已到访测试' });

      // 先确认到访
      await request(testApp)
        .post(`/api/passes/${pass.id}/confirm`)
        .send({ actual_visit_time: '10:30' });

      // 再查看详情
      const res = await request(testApp).get(`/api/passes/${pass.id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.pass_status).toBe('visited');
    });

    it('已到访状态下确认到访不可重复执行', async () => {
      const { pass } = await createApprovedPass({ visitor_name: '重复确认测试' });

      // 第一次确认
      const first = await request(testApp)
        .post(`/api/passes/${pass.id}/confirm`)
        .send({ actual_visit_time: '09:00' });
      expect(first.status).toBe(200);

      // 第二次确认应失败
      const second = await request(testApp)
        .post(`/api/passes/${pass.id}/confirm`)
        .send({ actual_visit_time: '10:00' });
      expect(second.status).toBe(400);
      expect(second.body.code).toBe(40020);
    });
  });

  // ============================================================
  // 场景 4：详情页展示实际到访时间
  // ============================================================
  describe('场景4: 已到访记录显示实际到访时间', () => {
    it('确认到访后详情返回 actual_visit_time', async () => {
      const { pass } = await createApprovedPass({ visitor_name: '到访时间测试' });

      // 确认到访，填写实际到访时间 14:30
      await request(testApp)
        .post(`/api/passes/${pass.id}/confirm`)
        .send({ actual_visit_time: '14:30' });

      // 查看详情
      const res = await request(testApp).get(`/api/passes/${pass.id}`);
      const data = res.body.data;

      expect(data.pass_status).toBe('visited');
      expect(data.actual_visit_time).toBe('14:30');
    });

    it('actual_visit_time 与门卫填写的时间一致', async () => {
      const { pass } = await createApprovedPass({ visitor_name: '时间一致性测试' });

      const confirmTime = '16:45';
      await request(testApp)
        .post(`/api/passes/${pass.id}/confirm`)
        .send({ actual_visit_time: confirmTime });

      const res = await request(testApp).get(`/api/passes/${pass.id}`);
      expect(res.body.data.actual_visit_time).toBe(confirmTime);
    });
  });

  // ============================================================
  // 场景 5：信息与证件人工核对 — 详情字段与申请时提交的一致
  // ============================================================
  describe('场景5: 详情字段与原始申请信息一致（证件核对）', () => {
    it('姓名、手机号、身份证号与提交时完全一致', async () => {
      const { application, pass } = await createApprovedPass({
        visitor_name: '证件核对访客',
        phone: '13611112222',
        id_card: '330102199305051234',
      });

      const res = await request(testApp).get(`/api/passes/${pass.id}`);
      const appData = res.body.data.application;

      expect(appData.visitor_name).toBe(application.visitor_name);
      expect(appData.phone).toBe(application.phone);
      expect(appData.id_card).toBe(application.id_card);
    });

    it('人数、车牌号、时间段与提交时完全一致', async () => {
      const { application, pass } = await createApprovedPass({
        visitor_name: '车辆信息核对',
        visitor_count: 4,
        is_driving: true,
        license_plate: '粤A99999',
      });

      const res = await request(testApp).get(`/api/passes/${pass.id}`);
      const appData = res.body.data.application;

      expect(appData.visitor_count).toBe(application.visitor_count);
      expect(appData.license_plate).toBe(application.license_plate);
      expect(appData.visit_start_time).toBe(application.visit_start_time);
      expect(appData.visit_end_time).toBe(application.visit_end_time);
    });

    it('对接人、部门与提交时完全一致', async () => {
      const { application, pass } = await createApprovedPass({
        visitor_name: '对接人核对',
        contact_person: '张老师',
      });

      const res = await request(testApp).get(`/api/passes/${pass.id}`);
      const appData = res.body.data.application;

      expect(appData.contact_person).toBe(application.contact_person);
      expect(appData.department_id).toBe(application.department_id);
    });

    it('可选字段为空时详情正确展示 null', async () => {
      // 直接通过 Model 创建不含可选字段的申请，避免 helper 默认值干扰
      const app = ApplicationModel.create({
        visitor_name: '无证件访客',
        phone: '13800009999',
        visitor_count: 1,
        is_driving: false,
        contact_person: '对接人',
        department_id: deptId,
        visit_start_time: '2024-06-01T09:00:00.000Z',
        visit_end_time: '2024-06-01T17:00:00.000Z',
        visit_purpose: '无证件测试',
        session_id: 'pass-detail-null-test',
      });
      ApplicationModel.updateApprovalStatus(app.id, 'approved', app.version);
      const pass = VisitorPassModel.create({ application_id: app.id });

      const res = await request(testApp).get(`/api/passes/${pass.id}`);
      const appData = res.body.data.application;

      expect(appData.id_card).toBeNull();
      expect(appData.company).toBeNull();
      expect(appData.license_plate).toBeNull();
    });
  });

  // ============================================================
  // 场景 6：网络异常 / 错误处理
  // ============================================================
  describe('场景6: 异常场景与错误处理', () => {
    it('不存在的通行证 ID 返回 404', async () => {
      const res = await request(testApp).get('/api/passes/nonexistent-pass-id');

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(40404);
      expect(res.body.msg).toContain('不存在');
    });

    it('确认到访时缺少 actual_visit_time 返回 400', async () => {
      const { pass } = await createApprovedPass({ visitor_name: '缺少时间测试' });

      const res = await request(testApp)
        .post(`/api/passes/${pass.id}/confirm`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40021);
    });

    it('确认到访时时间格式错误返回 400', async () => {
      const { pass } = await createApprovedPass({ visitor_name: '格式错误测试' });

      const res = await request(testApp)
        .post(`/api/passes/${pass.id}/confirm`)
        .send({ actual_visit_time: '下午两点' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40021);
    });

    it('确认到访时不存在的通行证返回 404', async () => {
      const res = await request(testApp)
        .post('/api/passes/nonexistent-id/confirm')
        .send({ actual_visit_time: '10:00' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(40404);
    });
  });

  // ============================================================
  // 确认到访接口完整性测试
  // ============================================================
  describe('确认到访操作', () => {
    it('合法 HH:mm 格式时间确认到访成功', async () => {
      const { pass } = await createApprovedPass({ visitor_name: '合法时间确认' });

      const res = await request(testApp)
        .post(`/api/passes/${pass.id}/confirm`)
        .send({ actual_visit_time: '08:30' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.pass_status).toBe('visited');
      expect(res.body.data.actual_visit_time).toBe('08:30');
    });

    it('确认到访后申请的 pass_status 同步更新', async () => {
      const { application, pass } = await createApprovedPass({ visitor_name: '状态同步测试' });

      await request(testApp)
        .post(`/api/passes/${pass.id}/confirm`)
        .send({ actual_visit_time: '11:00' });

      // 申请表的 pass_status 应同步为 visited
      const updatedApp = ApplicationModel.findById(application.id);
      expect(updatedApp!.pass_status).toBe('visited');
    });

    it('边界时间 00:00 和 23:59 均可确认', async () => {
      const { pass: pass1 } = await createApprovedPass({ visitor_name: '边界时间-早' });
      const { pass: pass2 } = await createApprovedPass({ visitor_name: '边界时间-晚' });

      const res1 = await request(testApp)
        .post(`/api/passes/${pass1.id}/confirm`)
        .send({ actual_visit_time: '00:00' });
      expect(res1.status).toBe(200);
      expect(res1.body.data.actual_visit_time).toBe('00:00');

      const res2 = await request(testApp)
        .post(`/api/passes/${pass2.id}/confirm`)
        .send({ actual_visit_time: '23:59' });
      expect(res2.status).toBe(200);
      expect(res2.body.data.actual_visit_time).toBe('23:59');
    });
  });
});
