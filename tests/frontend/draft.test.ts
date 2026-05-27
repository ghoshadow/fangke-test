import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app, { initDatabase } from '../../src/backend/app';

/**
 * FK-41: 草稿功能综合测试 — US008
 *
 * 测试暂存草稿与恢复编辑的完整流程：
 * 1. 暂存未完成的申请草稿
 * 2. 重新加载草稿继续编辑并提交
 * 3. 草稿数据完整性验证
 * 4. 提交成功后草稿自动清理
 */

const DRAFT_SESSION = 'fk41-draft-test';
let deptId: string;

/** 构造合法申请数据 */
function validApplication(overrides: Record<string, unknown> = {}) {
  return {
    session_id: DRAFT_SESSION,
    visitor_name: '张三',
    phone: '13800138000',
    visitor_count: 2,
    is_driving: false,
    contact_person: '李四',
    department_id: '',
    visit_start_time: '09:00',
    visit_end_time: '17:00',
    visit_purpose: '业务交流',
    ...overrides,
  };
}

describe('FK-41: 草稿功能综合测试（US008）', () => {
  beforeAll(async () => {
    await initDatabase();
    const res = await request(app).get('/api/departments');
    deptId = res.body.data[0].id;
  });

  // ============================================================
  // US008-1: 暂存未完成的申请草稿成功
  // ============================================================
  describe('US008-暂存草稿', () => {
    it('[PASS] US008-暂存部分填写的草稿', async () => {
      const formData = {
        visitor_name: '草稿用户',
        phone: '138',
        visitor_count: undefined,
        is_driving: false,
      };

      const res = await request(app)
        .post('/api/drafts')
        .send({
          session_id: DRAFT_SESSION + '-partial',
          form_data: formData,
        });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.session_id).toBe(DRAFT_SESSION + '-partial');
    });

    it('[PASS] US008-暂存空表单的草稿', async () => {
      const formData = {};

      const res = await request(app)
        .post('/api/drafts')
        .send({
          session_id: DRAFT_SESSION + '-empty',
          form_data: formData,
        });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
    });

    it('[PASS] US008-暂存几乎完整的草稿（仅缺少选填项）', async () => {
      const formData = {
        visitor_name: '完整草稿',
        phone: '13800138000',
        visitor_count: 3,
        is_driving: true,
        license_plate: '京A12345',
        contact_person: '王老师',
        department: '教务处',
        visit_start: '09:00',
        visit_end: '17:00',
        visit_purpose: '交流访问',
      };

      const res = await request(app)
        .post('/api/drafts')
        .send({
          session_id: DRAFT_SESSION + '-full',
          form_data: formData,
        });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
    });

    it('[FAIL] 缺少 session_id 时暂存失败', async () => {
      const res = await request(app)
        .post('/api/drafts')
        .send({
          form_data: { visitor_name: '无会话' },
        });

      expect(res.status).toBe(400);
      expect(res.body.code).not.toBe(0);
    });

    it('[FAIL] 缺少 form_data 时暂存失败', async () => {
      const res = await request(app)
        .post('/api/drafts')
        .send({
          session_id: DRAFT_SESSION + '-no-data',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).not.toBe(0);
    });
  });

  // ============================================================
  // US008-2: 重新加载草稿继续编辑并提交
  // ============================================================
  describe('US008-加载草稿并提交', () => {
    it('[PASS] US008-暂存后重新加载草稿数据完整', async () => {
      const session = DRAFT_SESSION + '-load';
      const formData = {
        visitor_name: '加载测试',
        phone: '13700137000',
        visitor_count: 5,
        is_driving: false,
        contact_person: '对接人',
        department: '总务处',
        visit_start: '10:00',
        visit_end: '16:00',
        visit_purpose: '设备检查',
      };

      // Step 1: 暂存
      const saveRes = await request(app)
        .post('/api/drafts')
        .send({ session_id: session, form_data: formData });
      expect(saveRes.status).toBe(200);

      // Step 2: 加载
      const loadRes = await request(app)
        .get('/api/drafts')
        .query({ session_id: session });

      expect(loadRes.status).toBe(200);
      expect(loadRes.body.code).toBe(0);
      expect(loadRes.body.data).not.toBeNull();

      const parsed = JSON.parse(loadRes.body.data.form_data);
      expect(parsed.visitor_name).toBe('加载测试');
      expect(parsed.phone).toBe('13700137000');
      expect(parsed.visitor_count).toBe(5);
      expect(parsed.contact_person).toBe('对接人');
      expect(parsed.department).toBe('总务处');
      expect(parsed.visit_start).toBe('10:00');
      expect(parsed.visit_end).toBe('16:00');
      expect(parsed.visit_purpose).toBe('设备检查');
    });

    it('[PASS] US008-加载草稿后编辑并提交成功', async () => {
      const session = DRAFT_SESSION + '-edit-submit';

      // Step 1: 暂存部分数据
      const partialData = {
        visitor_name: '编辑提交',
        phone: '13600136000',
      };
      const saveRes = await request(app)
        .post('/api/drafts')
        .send({ session_id: session, form_data: partialData });
      expect(saveRes.status).toBe(200);

      // Step 2: 加载草稿
      const loadRes = await request(app)
        .get('/api/drafts')
        .query({ session_id: session });
      expect(loadRes.body.data).not.toBeNull();

      const parsed = JSON.parse(loadRes.body.data.form_data);

      // Step 3: 补充完整信息后提交
      const submitRes = await request(app)
        .post('/api/applications')
        .send(validApplication({
          session_id: session,
          visitor_name: parsed.visitor_name,
          phone: parsed.phone,
          visitor_count: 2,
          is_driving: false,
          contact_person: '李四',
          department_id: deptId,
          visit_start_time: '09:00',
          visit_end_time: '17:00',
          visit_purpose: '完整提交',
        }));

      expect(submitRes.status).toBe(200);
      expect(submitRes.body.code).toBe(0);
      expect(submitRes.body.data.visitor_name).toBe('编辑提交');
      expect(submitRes.body.data.phone).toBe('13600136000');
    });

    it('[PASS] US008-提交成功后草稿自动清理', async () => {
      const session = DRAFT_SESSION + '-cleanup';

      // Step 1: 暂存草稿
      await request(app)
        .post('/api/drafts')
        .send({
          session_id: session,
          form_data: { visitor_name: '清理测试' },
        });

      // Step 2: 提交申请
      await request(app)
        .post('/api/applications')
        .send(validApplication({
          session_id: session,
          department_id: deptId,
        }));

      // Step 3: 验证草稿已被清理
      const loadRes = await request(app)
        .get('/api/drafts')
        .query({ session_id: session });
      expect(loadRes.body.data).toBeNull();
    });

    it('[PASS] US008-覆盖已有草稿', async () => {
      const session = DRAFT_SESSION + '-overwrite';

      // 第一次暂存
      await request(app)
        .post('/api/drafts')
        .send({
          session_id: session,
          form_data: { visitor_name: '第一次' },
        });

      // 第二次暂存（覆盖）
      await request(app)
        .post('/api/drafts')
        .send({
          session_id: session,
          form_data: { visitor_name: '第二次覆盖' },
        });

      // 加载应为第二次的数据
      const loadRes = await request(app)
        .get('/api/drafts')
        .query({ session_id: session });
      const parsed = JSON.parse(loadRes.body.data.form_data);
      expect(parsed.visitor_name).toBe('第二次覆盖');
    });
  });

  // ============================================================
  // 草稿隔离性
  // ============================================================
  describe('草稿隔离性', () => {
    it('不同 session 的草稿互不影响', async () => {
      const session1 = DRAFT_SESSION + '-iso1';
      const session2 = DRAFT_SESSION + '-iso2';

      await request(app)
        .post('/api/drafts')
        .send({ session_id: session1, form_data: { visitor_name: '用户A' } });

      await request(app)
        .post('/api/drafts')
        .send({ session_id: session2, form_data: { visitor_name: '用户B' } });

      const load1 = await request(app)
        .get('/api/drafts')
        .query({ session_id: session1 });
      const load2 = await request(app)
        .get('/api/drafts')
        .query({ session_id: session2 });

      const p1 = JSON.parse(load1.body.data.form_data);
      const p2 = JSON.parse(load2.body.data.form_data);

      expect(p1.visitor_name).toBe('用户A');
      expect(p2.visitor_name).toBe('用户B');
    });

    it('无草稿时加载返回 null', async () => {
      const res = await request(app)
        .get('/api/drafts')
        .query({ session_id: 'non-existent-session' });

      expect(res.status).toBe(200);
      expect(res.body.data).toBeNull();
    });
  });
});
