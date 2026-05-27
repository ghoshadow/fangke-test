import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { initDatabase } from '../../src/backend/config';
import { DepartmentModel } from '../../src/backend/models/department';
import { ApplicationModel } from '../../src/backend/models/application';
import { VisitorPassModel } from '../../src/backend/models/visitor-pass';
import { ApprovalRecordModel } from '../../src/backend/models/approval-record';
import recordRoutes from '../../src/backend/routes/record';
import approvalRoutes from '../../src/backend/routes/approval';
import passRoutes from '../../src/backend/routes/pass';
import { errorHandler } from '../../src/backend/middleware/response';

// ============================================================
// 【测试】访客记录详情查看（全字段） — FK-39
// 测试 GET /api/records/:id 详情接口
// 验证详情页展示申请表单全部字段+审批结果+通行状态+实际到访时间
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

describe('访客记录详情查看（全字段）', () => {
  let testApp: ReturnType<typeof createTestApp>;
  let deptId: string;

  beforeAll(async () => {
    await initDatabase();
    testApp = createTestApp();
    const depts = DepartmentModel.findAll();
    deptId = depts[0].id;
  });

  // ============================================================
  // 辅助：创建一个申请（可选走审批流程生成审批记录 + 通行证）
  // ============================================================
  function createApplication(overrides: Partial<{
    visitor_name: string;
    phone: string;
    id_card: string;
    company: string;
    visitor_count: number;
    is_driving: boolean;
    license_plate: string;
    contact_person: string;
    visit_purpose: string;
    attachment_url: string;
    visit_start_time: string;
    visit_end_time: string;
  }> = {}) {
    return ApplicationModel.create({
      visitor_name: overrides.visitor_name ?? '记录详情访客',
      phone: overrides.phone ?? '13800000001',
      id_card: overrides.id_card ?? '110101199001011234',
      company: overrides.company ?? '测试单位',
      visitor_count: overrides.visitor_count ?? 2,
      is_driving: overrides.is_driving ?? true,
      license_plate: overrides.license_plate ?? '京A12345',
      contact_person: overrides.contact_person ?? '内部对接人',
      department_id: deptId,
      visit_start_time: overrides.visit_start_time ?? '2024-06-01T09:00:00.000Z',
      visit_end_time: overrides.visit_end_time ?? '2024-06-01T17:00:00.000Z',
      visit_purpose: overrides.visit_purpose ?? '记录详情测试',
      attachment_url: overrides.attachment_url ?? null,
      session_id: 'record-detail-test-session',
    });
  }

  async function approveApplication(appId: string, operatorSession = 'approver-session-1') {
    const res = await request(testApp)
      .post(`/api/approvals/${appId}/approve`)
      .send({ operator_session_id: operatorSession });
    return res;
  }

  async function returnApplication(appId: string, reason: string, operatorSession = 'approver-session-1') {
    const res = await request(testApp)
      .post(`/api/approvals/${appId}/return`)
      .send({ operator_session_id: operatorSession, reason });
    return res;
  }

  async function rejectApplication(appId: string, reason: string, operatorSession = 'approver-session-1') {
    const res = await request(testApp)
      .post(`/api/approvals/${appId}/reject`)
      .send({ operator_session_id: operatorSession, reason });
    return res;
  }

  // ============================================================
  // 场景 1：点击查看详情 — 异步加载并展示完整详情页
  // ============================================================
  describe('场景1: 点击查看详情 — 异步加载完整详情页', () => {
    it('GET /api/records/:id 返回 code=0 及完整的详情数据结构', async () => {
      const app = createApplication({ visitor_name: '场景1访客' });
      await approveApplication(app.id);

      const res = await request(testApp).get(`/api/records/${app.id}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.msg).toBe('success');

      // 详情页三大核心数据结构
      expect(res.body.data).toHaveProperty('application');
      expect(res.body.data).toHaveProperty('approval_records');
      expect(res.body.data).toHaveProperty('pass');
    });

    it('详情页返回的 application 对象与原始申请 ID 一致', async () => {
      const app = createApplication({ visitor_name: '场景1-ID一致性' });
      await approveApplication(app.id);

      const res = await request(testApp).get(`/api/records/${app.id}`);

      expect(res.body.data.application.id).toBe(app.id);
    });
  });

  // ============================================================
  // 场景 2：详情页字段完整性 — 包含全部 14 字段
  // ============================================================
  describe('场景2: 详情页字段完整性（14 字段）', () => {
    it('详情接口返回申请的全部必填与可选字段', async () => {
      const app = createApplication({
        visitor_name: '全字段访客',
        phone: '13912345678',
        id_card: '310101198512151234',
        company: '上海测试公司',
        visitor_count: 3,
        is_driving: true,
        license_plate: '沪B12345',
        contact_person: '王主任',
        visit_purpose: '校园参观交流',
        attachment_url: 'https://example.com/attach.pdf',
        visit_start_time: '2024-07-01T09:00:00.000Z',
        visit_end_time: '2024-07-01T17:00:00.000Z',
      });
      await approveApplication(app.id);

      const res = await request(testApp).get(`/api/records/${app.id}`);
      const data = res.body.data.application;

      // 14 字段 + 状态字段全覆盖
      expect(data.visitor_name).toBe('全字段访客');
      expect(data.phone).toBe('13912345678');
      expect(data.id_card).toBe('310101198512151234');
      expect(data.company).toBe('上海测试公司');
      expect(data.visitor_count).toBe(3);
      expect(data.is_driving).toBe(true);
      expect(data.license_plate).toBe('沪B12345');
      expect(data.contact_person).toBe('王主任');
      expect(data.department_id).toBe(deptId);
      expect(data.visit_start_time).toBe('2024-07-01T09:00:00.000Z');
      expect(data.visit_end_time).toBe('2024-07-01T17:00:00.000Z');
      expect(data.visit_purpose).toBe('校园参观交流');
      expect(data.attachment_url).toBe('https://example.com/attach.pdf');
      // 服务端管理字段
      expect(data.approval_status).toBe('approved');
      expect(data.created_at).toBeDefined();
    });

    it('可选字段为空时详情正确返回 null', async () => {
      const app = ApplicationModel.create({
        visitor_name: '无可选字段访客',
        phone: '13800009999',
        visitor_count: 1,
        is_driving: false,
        contact_person: '对接人',
        department_id: deptId,
        visit_start_time: '2024-06-01T09:00:00.000Z',
        visit_end_time: '2024-06-01T17:00:00.000Z',
        visit_purpose: '无可选字段测试',
        session_id: 'record-detail-null-test',
      });
      await approveApplication(app.id);

      const res = await request(testApp).get(`/api/records/${app.id}`);
      const data = res.body.data.application;

      expect(data.id_card).toBeNull();
      expect(data.company).toBeNull();
      expect(data.license_plate).toBeNull();
      expect(data.attachment_url).toBeNull();
    });

    it('详情页返回的数据与申请时提交的原始数据完全一致（证件核对）', async () => {
      const app = createApplication({
        visitor_name: '证件核对访客',
        phone: '13611112222',
        id_card: '330102199305051234',
        company: '杭州测试公司',
        visitor_count: 4,
        is_driving: true,
        license_plate: '浙A99999',
        contact_person: '张老师',
        visit_purpose: '产学研交流',
      });
      await approveApplication(app.id);

      const res = await request(testApp).get(`/api/records/${app.id}`);
      const data = res.body.data.application;

      expect(data.visitor_name).toBe(app.visitor_name);
      expect(data.phone).toBe(app.phone);
      expect(data.id_card).toBe(app.id_card);
      expect(data.company).toBe(app.company);
      expect(data.visitor_count).toBe(app.visitor_count);
      expect(data.is_driving).toBe(app.is_driving);
      expect(data.license_plate).toBe(app.license_plate);
      expect(data.contact_person).toBe(app.contact_person);
      expect(data.department_id).toBe(app.department_id);
      expect(data.visit_start_time).toBe(app.visit_start_time);
      expect(data.visit_end_time).toBe(app.visit_end_time);
      expect(data.visit_purpose).toBe(app.visit_purpose);
    });
  });

  // ============================================================
  // 场景 3：审批结果展示 — 审批状态 + 审批意见/退回原因
  // ============================================================
  describe('场景3: 审批结果展示', () => {
    it('审批通过后详情显示 approval_status=approved + 审批记录', async () => {
      const app = createApplication({ visitor_name: '审批通过展示' });
      await approveApplication(app.id);

      const res = await request(testApp).get(`/api/records/${app.id}`);

      expect(res.body.data.application.approval_status).toBe('approved');
      expect(res.body.data.approval_records).toBeInstanceOf(Array);
      expect(res.body.data.approval_records.length).toBeGreaterThanOrEqual(1);

      const approveRecord = res.body.data.approval_records.find(
        (r: { operation_type: string }) => r.operation_type === 'approve',
      );
      expect(approveRecord).toBeDefined();
      expect(approveRecord.operation_type).toBe('approve');
      expect(approveRecord.operated_at).toBeDefined();
    });

    it('退回后详情显示 approval_status=returned + 退回原因', async () => {
      const app = createApplication({ visitor_name: '退回原因展示' });
      await returnApplication(app.id, '信息不完整，请补充身份证号');

      const res = await request(testApp).get(`/api/records/${app.id}`);

      expect(res.body.data.application.approval_status).toBe('returned');
      const returnRecord = res.body.data.approval_records.find(
        (r: { operation_type: string }) => r.operation_type === 'return',
      );
      expect(returnRecord).toBeDefined();
      expect(returnRecord.reason).toBe('信息不完整，请补充身份证号');
      expect(returnRecord.operated_at).toBeDefined();
    });

    it('拒绝后详情显示 approval_status=rejected + 拒绝原因', async () => {
      const app = createApplication({ visitor_name: '拒绝原因展示' });
      await rejectApplication(app.id, '不符合入校条件');

      const res = await request(testApp).get(`/api/records/${app.id}`);

      expect(res.body.data.application.approval_status).toBe('rejected');
      const rejectRecord = res.body.data.approval_records.find(
        (r: { operation_type: string }) => r.operation_type === 'reject',
      );
      expect(rejectRecord).toBeDefined();
      expect(rejectRecord.reason).toBe('不符合入校条件');
    });

    it('待审批状态下详情显示 approval_status=pending 且审批记录为空', async () => {
      const app = createApplication({ visitor_name: '待审批展示' });

      const res = await request(testApp).get(`/api/records/${app.id}`);

      expect(res.body.data.application.approval_status).toBe('pending');
      expect(res.body.data.approval_records).toEqual([]);
    });

    it('审批记录包含操作时间、操作类型、原因等完整字段', async () => {
      const app = createApplication({ visitor_name: '审批记录字段完整性' });
      await approveApplication(app.id);

      const res = await request(testApp).get(`/api/records/${app.id}`);
      const record = res.body.data.approval_records[0];

      expect(record).toHaveProperty('id');
      expect(record).toHaveProperty('application_id');
      expect(record).toHaveProperty('operation_type');
      expect(record).toHaveProperty('reason');
      expect(record).toHaveProperty('operator_session_id');
      expect(record).toHaveProperty('operated_at');
      expect(record.application_id).toBe(app.id);
    });
  });

  // ============================================================
  // 场景 4：通行状态展示 — 未到访/已到访 + 实际到访时间
  // ============================================================
  describe('场景4: 通行状态展示', () => {
    it('审批通过后通行状态为 not_visited，pass 字段存在', async () => {
      const app = createApplication({ visitor_name: '未到访通行状态' });
      await approveApplication(app.id);

      const res = await request(testApp).get(`/api/records/${app.id}`);

      expect(res.body.data.application.pass_status).toBe('not_visited');
      expect(res.body.data.pass).not.toBeNull();
      expect(res.body.data.pass.pass_status).toBe('not_visited');
      expect(res.body.data.pass.actual_visit_time).toBeNull();
    });

    it('确认到访后通行状态变为 visited，并显示实际到访时间', async () => {
      const app = createApplication({ visitor_name: '已到访通行状态' });
      await approveApplication(app.id);

      // 通过通行证接口确认到访
      const pass = VisitorPassModel.findByApplicationId(app.id)!;
      await request(testApp)
        .post(`/api/passes/${pass.id}/confirm`)
        .send({ actual_visit_time: '14:30' });

      const res = await request(testApp).get(`/api/records/${app.id}`);

      expect(res.body.data.application.pass_status).toBe('visited');
      expect(res.body.data.pass.pass_status).toBe('visited');
      expect(res.body.data.pass.actual_visit_time).toBe('14:30');
    });

    it('待审批/退回/拒绝状态下 pass 为 null（未生成通行证）', async () => {
      const pendingApp = createApplication({ visitor_name: '待审批无通行证' });
      const resPending = await request(testApp).get(`/api/records/${pendingApp.id}`);
      expect(resPending.body.data.pass).toBeNull();
      expect(resPending.body.data.application.pass_status).toBeNull();

      const returnedApp = createApplication({ visitor_name: '退回无通行证' });
      await returnApplication(returnedApp.id, '退回测试');
      const resReturned = await request(testApp).get(`/api/records/${returnedApp.id}`);
      expect(resReturned.body.data.pass).toBeNull();

      const rejectedApp = createApplication({ visitor_name: '拒绝无通行证' });
      await rejectApplication(rejectedApp.id, '拒绝测试');
      const resRejected = await request(testApp).get(`/api/records/${rejectedApp.id}`);
      expect(resRejected.body.data.pass).toBeNull();
    });
  });

  // ============================================================
  // 场景 5：附件查看 — attachment_url 字段
  // ============================================================
  describe('场景5: 附件查看/下载', () => {
    it('有附件时详情返回 attachment_url', async () => {
      const url = 'https://example.com/files/certificate.pdf';
      const app = createApplication({
        visitor_name: '有附件访客',
        attachment_url: url,
      });
      await approveApplication(app.id);

      const res = await request(testApp).get(`/api/records/${app.id}`);

      expect(res.body.data.application.attachment_url).toBe(url);
    });

    it('无附件时 attachment_url 为 null', async () => {
      const app = ApplicationModel.create({
        visitor_name: '无附件访客',
        phone: '13800007777',
        visitor_count: 1,
        is_driving: false,
        contact_person: '对接人',
        department_id: deptId,
        visit_start_time: '2024-06-01T09:00:00.000Z',
        visit_end_time: '2024-06-01T17:00:00.000Z',
        visit_purpose: '无附件测试',
        session_id: 'record-detail-no-attach',
      });
      await approveApplication(app.id);

      const res = await request(testApp).get(`/api/records/${app.id}`);

      expect(res.body.data.application.attachment_url).toBeNull();
    });
  });

  // ============================================================
  // 场景 6：详情加载失败 — 错误提示
  // ============================================================
  describe('场景6: 详情加载失败', () => {
    it('不存在的记录 ID 返回 404 + 错误码 40404', async () => {
      const res = await request(testApp).get('/api/records/nonexistent-record-id');

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(40404);
      expect(res.body.msg).toContain('不存在');
    });

    it('404 响应中 data 为 null', async () => {
      const res = await request(testApp).get('/api/records/does-not-exist');

      expect(res.body.data).toBeNull();
    });
  });

  // ============================================================
  // 场景 7：详情页数据一致性 — 返回后筛选条件保持
  // （后端侧验证：详情接口不影响列表查询状态）
  // ============================================================
  describe('场景7: 详情查看不影响列表查询状态', () => {
    it('查看详情后再次查询列表，结果保持一致', async () => {
      const app = createApplication({ visitor_name: '列表一致性访客' });
      await approveApplication(app.id);

      // 第一次查询列表
      const list1 = await request(testApp).get('/api/records').query({ name: '列表一致性' });

      // 中间查看详情
      await request(testApp).get(`/api/records/${app.id}`);

      // 第二次查询列表
      const list2 = await request(testApp).get('/api/records').query({ name: '列表一致性' });

      expect(list1.body.data.total).toBe(list2.body.data.total);
      expect(list1.body.data.items[0].id).toBe(list2.body.data.items[0].id);
    });

    it('详情接口的查询不改变申请的任何状态字段', async () => {
      const app = createApplication({ visitor_name: '只读性验证' });
      await approveApplication(app.id);

      const before = ApplicationModel.findById(app.id);

      // 多次调用详情接口
      await request(testApp).get(`/api/records/${app.id}`);
      await request(testApp).get(`/api/records/${app.id}`);

      const after = ApplicationModel.findById(app.id);

      expect(before!.approval_status).toBe(after!.approval_status);
      expect(before!.pass_status).toBe(after!.pass_status);
      expect(before!.version).toBe(after!.version);
      expect(before!.updated_at).toBe(after!.updated_at);
    });
  });

  // ============================================================
  // 补充：审批时间线多记录场景
  // ============================================================
  describe('补充: 审批时间线 — 多次审批记录完整保留', () => {
    it('退回→重提→同意的完整流转记录按时间顺序排列', async () => {
      const app = createApplication({ visitor_name: '多记录流转' });

      // 第一次退回
      await returnApplication(app.id, '信息不完整');

      // 重新提交（模拟退回后重提）
      ApplicationModel.updateApprovalStatus(app.id, 'pending', app.version + 1);

      // 第二次审批通过（使用不同 session 避免防重复限制）
      const refreshedApp = ApplicationModel.findById(app.id)!;
      await request(testApp)
        .post(`/api/approvals/${app.id}/approve`)
        .send({ operator_session_id: 'approver-session-2' });

      const res = await request(testApp).get(`/api/records/${app.id}`);

      expect(res.body.data.approval_records.length).toBeGreaterThanOrEqual(2);

      // 审批记录应按时间顺序排列（ASC）
      const records = res.body.data.approval_records;
      for (let i = 1; i < records.length; i++) {
        expect(records[i].operated_at >= records[i - 1].operated_at).toBe(true);
      }

      // 包含退回和同意两种操作类型
      const opTypes = records.map((r: { operation_type: string }) => r.operation_type);
      expect(opTypes).toContain('return');
      expect(opTypes).toContain('approve');
    });

    it('审批记录不可被篡改（只写不删不改）', async () => {
      const app = createApplication({ visitor_name: '审批记录只写' });
      await approveApplication(app.id);

      const res1 = await request(testApp).get(`/api/records/${app.id}`);
      const records1 = res1.body.data.approval_records;
      expect(records1.length).toBe(1);

      // ApprovalRecordModel 不提供 update/delete 方法
      expect((ApprovalRecordModel as { update?: unknown }).update).toBeUndefined();
      expect((ApprovalRecordModel as { delete?: unknown }).delete).toBeUndefined();
      expect((ApprovalRecordModel as { deleteByApplicationId?: unknown }).deleteByApplicationId).toBeUndefined();

      // 再次查看详情，审批记录保持不变
      const res2 = await request(testApp).get(`/api/records/${app.id}`);
      expect(res2.body.data.approval_records.length).toBe(1);
      expect(res2.body.data.approval_records[0].id).toBe(records1[0].id);
    });
  });
});
