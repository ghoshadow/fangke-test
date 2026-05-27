import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app, { initDatabase } from '../../src/backend/app';

const SESSION_ID = 'fk40-return-trace-session';

interface ApplicationData {
  id: string;
  visitor_name: string;
  phone: string;
  approval_status: string;
  pass_status: string | null;
  version: number;
}

interface ApprovalRecordData {
  id: string;
  application_id: string;
  operation_type: string;
  reason: string | null;
  operator_session_id: string;
  operated_at: string;
}

/** 创建标准测试申请的辅助函数 */
async function createApplication(overrides: Partial<Record<string, unknown>> = {}) {
  const deptsRes = await request(app).get('/api/departments');
  const deptId = deptsRes.body.data[0].id;

  const res = await request(app)
    .post('/api/applications')
    .send({
      visitor_name: '追溯测试访客',
      phone: '13800000099',
      visitor_count: 1,
      is_driving: false,
      contact_person: '对接人',
      department_id: deptId,
      visit_start_time: '2024-07-01T09:00:00.000Z',
      visit_end_time: '2024-07-01T17:00:00.000Z',
      visit_purpose: '退回追溯测试',
      session_id: SESSION_ID,
      ...overrides,
    });

  return res;
}

describe('退回重提记录追溯 (FK-40)', () => {
  let deptId: string;

  beforeAll(async () => {
    await initDatabase();
    const deptsRes = await request(app).get('/api/departments');
    deptId = deptsRes.body.data[0].id;
  });

  // ==========================================================
  // 场景 1：审批状态筛选=已退回
  // ==========================================================
  describe('场景1: 审批状态筛选=已退回', () => {
    let returnedAppId: string;
    let pendingAppId: string;
    let approvedAppId: string;
    const approver = 'fk40-scene1-approver';
    const approver2 = 'fk40-scene1-approver2';

    beforeAll(async () => {
      // 创建「已退回」申请
      const returnedRes = await createApplication({
        visitor_name: '已退回筛选访客',
        phone: '13800010001',
        visit_purpose: '已退回筛选测试',
      });
      returnedAppId = returnedRes.body.data.id;
      await request(app)
        .post(`/api/approvals/${returnedAppId}/return`)
        .send({ operator_session_id: approver, reason: '信息不完整需补充' });

      // 创建「待审批」申请
      const pendingRes = await createApplication({
        visitor_name: '待审批筛选访客',
        phone: '13800010002',
        visit_purpose: '待审批筛选测试',
      });
      pendingAppId = pendingRes.body.data.id;

      // 创建并审批通过「已同意」申请
      const approvedRes = await createApplication({
        visitor_name: '已同意筛选访客',
        phone: '13800010003',
        visit_purpose: '已同意筛选测试',
      });
      approvedAppId = approvedRes.body.data.id;
      await request(app)
        .post(`/api/approvals/${approvedAppId}/approve`)
        .send({ operator_session_id: approver2 });
    });

    it('GET /api/records?approval_status=returned 只展示已退回记录', async () => {
      const res = await request(app)
        .get('/api/records')
        .query({ approval_status: 'returned' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);

      const items: ApplicationData[] = res.body.data.items;
      expect(items.length).toBeGreaterThanOrEqual(1);

      // 所有返回记录的审批状态都是 returned
      for (const item of items) {
        expect(item.approval_status).toBe('returned');
      }

      // 已退回的申请出现在结果中
      const ids = items.map((i) => i.id);
      expect(ids).toContain(returnedAppId);

      // 待审批和已同意的申请不应出现
      expect(ids).not.toContain(pendingAppId);
      expect(ids).not.toContain(approvedAppId);
    });

    it('筛选结果支持分页', async () => {
      const res = await request(app)
        .get('/api/records')
        .query({ approval_status: 'returned', page: 1, page_size: 10 });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('items');
      expect(res.body.data).toHaveProperty('total');
      expect(res.body.data).toHaveProperty('page', 1);
      expect(res.body.data).toHaveProperty('page_size', 10);
    });
  });

  // ==========================================================
  // 场景 2：查看退回原因
  // ==========================================================
  describe('场景2: 查看退回原因', () => {
    let returnedAppId: string;
    const RETURN_REASON = '访客身份证号码填写有误，请核实后重新提交';
    const approver = 'fk40-scene2-approver';

    beforeAll(async () => {
      const res = await createApplication({
        visitor_name: '退回原因查看访客',
        phone: '13800020001',
        visit_purpose: '退回原因查看测试',
      });
      returnedAppId = res.body.data.id;

      await request(app)
        .post(`/api/approvals/${returnedAppId}/return`)
        .send({ operator_session_id: approver, reason: RETURN_REASON });
    });

    it('GET /api/records/:id 返回包含退回原因的审批记录', async () => {
      const res = await request(app).get(`/api/records/${returnedAppId}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data).toHaveProperty('approval_records');

      const records: ApprovalRecordData[] = res.body.data.approval_records;
      expect(records.length).toBeGreaterThanOrEqual(1);

      const returnRecord = records.find((r) => r.operation_type === 'return');
      expect(returnRecord).toBeDefined();
      expect(returnRecord!.reason).toBe(RETURN_REASON);
      expect(returnRecord!.operator_session_id).toBe(approver);
    });

    it('GET /api/applications/:id/return-reason 直接获取退回原因', async () => {
      const res = await request(app).get(`/api/applications/${returnedAppId}/return-reason`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.reason).toBe(RETURN_REASON);
    });

    it('退回原因在审批记录中不可篡改（只写不改）', async () => {
      // 审批记录只能新增，不能修改 — 通过查找记录确认退回原因与最初写入时一致
      const res = await request(app).get(`/api/records/${returnedAppId}`);
      const records: ApprovalRecordData[] = res.body.data.approval_records;

      const returnRecord = records.find((r) => r.operation_type === 'return');
      expect(returnRecord).toBeDefined();
      // 退回原因完整保留，未被截断或修改
      expect(returnRecord!.reason).toBe(RETURN_REASON);
      // 审批记录 ID 存在且不可变
      expect(returnRecord!.id).toBeDefined();
    });
  });

  // ==========================================================
  // 场景 3：已退回 → 已重提 → 已同意（完整生命周期可追溯）
  // ==========================================================
  describe('场景3: 已退回→已重提→已同意', () => {
    let appId: string;
    const returnApprover = 'fk40-scene3-returner';
    const approveApprover = 'fk40-scene3-approver';

    beforeAll(async () => {
      // 第一步：创建申请
      const res = await createApplication({
        visitor_name: '退回重提同意访客',
        phone: '13800030001',
        visit_purpose: '退回重提同意测试',
      });
      appId = res.body.data.id;

      // 第二步：退回申请（由 returnApprover 执行）
      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: returnApprover, reason: '联系电话需补充区号' });

      // 第三步：退回后重提（PATCH 更新）
      await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visit_purpose: '退回重提同意测试-已补充信息' });

      // 第四步：审批同意（由不同的 approveApprover 执行，避免防重复拦截）
      await request(app)
        .post(`/api/approvals/${appId}/approve`)
        .send({ operator_session_id: approveApprover });
    });

    it('最终状态为 approved', async () => {
      const res = await request(app).get(`/api/applications/${appId}`);
      expect(res.body.data.approval_status).toBe('approved');
    });

    it('完整生命周期可追溯：审批记录包含 return 和 approve 两条操作', async () => {
      const res = await request(app).get(`/api/records/${appId}`);
      const records: ApprovalRecordData[] = res.body.data.approval_records;

      // 有 return + approve 两条记录
      expect(records.length).toBeGreaterThanOrEqual(2);

      const returnRecord = records.find((r) => r.operation_type === 'return');
      const approveRecord = records.find((r) => r.operation_type === 'approve');

      expect(returnRecord).toBeDefined();
      expect(returnRecord!.reason).toBe('联系电话需补充区号');
      expect(returnRecord!.operator_session_id).toBe(returnApprover);

      expect(approveRecord).toBeDefined();
      expect(approveRecord!.operator_session_id).toBe(approveApprover);
    });

    it('审批记录按时间顺序排列，return 在 approve 之前', async () => {
      const res = await request(app).get(`/api/records/${appId}`);
      const records: ApprovalRecordData[] = res.body.data.approval_records;

      const returnIndex = records.findIndex((r) => r.operation_type === 'return');
      const approveIndex = records.findIndex((r) => r.operation_type === 'approve');

      expect(returnIndex).toBeGreaterThanOrEqual(0);
      expect(approveIndex).toBeGreaterThanOrEqual(0);
      expect(returnIndex).toBeLessThan(approveIndex);
    });

    it('审批通过后通行证已生成', async () => {
      const res = await request(app).get(`/api/records/${appId}`);
      expect(res.body.data.pass).not.toBeNull();
      expect(res.body.data.pass).toBeDefined();
      expect(res.body.data.pass.pass_status).toBe('not_visited');
    });

    it('申请详情中审批状态正确反映最终状态', async () => {
      const res = await request(app).get(`/api/applications/${appId}`);
      expect(res.body.data.approval_status).toBe('approved');
      expect(res.body.data.pass_status).toBe('not_visited');
    });
  });

  // ==========================================================
  // 场景 4：已退回 → 已重提 → 已拒绝（终态）
  // ==========================================================
  describe('场景4: 已退回→已重提→已拒绝', () => {
    let appId: string;
    const returnApprover = 'fk40-scene4-returner';
    const rejectApprover = 'fk40-scene4-rejecter';

    beforeAll(async () => {
      // 第一步：创建申请
      const res = await createApplication({
        visitor_name: '退回重提拒绝访客',
        phone: '13800040001',
        visit_purpose: '退回重提拒绝测试',
      });
      appId = res.body.data.id;

      // 第二步：退回申请
      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: returnApprover, reason: '来访目的不明确' });

      // 第三步：重提
      await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visit_purpose: '退回重提拒绝测试-已修改目的' });

      // 第四步：拒绝（由不同审批人执行）
      await request(app)
        .post(`/api/approvals/${appId}/reject`)
        .send({ operator_session_id: rejectApprover, reason: '修改后仍不符合入校条件' });
    });

    it('最终状态为 rejected（终态）', async () => {
      const res = await request(app).get(`/api/applications/${appId}`);
      expect(res.body.data.approval_status).toBe('rejected');
    });

    it('追溯链完整：审批记录包含 return 和 reject 操作', async () => {
      const res = await request(app).get(`/api/records/${appId}`);
      const records: ApprovalRecordData[] = res.body.data.approval_records;

      expect(records.length).toBeGreaterThanOrEqual(2);

      const returnRecord = records.find((r) => r.operation_type === 'return');
      const rejectRecord = records.find((r) => r.operation_type === 'reject');

      expect(returnRecord).toBeDefined();
      expect(returnRecord!.reason).toBe('来访目的不明确');
      expect(returnRecord!.operator_session_id).toBe(returnApprover);

      expect(rejectRecord).toBeDefined();
      expect(rejectRecord!.reason).toBe('修改后仍不符合入校条件');
      expect(rejectRecord!.operator_session_id).toBe(rejectApprover);
    });

    it('已拒绝为终态，不可再操作（重复操作被拒绝）', async () => {
      // 尝试同意已拒绝的申请
      const res = await request(app)
        .post(`/api/approvals/${appId}/approve`)
        .send({ operator_session_id: 'fk40-scene4-other-approver' });

      expect(res.status).toBe(400);
      // 40010 = 申请已处理不可重复操作
      expect(res.body.code).toBe(40010);
    });

    it('已拒绝后不可再重提', async () => {
      const res = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visit_purpose: '尝试再次修改' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40010);
    });

    it('已拒绝后不可再退回', async () => {
      const res = await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: 'fk40-scene4-another-approver', reason: '再次退回' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40010);
    });
  });

  // ==========================================================
  // 场景 5：已退回但未重提（状态保留为已退回）
  // ==========================================================
  describe('场景5: 已退回但未重提', () => {
    let appId: string;
    const RETURN_REASON = '访客人数与实际不符，请核实';
    const approver = 'fk40-scene5-approver';

    beforeAll(async () => {
      // 创建并退回，但不重提
      const res = await createApplication({
        visitor_name: '退回未重提访客',
        phone: '13800050001',
        visit_purpose: '退回未重提测试',
      });
      appId = res.body.data.id;

      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: approver, reason: RETURN_REASON });
    });

    it('申请状态保持为 returned', async () => {
      const res = await request(app).get(`/api/applications/${appId}`);
      expect(res.body.data.approval_status).toBe('returned');
    });

    it('作为终态保留在记录查询中', async () => {
      const res = await request(app)
        .get('/api/records')
        .query({ approval_status: 'returned' });

      const items: ApplicationData[] = res.body.data.items;
      const found = items.find((i) => i.id === appId);
      expect(found).toBeDefined();
      expect(found!.approval_status).toBe('returned');
    });

    it('退回原因在记录详情中完整保留', async () => {
      const res = await request(app).get(`/api/records/${appId}`);
      const records: ApprovalRecordData[] = res.body.data.approval_records;

      const returnRecord = records.find((r) => r.operation_type === 'return');
      expect(returnRecord).toBeDefined();
      expect(returnRecord!.reason).toBe(RETURN_REASON);
    });

    it('未生成通行证（未审批通过）', async () => {
      const res = await request(app).get(`/api/records/${appId}`);
      expect(res.body.data.pass).toBeNull();
    });
  });

  // ==========================================================
  // 场景 6：多次退回重提
  // ==========================================================
  describe('场景6: 多次退回重提', () => {
    let appId: string;
    const FIRST_RETURN_REASON = '第一次退回：访客身份证号码有误';
    const SECOND_RETURN_REASON = '第二次退回：来访事由描述不清晰';
    const THIRD_RETURN_REASON = '第三次退回：对接人信息需确认';
    // 每次退回需要不同的审批人（防重复机制：同一 session 不可重复审批同一申请）
    const returner1 = 'fk40-scene6-returner1';
    const returner2 = 'fk40-scene6-returner2';
    const returner3 = 'fk40-scene6-returner3';
    const finalApprover = 'fk40-scene6-approver';

    beforeAll(async () => {
      // 创建申请
      const res = await createApplication({
        visitor_name: '多次退回访客',
        phone: '13800060001',
        visit_purpose: '多次退回测试',
      });
      appId = res.body.data.id;

      // 第一次退回
      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: returner1, reason: FIRST_RETURN_REASON });

      // 第一次重提
      await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visit_purpose: '多次退回测试-第一次修改' });

      // 第二次退回（不同审批人）
      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: returner2, reason: SECOND_RETURN_REASON });

      // 第二次重提
      await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visit_purpose: '多次退回测试-第二次修改' });

      // 第三次退回（不同审批人）
      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: returner3, reason: THIRD_RETURN_REASON });
    });

    it('每次退回原因独立留存，互不覆盖', async () => {
      const res = await request(app).get(`/api/records/${appId}`);
      const records: ApprovalRecordData[] = res.body.data.approval_records;

      const returnRecords = records.filter((r) => r.operation_type === 'return');
      expect(returnRecords.length).toBe(3);

      // 三次退回原因各不相同，且独立保存
      const reasons = returnRecords.map((r) => r.reason);
      expect(reasons).toContain(FIRST_RETURN_REASON);
      expect(reasons).toContain(SECOND_RETURN_REASON);
      expect(reasons).toContain(THIRD_RETURN_REASON);
    });

    it('审批记录完整记录所有操作，按时间顺序排列', async () => {
      const res = await request(app).get(`/api/records/${appId}`);
      const records: ApprovalRecordData[] = res.body.data.approval_records;

      // 3 次退回操作，共 3 条审批记录（重提操作不写审批记录）
      const returnRecords = records.filter((r) => r.operation_type === 'return');
      expect(returnRecords.length).toBe(3);

      // 验证时间顺序：每条记录时间不晚于下一条
      for (let i = 0; i < records.length - 1; i++) {
        expect(records[i].operated_at <= records[i + 1].operated_at).toBe(true);
      }
    });

    it('每次退回操作由不同审批人执行，操作人信息独立记录', async () => {
      const res = await request(app).get(`/api/records/${appId}`);
      const records: ApprovalRecordData[] = res.body.data.approval_records;

      const returnRecords = records.filter((r) => r.operation_type === 'return');
      const operators = returnRecords.map((r) => r.operator_session_id);
      expect(operators).toContain(returner1);
      expect(operators).toContain(returner2);
      expect(operators).toContain(returner3);
    });

    it('当前状态为已退回（第三次退回后）', async () => {
      const res = await request(app).get(`/api/applications/${appId}`);
      expect(res.body.data.approval_status).toBe('returned');
    });

    it('多次退回后仍可重提并最终审批通过，追溯链完整', async () => {
      // 第三次重提
      await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visit_purpose: '多次退回测试-第三次修改-最终版' });

      // 审批通过（使用未参与过该申请的审批人）
      await request(app)
        .post(`/api/approvals/${appId}/approve`)
        .send({ operator_session_id: finalApprover });

      // 验证最终状态
      const appRes = await request(app).get(`/api/applications/${appId}`);
      expect(appRes.body.data.approval_status).toBe('approved');

      // 验证追溯链：3 次 return + 1 次 approve = 4 条审批记录
      const recordsRes = await request(app).get(`/api/records/${appId}`);
      const records: ApprovalRecordData[] = recordsRes.body.data.approval_records;

      const returnRecords = records.filter((r) => r.operation_type === 'return');
      const approveRecords = records.filter((r) => r.operation_type === 'approve');

      expect(returnRecords.length).toBe(3);
      expect(approveRecords.length).toBe(1);

      // 审批通过记录在最后
      const lastRecord = records[records.length - 1];
      expect(lastRecord.operation_type).toBe('approve');
      expect(lastRecord.operator_session_id).toBe(finalApprover);
    });
  });

  // ==========================================================
  // 场景 7：退回原因不可修改（审批记录只写不删不改）
  // ==========================================================
  describe('场景7: 退回原因不可修改', () => {
    let appId: string;
    const ORIGINAL_REASON = '原始退回原因：资料不齐全';
    const NEW_REASON = '第二次退回：照片不清晰';
    const returner1 = 'fk40-scene7-returner1';
    const returner2 = 'fk40-scene7-returner2';

    beforeAll(async () => {
      const res = await createApplication({
        visitor_name: '退回原因只读访客',
        phone: '13800070001',
        visit_purpose: '退回原因只读测试',
      });
      appId = res.body.data.id;

      // 第一次退回
      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: returner1, reason: ORIGINAL_REASON });

      // 重提
      await request(app)
        .patch(`/api/applications/${appId}`)
        .send({ visit_purpose: '退回原因只读测试-已修改' });

      // 第二次退回（不同审批人）
      await request(app)
        .post(`/api/approvals/${appId}/return`)
        .send({ operator_session_id: returner2, reason: NEW_REASON });
    });

    it('详情页退回原因为只读，与提交时完全一致', async () => {
      const res = await request(app).get(`/api/records/${appId}`);
      const records: ApprovalRecordData[] = res.body.data.approval_records;

      const firstReturn = records.find(
        (r) => r.operation_type === 'return' && r.operator_session_id === returner1,
      );
      expect(firstReturn).toBeDefined();
      // 第一次退回原因与创建时完全一致，未被修改
      expect(firstReturn!.reason).toBe(ORIGINAL_REASON);
    });

    it('再次退回时产生新的退回记录，不影响历史退回原因', async () => {
      const res = await request(app).get(`/api/records/${appId}`);
      const records: ApprovalRecordData[] = res.body.data.approval_records;

      const returnRecords = records.filter((r) => r.operation_type === 'return');
      expect(returnRecords.length).toBe(2);

      // 第一次退回原因仍然完整保留
      expect(returnRecords[0].reason).toBe(ORIGINAL_REASON);
      expect(returnRecords[0].operator_session_id).toBe(returner1);
      // 第二次退回原因独立保存
      expect(returnRecords[1].reason).toBe(NEW_REASON);
      expect(returnRecords[1].operator_session_id).toBe(returner2);
    });

    it('审批记录表不提供 UPDATE/DELETE 接口（只写不改）', async () => {
      // 验证：审批记录模型不暴露 update/delete 方法
      const approvalRecordModule = await import('../../src/backend/models/approval-record');
      const ApprovalRecordModel = approvalRecordModule.ApprovalRecordModel;

      // 审批记录模型只提供 create、findByApplicationId、existsByApplicationAndSession
      // 不提供 update、delete 等修改方法
      expect((ApprovalRecordModel as Record<string, unknown>).update).toBeUndefined();
      expect((ApprovalRecordModel as Record<string, unknown>).delete).toBeUndefined();
      expect((ApprovalRecordModel as Record<string, unknown>).deleteByApplicationId).toBeUndefined();
    });
  });
});
