import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app, { initDatabase } from '../../src/backend/app';

// ============================================================
// FK-42: 前端审批详情行为测试 (US012)
// 验证前端详情页所依赖的 API 契约
// 共 4 个测试用例
// ============================================================

const SESSION = 'fk42-frontend-detail-session';
const APPROVER = 'fk42-frontend-detail-approver';

let deptId: string;
let pendingApp: string;
let approvedApp: string;
let withAttachmentApp: string;
let noAttachmentApp: string;

describe('FK-42 前端审批详情测试 (US012)', () => {
  beforeAll(async () => {
    await initDatabase();

    const deptsRes = await request(app).get('/api/departments');
    deptId = deptsRes.body.data[0].id;

    // 创建一条完整字段的 pending 申请
    const pendingRes = await request(app)
      .post('/api/applications')
      .send({
        session_id: SESSION,
        visitor_name: '张三',
        phone: '13800138000',
        id_card: '110101199001011234',
        company: '北京大学',
        visitor_count: 3,
        is_driving: true,
        license_plate: '京A12345',
        contact_person: '李四',
        department_id: deptId,
        visit_start_time: '2025-06-15T09:00:00.000Z',
        visit_end_time: '2025-06-15T17:00:00.000Z',
        visit_purpose: '学术交流',
      });
    expect(pendingRes.body.code).toBe(0);
    pendingApp = pendingRes.body.data.id;

    // 创建并同意一条申请
    const approvedRes = await request(app)
      .post('/api/applications')
      .send({
        session_id: SESSION,
        visitor_name: '已同意访客',
        phone: '13900139000',
        visitor_count: 1,
        is_driving: false,
        contact_person: '王五',
        department_id: deptId,
        visit_start_time: '2025-06-16T09:00:00.000Z',
        visit_end_time: '2025-06-16T17:00:00.000Z',
        visit_purpose: '项目汇报',
      });
    approvedApp = approvedRes.body.data.id;
    await request(app)
      .post(`/api/approvals/${approvedApp}/approve`)
      .send({ operator_session_id: APPROVER });

    // 创建带附件的申请
    const attachRes = await request(app)
      .post('/api/applications')
      .send({
        session_id: SESSION,
        visitor_name: '带附件访客',
        phone: '13700137000',
        visitor_count: 1,
        is_driving: false,
        contact_person: '赵六',
        department_id: deptId,
        visit_start_time: '2025-06-17T09:00:00.000Z',
        visit_end_time: '2025-06-17T17:00:00.000Z',
        visit_purpose: '带附件测试',
        attachment_url: 'https://example.com/doc.pdf',
      });
    withAttachmentApp = attachRes.body.data.id;

    // 创建不带附件的申请
    const noAttachRes = await request(app)
      .post('/api/applications')
      .send({
        session_id: SESSION,
        visitor_name: '无附件访客',
        phone: '13600136000',
        visitor_count: 1,
        is_driving: false,
        contact_person: '钱七',
        department_id: deptId,
        visit_start_time: '2025-06-18T09:00:00.000Z',
        visit_end_time: '2025-06-18T17:00:00.000Z',
        visit_purpose: '无附件测试',
      });
    noAttachmentApp = noAttachRes.body.data.id;
  });

  // #6 US012-正常流程：查看申请完整详情以辅助审批决策
  it('#6 详情接口返回完整 14 字段 + 审批状态 + 提交时间，pending 状态下前端可展示操作按钮', async () => {
    const res = await request(app).get(`/api/applications/${pendingApp}`);

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);

    const data = res.body.data;

    // 14 字段完整
    expect(data.visitor_name).toBe('张三');
    expect(data.phone).toBe('13800138000');
    expect(data.id_card).toBe('110101199001011234');
    expect(data.company).toBe('北京大学');
    expect(data.visitor_count).toBe(3);
    expect(data.is_driving).toBe(true);
    expect(data.license_plate).toBe('京A12345');
    expect(data.contact_person).toBe('李四');
    expect(data.department_id).toBe(deptId);
    expect(data.visit_start_time).toBe('2025-06-15T09:00:00.000Z');
    expect(data.visit_end_time).toBe('2025-06-15T17:00:00.000Z');
    expect(data.visit_purpose).toBe('学术交流');
    expect(data).toHaveProperty('attachment_url');
    // 审批状态
    expect(data.approval_status).toBe('pending');
    // 提交时间
    expect(data).toHaveProperty('created_at');
    expect(data.created_at).toBeTruthy();

    // pending → 前端可展示同意/退回/拒绝按钮
    expect(data.approval_status).toBe('pending');
  });

  // #7 US012-无效场景：详情页数据加载不完整
  it('#7 详情接口所有必填字段均有值（不为 null/undefined），前端无需容错缺失字段', async () => {
    const res = await request(app).get(`/api/applications/${pendingApp}`);
    expect(res.body.code).toBe(0);

    const data = res.body.data;

    // 前端依赖的所有必填字段
    const requiredFields = [
      'id',
      'visitor_name',
      'phone',
      'visitor_count',
      'is_driving',
      'contact_person',
      'department_id',
      'visit_start_time',
      'visit_end_time',
      'visit_purpose',
      'approval_status',
      'session_id',
      'version',
      'created_at',
      'updated_at',
    ];

    for (const field of requiredFields) {
      expect(data).toHaveProperty(field);
      expect(data[field]).not.toBeNull();
      expect(data[field]).not.toBeUndefined();
    }

    // 选填字段可以为 null，但 key 必须存在
    expect(data).toHaveProperty('id_card');
    expect(data).toHaveProperty('company');
    expect(data).toHaveProperty('license_plate');
    expect(data).toHaveProperty('attachment_url');
    expect(data).toHaveProperty('pass_status');
  });

  // #8 US012-无效场景：非待审批状态下审批按钮不可用
  it('#8 已同意的申请详情 approval_status=approved，前端据此禁用/隐藏操作按钮', async () => {
    const res = await request(app).get(`/api/applications/${approvedApp}`);
    expect(res.body.code).toBe(0);

    const data = res.body.data;
    expect(data.approval_status).toBe('approved');
    expect(data.approval_status).not.toBe('pending');

    // 前端逻辑：当 approval_status !== 'pending' 时，禁用同意/退回/拒绝按钮
    // 并显示提示"该申请已处理，不可重复操作"

    // 验证：对已同意申请执行审批操作被拦截
    const approveRes = await request(app)
      .post(`/api/approvals/${approvedApp}/approve`)
      .send({ operator_session_id: 'another-approver' });
    expect(approveRes.status).toBe(400);
    expect(approveRes.body.code).toBe(40010);
    expect(approveRes.body.msg).toContain('该申请已处理，不可重复操作');
  });

  // #9 US012-无效场景：附件加载失败
  it('#9 attachment_url 为 null 时前端可安全处理（不影响详情展示），有附件时正常返回 URL', async () => {
    // 无附件的申请
    const noAttachRes = await request(app).get(`/api/applications/${noAttachmentApp}`);
    expect(noAttachRes.body.code).toBe(0);
    expect(noAttachRes.body.data.attachment_url).toBeNull();
    // 其他字段正常
    expect(noAttachRes.body.data.visitor_name).toBe('无附件访客');
    expect(noAttachRes.body.data.phone).toBe('13600136000');
    expect(noAttachRes.body.data.approval_status).toBe('pending');

    // 有附件的申请
    const withAttachRes = await request(app).get(`/api/applications/${withAttachmentApp}`);
    expect(withAttachRes.body.code).toBe(0);
    expect(withAttachRes.body.data.attachment_url).toBe('https://example.com/doc.pdf');
    expect(withAttachRes.body.data.visitor_name).toBe('带附件访客');

    // 附件字段为 null 时不影响审批操作
    const approveRes = await request(app)
      .post(`/api/approvals/${noAttachmentApp}/approve`)
      .send({ operator_session_id: APPROVER });
    expect(approveRes.body.code).toBe(0);
    expect(approveRes.body.data.pass).toBeDefined();
  });
});
