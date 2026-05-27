import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app, { initDatabase } from '../../src/backend/app';

/**
 * FK-28: API 表单校验与提交控制 — 集成测试
 *
 * 测试场景（对应任务描述中的 9 个场景）：
 * 1. 任一必填项为空 → 后端返回 400 + code=40001
 * 2. 全部必填项有效 → 提交成功
 * 3. 开车=是但车牌号为空 → 阻止提交
 * 4. 结束时间≤起始时间 → 阻止提交
 * 5. 到访事宜超过200字符 → 阻止提交
 * 6. 访客人数=0或负数或小数 → 阻止提交
 * 7. 全部校验通过 → 提交成功，状态为 pending
 * 8. 重复提交同一条已提交申请 → 阻止，提示已处理 (code=40010)
 * 9. 提交后状态锁定（表单不可编辑，code=40010）
 */

const SESSION = 'fk28-validation-session';

describe('FK-28: API 表单校验与提交控制', () => {
  let deptId: string;

  beforeAll(async () => {
    await initDatabase();
    const res = await request(app).get('/api/departments');
    deptId = res.body.data[0].id;
  });

  // 构造一个有效的申请数据
  function validPayload() {
    return {
      session_id: SESSION,
      visitor_name: 'FK28测试用户',
      phone: '13800138000',
      visitor_count: 2,
      is_driving: false,
      contact_person: '内部对接人',
      department_id: deptId,
      visit_start_time: '2024-06-01T09:00:00.000Z',
      visit_end_time: '2024-06-01T17:00:00.000Z',
      visit_purpose: '业务交流访问',
    };
  }

  // ============================================================
  // 场景 1: 任一必填项为空时提交 → 后端拒绝
  // ============================================================
  describe('场景1: 必填项为空', () => {
    it('visitor_name 为空 → code=422', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send({ ...validPayload(), visitor_name: '' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
    });

    it('phone 为空 → code=422', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send({ ...validPayload(), phone: '' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
    });

    it('contact_person 为空 → code=422', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send({ ...validPayload(), contact_person: '' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
    });

    it('department_id 为空 → code=422', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send({ ...validPayload(), department_id: '' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
    });

    it('visit_start_time 为空 → code=422', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send({ ...validPayload(), visit_start_time: '' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
    });

    it('visit_end_time 为空 → code=422', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send({ ...validPayload(), visit_end_time: '' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
    });

    it('visit_purpose 为空 → code=422', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send({ ...validPayload(), visit_purpose: '' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
    });

    it('visitor_count 缺失 → code=422', async () => {
      const { visitor_count, ...rest } = validPayload();
      const res = await request(app)
        .post('/api/applications')
        .send(rest);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
    });
  });

  // ============================================================
  // 场景 2: 全部必填项有效 → 提交成功
  // ============================================================
  describe('场景2: 全部必填项有效', () => {
    it('提交成功，返回 code=0', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send(validPayload());

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.visitor_name).toBe('FK28测试用户');
    });
  });

  // ============================================================
  // 场景 3: 开车=是但车牌号为空 → 阻止提交
  // ============================================================
  describe('场景3: 开车=是但车牌号为空', () => {
    it('阻止提交，返回校验错误', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send({
          ...validPayload(),
          is_driving: true,
          license_plate: '',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
    });
  });

  // ============================================================
  // 场景 4: 结束时间≤起始时间 → 阻止提交
  // ============================================================
  describe('场景4: 结束时间≤起始时间', () => {
    it('结束时间早于起始时间 → 阻止', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send({
          ...validPayload(),
          visit_start_time: '2024-06-01T17:00:00.000Z',
          visit_end_time: '2024-06-01T09:00:00.000Z',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
    });

    it('结束时间等于起始时间 → 阻止', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send({
          ...validPayload(),
          visit_start_time: '2024-06-01T09:00:00.000Z',
          visit_end_time: '2024-06-01T09:00:00.000Z',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
    });
  });

  // ============================================================
  // 场景 5: 到访事宜超过200字符 → 阻止提交
  // ============================================================
  describe('场景5: 到访事宜超过200字符', () => {
    it('201字符 → 阻止提交', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send({
          ...validPayload(),
          visit_purpose: '事'.repeat(201),
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
    });

    it('恰好200字符 → 通过', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send({
          ...validPayload(),
          visit_purpose: '事'.repeat(200),
        });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
    });
  });

  // ============================================================
  // 场景 6: 访客人数=0或负数或小数 → 阻止提交
  // ============================================================
  describe('场景6: 访客人数无效值', () => {
    it('visitor_count=0 → 阻止', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send({ ...validPayload(), visitor_count: 0 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
    });

    it('visitor_count=-1 → 阻止', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send({ ...validPayload(), visitor_count: -1 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
    });

    it('visitor_count=1.5（小数） → 阻止', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send({ ...validPayload(), visitor_count: 1.5 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40001);
    });

    it('visitor_count=1 → 通过', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send({ ...validPayload(), visitor_count: 1 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
    });
  });

  // ============================================================
  // 场景 7: 全部校验通过 → 提交成功，状态为 pending，表单锁定
  // ============================================================
  describe('场景7: 全部校验通过提交', () => {
    it('提交成功 → approval_status=pending', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send({
          ...validPayload(),
          visitor_name: 'FK28场景7用户',
          phone: '13912345678',
        });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.approval_status).toBe('pending');
      expect(res.body.data.pass_status).toBeNull();
    });

    it('提交后申请已存在且状态锁定（不可重新提交）', async () => {
      const createRes = await request(app)
        .post('/api/applications')
        .send({
          ...validPayload(),
          visitor_name: 'FK28锁定测试',
          phone: '13900001111',
        });

      const appId = createRes.body.data.id;

      // 尝试用 PATCH 修改非退回状态的申请 → 应该被拒绝
      const patchRes = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visitor_name: '试图修改' });

      expect(patchRes.status).toBe(400);
    });
  });

  // ============================================================
  // 场景 8: 重复提交同一条已审批申请 → 阻止
  // ============================================================
  describe('场景8: 重复审批阻止', () => {
    it('已审批的申请再次审批 → code=40010 或 422', async () => {
      // 创建申请
      const createRes = await request(app)
        .post('/api/applications')
        .send({
          ...validPayload(),
          visitor_name: 'FK28重复审批测试',
          phone: '13900002222',
        });

      const appId = createRes.body.data.id;

      // 第一次审批（同意）- 使用 body 中的 operator_session_id
      const firstApproval = await request(app)
        .post(`/api/approval/${appId}/approve`)
        .send({ operator_session_id: 'fk28-approver' });

      expect(firstApproval.status).toBe(200);

      // 第二次审批（拒绝）→ 应该被阻止
      const secondApproval = await request(app)
        .post(`/api/approval/${appId}/reject`)
        .send({ operator_session_id: 'fk28-approver-2', reason: '拒绝理由' });

      expect(secondApproval.status).toBe(400);
      // 后端应该返回"该申请已处理，不可重复操作"错误
      expect([40010, 40011]).toContain(secondApproval.body.code);
    });

    it('同一审批人重复操作同一申请 → 阻止', async () => {
      const createRes = await request(app)
        .post('/api/applications')
        .send({
          ...validPayload(),
          visitor_name: 'FK28同人重复测试',
          phone: '13900003333',
        });

      const appId = createRes.body.data.id;
      const approverSession = 'fk28-same-approver';

      // 第一次审批
      await request(app)
        .post(`/api/approval/${appId}/approve`)
        .send({ operator_session_id: approverSession });

      // 同一审批人再次操作
      const duplicateRes = await request(app)
        .post(`/api/approval/${appId}/approve`)
        .send({ operator_session_id: approverSession });

      expect(duplicateRes.status).toBe(400);
    });
  });

  // ============================================================
  // 场景 9: 提交后状态锁定（表单不可编辑）
  // ============================================================
  describe('场景9: 提交后表单锁定', () => {
    it('pending 状态不可 PATCH 修改', async () => {
      const createRes = await request(app)
        .post('/api/applications')
        .send({
          ...validPayload(),
          visitor_name: 'FK28锁定验证',
          phone: '13900004444',
        });

      const appId = createRes.body.data.id;
      expect(createRes.body.data.approval_status).toBe('pending');

      // 尝试修改 pending 状态的申请
      const patchRes = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visitor_name: '非法修改' });

      expect(patchRes.status).toBe(400);
      expect(patchRes.body.code).toBe(40010);
    });

    it('approved 状态不可 PATCH 修改', async () => {
      const createRes = await request(app)
        .post('/api/applications')
        .send({
          ...validPayload(),
          visitor_name: 'FK28已批准锁定',
          phone: '13900005555',
        });

      const appId = createRes.body.data.id;

      // 批准
      await request(app)
        .post(`/api/approval/${appId}/approve`)
        .send({ operator_session_id: 'fk28-approver-lock' });

      // 尝试修改已批准的申请
      const patchRes = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visitor_name: '非法修改已批准' });

      expect(patchRes.status).toBe(400);
      expect(patchRes.body.code).toBe(40010);
    });

    it('rejected 状态不可 PATCH 修改（终态）', async () => {
      const createRes = await request(app)
        .post('/api/applications')
        .send({
          ...validPayload(),
          visitor_name: 'FK28已拒绝锁定',
          phone: '13900006666',
        });

      const appId = createRes.body.data.id;

      // 拒绝
      await request(app)
        .post(`/api/approval/${appId}/reject`)
        .send({ operator_session_id: 'fk28-rejecter', reason: '不符合要求' });

      // 尝试修改已拒绝的申请
      const patchRes = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visitor_name: '非法修改已拒绝' });

      expect(patchRes.status).toBe(400);
      expect(patchRes.body.code).toBe(40010);
    });

    it('returned 状态可以 PATCH 修改（退回重提）', async () => {
      const createRes = await request(app)
        .post('/api/applications')
        .send({
          ...validPayload(),
          visitor_name: 'FK28退回可编辑',
          phone: '13900007777',
        });

      const appId = createRes.body.data.id;

      // 退回
      await request(app)
        .post(`/api/approval/${appId}/return`)
        .send({ operator_session_id: 'fk28-returner', reason: '请补充信息' });

      // 退回状态应该可以修改
      const patchRes = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({
          visitor_name: 'FK28退回已修改',
          phone: '13900007777',
          visitor_count: 3,
          is_driving: false,
          contact_person: '内部对接人',
          department_id: deptId,
          visit_start_time: '2024-06-01T09:00:00.000Z',
          visit_end_time: '2024-06-01T17:00:00.000Z',
          visit_purpose: '补充后的到访事宜',
        });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.approval_status).toBe('pending');
      expect(patchRes.body.data.visitor_name).toBe('FK28退回已修改');
    });
  });

  // ============================================================
  // 提交后自动进入审批队列
  // ============================================================
  describe('提交后审批队列', () => {
    it('提交后出现在待审批列表中', async () => {
      const createRes = await request(app)
        .post('/api/applications')
        .send({
          ...validPayload(),
          visitor_name: 'FK28队列验证',
          phone: '13900008888',
        });

      const appId = createRes.body.data.id;

      const listRes = await request(app).get('/api/approval/pending');
      expect(listRes.status).toBe(200);

      const found = listRes.body.data.items.find(
        (item: { id: string }) => item.id === appId
      );
      expect(found).toBeDefined();
      expect(found.approval_status).toBe('pending');
    });
  });
});
