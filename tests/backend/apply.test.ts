import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app, { initDatabase } from '../../src/backend/app';

/**
 * FK-41: 后端申请API综合测试 — 提交访客申请（US001-US010）
 *
 * 覆盖 34 个测试用例的 API 集成测试，通过 supertest
 * 向 Express 应用发送 HTTP 请求，验证完整的前后端交互流程。
 */

const SESSION = 'fk41-apply-test';
const APPROVER_SESSION = 'fk41-approver';

/** 构造合法申请数据 */
function validApplication(overrides: Record<string, unknown> = {}) {
  return {
    session_id: SESSION,
    visitor_name: '张三',
    phone: '13800138000',
    visitor_count: 2,
    is_driving: false,
    contact_person: '李四',
    department_id: '',  // 将在 beforeAll 中设置
    visit_start_time: '09:00',
    visit_end_time: '17:00',
    visit_purpose: '业务交流',
    ...overrides,
  };
}

let deptId: string;

describe('FK-41: 后端申请API综合测试', () => {
  beforeAll(async () => {
    await initDatabase();
    const res = await request(app).get('/api/departments');
    deptId = res.body.data[0].id;
  });

  // ============================================================
  // US001: 访客基本信息采集 — API层
  // ============================================================
  describe('US001: 访客基本信息采集', () => {
    it('[PASS] US001-正常填写访客基本信息提交成功', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send(validApplication({ department_id: deptId }));

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.visitor_name).toBe('张三');
      expect(res.body.data.phone).toBe('13800138000');
      expect(res.body.data.approval_status).toBe('pending');
      expect(res.body.data.id).toBeDefined();
    });

    it('[FAIL] US001-访客姓名为空提交被拒绝', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send(validApplication({ visitor_name: '', department_id: deptId }));

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
      expect(res.body.msg).toContain('访客姓名');
    });

    it('[FAIL] US001-访客姓名超过20字符提交被拒绝', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send(validApplication({
          visitor_name: '测'.repeat(21),
          department_id: deptId,
        }));

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
    });

    it('[FAIL] US001-手机号格式错误提交被拒绝', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send(validApplication({
          phone: '23456789012',
          department_id: deptId,
        }));

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
      expect(res.body.msg).toContain('手机号');
    });

    it('[FAIL] US001-访客单位超过50字符提交被拒绝', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send(validApplication({
          company: 'A'.repeat(51),
          department_id: deptId,
        }));

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
    });
  });

  // ============================================================
  // US002: 访客人数与车辆信息 — API层
  // ============================================================
  describe('US002: 访客人数与车辆信息', () => {
    it('[PASS] US002-不开车情况正常提交', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send(validApplication({
          visitor_count: 3,
          is_driving: false,
          department_id: deptId,
        }));

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.visitor_count).toBe(3);
      expect(res.body.data.is_driving).toBe(false);
    });

    it('[PASS] US002-开车情况正常提交', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send(validApplication({
          visitor_count: 2,
          is_driving: true,
          license_plate: '京A12345',
          department_id: deptId,
        }));

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.is_driving).toBe(true);
      expect(res.body.data.license_plate).toBe('京A12345');
    });

    it('[FAIL] US002-访客人数小于1提交被拒绝', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send(validApplication({
          visitor_count: 0,
          department_id: deptId,
        }));

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
    });

    it('[FAIL] US002-访客人数非整数提交被拒绝', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send(validApplication({
          visitor_count: 1.5,
          department_id: deptId,
        }));

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
    });

    it('[FAIL] US002-选择开车但车牌号为空提交被拒绝', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send(validApplication({
          is_driving: true,
          license_plate: '',
          department_id: deptId,
        }));

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
      expect(res.body.msg).toContain('车牌号');
    });
  });

  // ============================================================
  // US003: 拜访对接信息 — API层
  // ============================================================
  describe('US003: 拜访对接信息', () => {
    it('[PASS] US003-正常填写拜访对接信息提交成功', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send(validApplication({
          contact_person: '王老师',
          department_id: deptId,
        }));

      expect(res.status).toBe(200);
      expect(res.body.data.contact_person).toBe('王老师');
      expect(res.body.data.department_id).toBe(deptId);
    });

    it('[FAIL] US003-内部对接人为空提交被拒绝', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send(validApplication({
          contact_person: '',
          department_id: deptId,
        }));

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
    });

    it('[FAIL] US003-内部对接人超过20字符提交被拒绝', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send(validApplication({
          contact_person: '名'.repeat(21),
          department_id: deptId,
        }));

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
    });

    it('[FAIL] US003-对接人部门未选择提交被拒绝', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send(validApplication({ department_id: '' }));

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
    });
  });

  // ============================================================
  // US004: 拜访时间段 — API层
  // ============================================================
  describe('US004: 拜访时间段', () => {
    it('[PASS] US004-正常选择拜访时间段提交成功', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send(validApplication({
          visit_start_time: '09:00',
          visit_end_time: '17:00',
          department_id: deptId,
        }));

      expect(res.status).toBe(200);
      expect(res.body.data.visit_start_time).toBe('09:00');
      expect(res.body.data.visit_end_time).toBe('17:00');
    });

    it('[FAIL] US004-拜访起始时间为空提交被拒绝', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send(validApplication({
          visit_start_time: '',
          department_id: deptId,
        }));

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
    });

    it('[FAIL] US004-结束时间早于起始时间提交被拒绝', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send(validApplication({
          visit_start_time: '14:00',
          visit_end_time: '09:00',
          department_id: deptId,
        }));

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
    });

    it('[FAIL] US004-结束时间等于起始时间提交被拒绝', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send(validApplication({
          visit_start_time: '09:00',
          visit_end_time: '09:00',
          department_id: deptId,
        }));

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
    });
  });

  // ============================================================
  // US005: 到访事宜说明 — API层
  // ============================================================
  describe('US005: 到访事宜说明', () => {
    it('[PASS] US005-正常填写到访事宜提交成功', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send(validApplication({
          visit_purpose: '参加学术交流会议',
          department_id: deptId,
        }));

      expect(res.status).toBe(200);
      expect(res.body.data.visit_purpose).toBe('参加学术交流会议');
    });

    it('[FAIL] US005-到访事宜为空提交被拒绝', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send(validApplication({
          visit_purpose: '',
          department_id: deptId,
        }));

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
    });

    it('[FAIL] US005-到访事宜超过200字符提交被拒绝', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send(validApplication({
          visit_purpose: '事'.repeat(201),
          department_id: deptId,
        }));

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
    });
  });

  // ============================================================
  // US006: 附件上传 — API层
  // ============================================================
  describe('US006: 附件上传', () => {
    it('[PASS] US006-不上传附件正常提交', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send(validApplication({
          attachment_url: null,
          department_id: deptId,
        }));

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.attachment_url).toBeNull();
    });

    it('[PASS] US006-上传一个附件正常提交', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send(validApplication({
          attachment_url: 'https://example.com/files/document.pdf',
          department_id: deptId,
        }));

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.attachment_url).toBe('https://example.com/files/document.pdf');
    });

    it('[FAIL] US006-附件URL超长提交被拒绝（模拟数量限制）', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send(validApplication({
          attachment_url: 'x'.repeat(501),
          department_id: deptId,
        }));

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
    });
  });

  // ============================================================
  // US007: 表单提交控制 — API层
  // ============================================================
  describe('US007: 表单提交控制', () => {
    it('[PASS] US007-全部必填项填写正确并提交成功', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send(validApplication({ department_id: deptId }));

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.approval_status).toBe('pending');
      expect(res.body.data.version).toBe(1);
    });

    it('[FAIL] US007-存在必填项为空时提交被拒绝', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send({
          session_id: SESSION,
          visitor_name: '',
          phone: '',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
      expect(res.body.data).toBeNull();
    });
  });

  // ============================================================
  // US008: 暂存草稿与恢复编辑 — API层
  // ============================================================
  describe('US008: 暂存草稿与恢复编辑', () => {
    const DRAFT_SESSION = 'fk41-draft-session';

    it('[PASS] US008-暂存未完成的申请草稿成功', async () => {
      const formData = {
        visitor_name: '草稿用户',
        phone: '138',
        visitor_count: undefined,
      };

      const res = await request(app)
        .post('/api/drafts')
        .send({
          session_id: DRAFT_SESSION,
          form_data: formData,
        });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.session_id).toBe(DRAFT_SESSION);
    });

    it('[PASS] US008-重新加载草稿继续编辑并提交', async () => {
      // Step 1: 暂存草稿
      const formData = {
        visitor_name: '草稿提交用户',
        phone: '13700137000',
      };
      const saveRes = await request(app)
        .post('/api/drafts')
        .send({
          session_id: DRAFT_SESSION + '-submit',
          form_data: formData,
        });
      expect(saveRes.status).toBe(200);

      // Step 2: 加载草稿
      const loadRes = await request(app)
        .get('/api/drafts')
        .query({ session_id: DRAFT_SESSION + '-submit' });
      expect(loadRes.status).toBe(200);
      expect(loadRes.body.data).not.toBeNull();
      const parsed = JSON.parse(loadRes.body.data.form_data);
      expect(parsed.visitor_name).toBe('草稿提交用户');

      // Step 3: 基于草稿数据提交完整申请
      const submitRes = await request(app)
        .post('/api/applications')
        .send(validApplication({
          session_id: DRAFT_SESSION + '-submit',
          visitor_name: parsed.visitor_name,
          phone: parsed.phone,
          department_id: deptId,
        }));

      expect(submitRes.status).toBe(200);
      expect(submitRes.body.code).toBe(0);
      expect(submitRes.body.data.visitor_name).toBe('草稿提交用户');

      // Step 4: 提交成功后草稿应被清理
      const afterSubmit = await request(app)
        .get('/api/drafts')
        .query({ session_id: DRAFT_SESSION + '-submit' });
      expect(afterSubmit.body.data).toBeNull();
    });
  });

  // ============================================================
  // US009: 教职工代申请 — API层
  // ============================================================
  describe('US009: 教职工代申请', () => {
    const TEACHER_SESSION = 'fk41-teacher-session';

    it('[PASS] US009-教职工代访客正常填写并提交申请', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send(validApplication({
          session_id: TEACHER_SESSION,
          visitor_name: '访客王五',
          phone: '13900139000',
          contact_person: '教工张三',
          department_id: deptId,
        }));

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.visitor_name).toBe('访客王五');
      expect(res.body.data.contact_person).toBe('教工张三');
      expect(res.body.data.session_id).toBe(TEACHER_SESSION);
      expect(res.body.data.approval_status).toBe('pending');
    });

    it('[FAIL] US009-教职工代申请必填信息缺失提交被阻止', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send({
          session_id: TEACHER_SESSION,
          visitor_name: '',
          phone: '',
          contact_person: '教工张三',
          department_id: deptId,
          visit_start_time: '09:00',
          visit_end_time: '17:00',
          visit_purpose: '代申请',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
    });
  });

  // ============================================================
  // US010: 申请状态查看 — API层
  // ============================================================
  describe('US010: 申请状态查看', () => {
    let pendingAppId: string;
    let approvedAppId: string;
    let returnedAppId: string;
    let rejectedAppId: string;

    beforeAll(async () => {
      // 创建 4 个申请用于测试不同状态
      const session = 'fk41-status-test';

      // 1. 创建待审批申请
      const r1 = await request(app)
        .post('/api/applications')
        .send(validApplication({ session_id: session, visitor_name: '待审批用户', department_id: deptId }));
      pendingAppId = r1.body.data.id;

      // 2. 创建并审批通过
      const r2 = await request(app)
        .post('/api/applications')
        .send(validApplication({ session_id: session, visitor_name: '已同意用户', phone: '13100131000', department_id: deptId }));
      approvedAppId = r2.body.data.id;
      await request(app)
        .post(`/api/approvals/${approvedAppId}/approve`)
        .send({ operator_session_id: APPROVER_SESSION });

      // 3. 创建并退回
      const r3 = await request(app)
        .post('/api/applications')
        .send(validApplication({ session_id: session, visitor_name: '已退回用户', phone: '13200132000', department_id: deptId }));
      returnedAppId = r3.body.data.id;
      await request(app)
        .post(`/api/approvals/${returnedAppId}/return`)
        .send({ operator_session_id: APPROVER_SESSION, reason: '信息不完整' });

      // 4. 创建并拒绝
      const r4 = await request(app)
        .post('/api/applications')
        .send(validApplication({ session_id: session, visitor_name: '已拒绝用户', phone: '13300133000', department_id: deptId }));
      rejectedAppId = r4.body.data.id;
      await request(app)
        .post(`/api/approvals/${rejectedAppId}/reject`)
        .send({ operator_session_id: APPROVER_SESSION, reason: '不符合访问条件' });
    });

    it('[PASS] US010-查看待审批状态的申请', async () => {
      const res = await request(app).get(`/api/applications/${pendingAppId}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.approval_status).toBe('pending');
      expect(res.body.data.visitor_name).toBe('待审批用户');
      expect(res.body.data.pass_status).toBeNull();
    });

    it('[PASS] US010-查看已同意状态的申请及通行证信息', async () => {
      const res = await request(app).get(`/api/applications/${approvedAppId}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.approval_status).toBe('approved');
      expect(res.body.data.visitor_name).toBe('已同意用户');
      expect(res.body.data.pass_status).toBe('not_visited');
    });

    it('[PASS] US010-查看已退回状态的申请', async () => {
      const res = await request(app).get(`/api/applications/${returnedAppId}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.approval_status).toBe('returned');
      expect(res.body.data.visitor_name).toBe('已退回用户');

      // 验证退回原因可查
      const reasonRes = await request(app)
        .get(`/api/applications/${returnedAppId}/return-reason`);
      expect(reasonRes.status).toBe(200);
      expect(reasonRes.body.data.reason).toBe('信息不完整');
    });

    it('[PASS] US010-查看已拒绝状态的申请', async () => {
      const res = await request(app).get(`/api/applications/${rejectedAppId}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.approval_status).toBe('rejected');
      expect(res.body.data.visitor_name).toBe('已拒绝用户');
    });
  });
});
