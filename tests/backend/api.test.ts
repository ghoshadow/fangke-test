import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app, { initDatabase } from '../../src/backend/app';

const SESSION_ID = 'api-test-session';
const headers = { 'X-Session-Id': SESSION_ID };

describe('API Routes', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  describe('GET /api/health', () => {
    it('returns 200', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
    });
  });

  describe('GET /api/departments', () => {
    it('returns department list', async () => {
      const res = await request(app).get('/api/departments');
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.length).toBe(12);
      expect(res.body.data[0]).toHaveProperty('name');
      expect(res.body.data[0]).toHaveProperty('sort_order');
    });
  });

  describe('POST /api/applications', () => {
    let deptId: string;

    beforeAll(async () => {
      const res = await request(app).get('/api/departments');
      deptId = res.body.data[0].id;
    });

    it('creates an application successfully', async () => {
      const res = await request(app)
        .post('/api/applications')
        .set(headers)
        .send({
          visitor_name: '接口测试',
          phone: '13800138000',
          visitor_count: 2,
          is_driving: false,
          contact_person: '被访人',
          department_id: deptId,
          visit_start_time: '2024-04-01T09:00:00.000Z',
          visit_end_time: '2024-04-01T17:00:00.000Z',
          visit_purpose: 'API 测试',
        });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.visitor_name).toBe('接口测试');
      expect(res.body.data.approval_status).toBe('pending');
    });

    it('rejects invalid application', async () => {
      const res = await request(app)
        .post('/api/applications')
        .set(headers)
        .send({ visitor_name: '' }); // missing required fields

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(422);
    });

    it('rejects end time before start time', async () => {
      const res = await request(app)
        .post('/api/applications')
        .set(headers)
        .send({
          visitor_name: '时间错误',
          phone: '13800138000',
          visitor_count: 1,
          is_driving: false,
          contact_person: '被访人',
          department_id: deptId,
          visit_start_time: '2024-04-01T17:00:00.000Z',
          visit_end_time: '2024-04-01T09:00:00.000Z',
          visit_purpose: '测试',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(422);
    });
  });

  describe('GET /api/applications', () => {
    it('returns my applications', async () => {
      const res = await request(app)
        .get('/api/applications')
        .set(headers);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Application detail and approval flow', () => {
    let appId: string;

    beforeAll(async () => {
      const deptsRes = await request(app).get('/api/departments');
      const deptId = deptsRes.body.data[0].id;

      const createRes = await request(app)
        .post('/api/applications')
        .set(headers)
        .send({
          visitor_name: '审批流程测试',
          phone: '13700137000',
          visitor_count: 1,
          is_driving: false,
          contact_person: '被访人',
          department_id: deptId,
          visit_start_time: '2024-04-02T09:00:00.000Z',
          visit_end_time: '2024-04-02T17:00:00.000Z',
          visit_purpose: '完整流程测试',
        });
      appId = createRes.body.data.id;
    });

    it('GET /api/applications/:id returns detail with pass info', async () => {
      const res = await request(app).get(`/api/applications/${appId}`);
      expect(res.status).toBe(200);
      expect(res.body.data.visitor_name).toBe('审批流程测试');
      expect(res.body.data).toHaveProperty('pass');
    });

    it('GET /api/applications/:id returns 404 for unknown id', async () => {
      const res = await request(app).get('/api/applications/nonexistent');
      expect(res.status).toBe(404);
    });

    it('POST /api/approval/:id/approve approves and creates pass', async () => {
      const res = await request(app)
        .post(`/api/approval/${appId}/approve`)
        .set({ 'X-Session-Id': 'approver-session' });

      expect(res.status).toBe(200);
      expect(res.body.data.approval_status).toBe('approved');

      // 验证通行证已生成
      const passRes = await request(app).get('/api/passes');
      const pass = passRes.body.data.items.find(
        (p: { application_id: string }) => p.application_id === appId
      );
      expect(pass).toBeDefined();
      expect(pass.pass_status).toBe('not_visited');
    });

    it('rejects duplicate approval', async () => {
      const res = await request(app)
        .post(`/api/approval/${appId}/reject`)
        .set({ 'X-Session-Id': 'approver-session' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(422);
    });

    it('GET /api/approval/records/:appId returns approval records', async () => {
      const res = await request(app).get(`/api/approval/records/${appId}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].operation_type).toBe('approve');
    });
  });

  describe('Return and resubmit flow', () => {
    let appId: string;

    beforeAll(async () => {
      const deptsRes = await request(app).get('/api/departments');
      const deptId = deptsRes.body.data[0].id;

      const createRes = await request(app)
        .post('/api/applications')
        .set(headers)
        .send({
          visitor_name: '退回测试',
          phone: '13600136000',
          visitor_count: 1,
          is_driving: false,
          contact_person: '被访人',
          department_id: deptId,
          visit_start_time: '2024-04-03T09:00:00.000Z',
          visit_end_time: '2024-04-03T17:00:00.000Z',
          visit_purpose: '退回流程测试',
        });
      appId = createRes.body.data.id;

      // 退回
      await request(app)
        .post(`/api/approval/${appId}/return`)
        .set({ 'X-Session-Id': 'approver-session' })
        .send({ reason: '信息不完整' });
    });

    it('return requires reason', async () => {
      const deptsRes = await request(app).get('/api/departments');
      const deptId = deptsRes.body.data[0].id;
      const createRes = await request(app)
        .post('/api/applications')
        .set(headers)
        .send({
          visitor_name: '无原因退回',
          phone: '13500135000',
          visitor_count: 1,
          is_driving: false,
          contact_person: '被访人',
          department_id: deptId,
          visit_start_time: '2024-04-04T09:00:00.000Z',
          visit_end_time: '2024-04-04T17:00:00.000Z',
          visit_purpose: '测试',
        });

      const res = await request(app)
        .post(`/api/approval/${createRes.body.data.id}/return`)
        .set({ 'X-Session-Id': 'approver-session' })
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(422);
    });

    it('PUT /api/applications/:id resubmits returned application', async () => {
      const deptsRes = await request(app).get('/api/departments');
      const deptId = deptsRes.body.data[0].id;

      const res = await request(app)
        .put(`/api/applications/${appId}`)
        .set(headers)
        .send({
          visitor_name: '退回测试-已修改',
          phone: '13600136000',
          visitor_count: 2,
          is_driving: false,
          contact_person: '被访人',
          department_id: deptId,
          visit_start_time: '2024-04-03T09:00:00.000Z',
          visit_end_time: '2024-04-03T17:00:00.000Z',
          visit_purpose: '退回流程测试-已补充',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.approval_status).toBe('pending');
      expect(res.body.data.visitor_name).toBe('退回测试-已修改');
    });

    it('rejects resubmit by different session', async () => {
      const res = await request(app)
        .put(`/api/applications/${appId}`)
        .set({ 'X-Session-Id': 'other-person' })
        .send({
          visitor_name: '恶意修改',
          phone: '13600136000',
          visitor_count: 1,
          is_driving: false,
          contact_person: '被访人',
          department_id: 'xxx',
          visit_start_time: '2024-04-03T09:00:00.000Z',
          visit_end_time: '2024-04-03T17:00:00.000Z',
          visit_purpose: '恶意',
        });

      expect(res.status).toBe(403);
    });
  });

  describe('Pass confirm visit', () => {
    let passId: string;

    beforeAll(async () => {
      const deptsRes = await request(app).get('/api/departments');
      const deptId = deptsRes.body.data[0].id;

      const createRes = await request(app)
        .post('/api/applications')
        .set(headers)
        .send({
          visitor_name: '到访确认测试',
          phone: '13400134000',
          visitor_count: 1,
          is_driving: false,
          contact_person: '被访人',
          department_id: deptId,
          visit_start_time: '2024-04-05T09:00:00.000Z',
          visit_end_time: '2024-04-05T17:00:00.000Z',
          visit_purpose: '到访测试',
        });

      await request(app)
        .post(`/api/approval/${createRes.body.data.id}/approve`)
        .set({ 'X-Session-Id': 'approver-session' });

      const passesRes = await request(app).get('/api/passes');
      passId = passesRes.body.data.items.find(
        (p: { application_id: string }) => p.application_id === createRes.body.data.id
      ).id;
    });

    it('confirms visit', async () => {
      const res = await request(app).post(`/api/passes/${passId}/confirm`);
      expect(res.status).toBe(200);
      expect(res.body.data.pass_status).toBe('visited');
    });

    it('rejects duplicate confirm', async () => {
      const res = await request(app).post(`/api/passes/${passId}/confirm`);
      expect(res.status).toBe(400);
    });
  });

  describe('Records query', () => {
    it('GET /api/records with filters', async () => {
      const res = await request(app)
        .get('/api/records')
        .query({ visitor_name: '接口测试' });

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Drafts', () => {
    it('save, get, and delete draft', async () => {
      // Save
      const saveRes = await request(app)
        .post('/api/drafts')
        .set(headers)
        .send({ form_data: { visitor_name: '草稿API测试' } });

      expect(saveRes.status).toBe(200);
      expect(saveRes.body.data.form_data).toBeDefined();

      // Get
      const getRes = await request(app)
        .get('/api/drafts')
        .set(headers);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.form_data.visitor_name).toBe('草稿API测试');

      // Delete
      const deleteRes = await request(app)
        .delete('/api/drafts')
        .set(headers);

      expect(deleteRes.status).toBe(200);

      // Verify deleted
      const notFoundRes = await request(app)
        .get('/api/drafts')
        .set(headers);

      expect(notFoundRes.status).toBe(404);
    });
  });

  describe('Pending approval list', () => {
    it('GET /api/approval/pending returns pending applications', async () => {
      const res = await request(app).get('/api/approval/pending');
      expect(res.status).toBe(200);
      expect(res.body.data.items.every(
        (a: { approval_status: string }) => a.approval_status === 'pending'
      )).toBe(true);
    });
  });
});
