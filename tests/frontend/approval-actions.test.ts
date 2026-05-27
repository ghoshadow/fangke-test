import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app, { initDatabase } from '../../src/backend/app';

// ============================================================
// FK-42: 前端审批操作行为测试 (US013-US015 + US017)
// 验证前端审批操作所依赖的 API 契约
// 共 12 个测试用例
// ============================================================

const SUBMITTER = 'fk42-actions-submitter';
const APPROVER = 'fk42-actions-approver';

let deptId: string;

// US013 - 同意操作
let approveNormal: string;     // #10 正常同意
let approveDuplicate: string;  // #11 重复同意
let approvePassFields: string; // #12 通行证字段完整
let approvePassStatus: string; // #13 通行状态初始化

// US014 - 退回操作
let returnNormal: string;    // #14 正常退回
let returnEmpty: string;     // #15 退回原因为空
let returnLong: string;      // #16 退回原因超长
let returnDuplicate: string; // #17 重复退回

// US015 - 拒绝操作
let rejectNormal: string;    // #18 正常拒绝
let rejectEmpty: string;     // #19 拒绝原因为空
let rejectLong: string;      // #20 拒绝原因超长
let rejectDuplicate: string; // #21 重复拒绝

/** 快速创建申请 */
async function createApp(visitorName: string, phone: string, extra?: Record<string, unknown>) {
  const res = await request(app)
    .post('/api/applications')
    .send({
      session_id: SUBMITTER,
      visitor_name: visitorName,
      phone,
      visitor_count: 2,
      is_driving: false,
      contact_person: '对接人',
      department_id: deptId,
      visit_start_time: '2025-06-15T09:00:00.000Z',
      visit_end_time: '2025-06-15T17:00:00.000Z',
      visit_purpose: 'US013-US015测试',
      ...extra,
    });
  expect(res.body.code).toBe(0);
  return res.body.data.id as string;
}

describe('FK-42 前端审批操作测试 (US013-US015 + US017)', () => {
  beforeAll(async () => {
    await initDatabase();

    const deptsRes = await request(app).get('/api/departments');
    deptId = deptsRes.body.data[0].id;

    // 创建所有测试用申请
    approveNormal = await createApp('同意正常访客', '13800010001');
    approveDuplicate = await createApp('同意重复访客', '13800010002');
    approvePassFields = await createApp('通行证全字段', '13800010003', {
      id_card: '110101199001011234',
      company: '全字段测试公司',
      visitor_count: 5,
      is_driving: true,
      license_plate: '京B88888',
    });
    approvePassStatus = await createApp('通行状态校验', '13800010004');

    returnNormal = await createApp('退回正常访客', '13800020001');
    returnEmpty = await createApp('退回空原因', '13800020002');
    returnLong = await createApp('退回超长原因', '13800020003');
    returnDuplicate = await createApp('退回重复访客', '13800020004');

    rejectNormal = await createApp('拒绝正常访客', '13800030001');
    rejectEmpty = await createApp('拒绝空原因', '13800030002');
    rejectLong = await createApp('拒绝超长原因', '13800030003');
    rejectDuplicate = await createApp('拒绝重复访客', '13800030004');
  });

  // ============================================================
  // US013: 同意操作
  // ============================================================
  describe('US013: 同意操作', () => {
    // #10 正常流程：同意申请并自动生成通行证
    it('#10 同意后状态变 approved，自动生成通行证（含完整字段，通行状态=not_visited），列表刷新', async () => {
      const res = await request(app)
        .post(`/api/approvals/${approveNormal}/approve`)
        .send({ operator_session_id: APPROVER });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);

      // 申请状态更新
      const appData = res.body.data.application;
      expect(appData.approval_status).toBe('approved');

      // 通行证自动生成
      const pass = res.body.data.pass;
      expect(pass).toBeDefined();
      expect(pass.application_id).toBe(approveNormal);
      expect(pass.pass_status).toBe('not_visited');

      // 通行证含完整字段（通过通行证详情验证）
      const passDetailRes = await request(app).get(`/api/passes/${pass.id}`);
      expect(passDetailRes.body.code).toBe(0);
      const passApp = passDetailRes.body.data.application;
      expect(passApp.visitor_name).toBe('同意正常访客');
      expect(passApp.phone).toBe('13800010001');

      // 验证申请状态已持久化
      const detailRes = await request(app).get(`/api/applications/${approveNormal}`);
      expect(detailRes.body.data.approval_status).toBe('approved');
      expect(detailRes.body.data.pass_status).toBe('not_visited');
    });

    // #11 无效场景：重复同意已处理申请
    it('#11 对已同意申请再次同意，系统阻止并提示"该申请已处理，不可重复操作"', async () => {
      // 先同意
      await request(app)
        .post(`/api/approvals/${approveDuplicate}/approve`)
        .send({ operator_session_id: APPROVER });

      // 再次同意（同一操作人）
      const res = await request(app)
        .post(`/api/approvals/${approveDuplicate}/approve`)
        .send({ operator_session_id: APPROVER });

      expect(res.status).toBe(400);
      expect([40010, 40011]).toContain(res.body.code);
      expect(res.body.msg).toContain('不可重复操作');
    });

    // #12 无效场景：通行证生成失败或字段缺失
    it('#12 同意后通行证包含所有关键字段（application_id, pass_status, created_at）', async () => {
      const res = await request(app)
        .post(`/api/approvals/${approvePassFields}/approve`)
        .send({ operator_session_id: APPROVER });

      expect(res.body.code).toBe(0);
      const pass = res.body.data.pass;

      // 通行证核心字段完整
      expect(pass.id).toBeTruthy();
      expect(pass.application_id).toBe(approvePassFields);
      expect(pass.pass_status).toBeDefined();
      expect(pass.created_at).toBeTruthy();

      // 通行证关联的申请包含全字段
      const passDetailRes = await request(app).get(`/api/passes/${pass.id}`);
      const appInfo = passDetailRes.body.data.application;
      expect(appInfo.visitor_name).toBe('通行证全字段');
      expect(appInfo.phone).toBe('13800010003');
      expect(appInfo.id_card).toBe('110101199001011234');
      expect(appInfo.visitor_count).toBe(5);
      expect(appInfo.is_driving).toBe(true);
      expect(appInfo.license_plate).toBe('京B88888');
      expect(appInfo.contact_person).toBe('对接人');
      expect(appInfo.department_id).toBe(deptId);
    });

    // #13 无效场景：通行状态初始化错误
    it('#13 同意后通行证 pass_status 严格初始化为 not_visited', async () => {
      const res = await request(app)
        .post(`/api/approvals/${approvePassStatus}/approve`)
        .send({ operator_session_id: APPROVER });

      expect(res.body.code).toBe(0);
      const pass = res.body.data.pass;

      // 通行状态必须是 not_visited
      expect(pass.pass_status).toBe('not_visited');

      // 申请的 pass_status 也必须是 not_visited
      const appDetail = await request(app).get(`/api/applications/${approvePassStatus}`);
      expect(appDetail.body.data.pass_status).toBe('not_visited');
    });
  });

  // ============================================================
  // US014: 退回操作
  // ============================================================
  describe('US014: 退回操作', () => {
    // #14 正常流程：退回申请并填写退回原因
    it('#14 退回后状态变 returned，原因持久化保存，提示"退回成功"', async () => {
      const reason = '访客身份证号填写有误，请核实后重新提交';
      const res = await request(app)
        .post(`/api/approvals/${returnNormal}/return`)
        .send({ operator_session_id: APPROVER, reason });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.approval_status).toBe('returned');

      // 退回原因在审批记录中持久化
      const recordsRes = await request(app).get(`/api/records/${returnNormal}`);
      const records = recordsRes.body.data.approval_records;
      const returnRecord = records.find(
        (r: { operation_type: string }) => r.operation_type === 'return'
      );
      expect(returnRecord).toBeDefined();
      expect(returnRecord.reason).toBe(reason);
      expect(returnRecord.operator_session_id).toBe(APPROVER);
    });

    // #15 无效场景：退回原因为空
    it('#15 退回不填原因时阻止提交，提示"退回必须填写原因"', async () => {
      // 不传 reason
      const res1 = await request(app)
        .post(`/api/approvals/${returnEmpty}/return`)
        .send({ operator_session_id: APPROVER });

      expect(res1.status).toBe(400);
      expect(res1.body.code).toBe(40012);
      expect(res1.body.msg).toBe('退回必须填写原因');

      // 空字符串
      const res2 = await request(app)
        .post(`/api/approvals/${returnEmpty}/return`)
        .send({ operator_session_id: APPROVER, reason: '' });

      expect(res2.status).toBe(400);
      expect(res2.body.code).toBe(40012);

      // 纯空格
      const res3 = await request(app)
        .post(`/api/approvals/${returnEmpty}/return`)
        .send({ operator_session_id: APPROVER, reason: '   ' });

      expect(res3.status).toBe(400);
      expect(res3.body.code).toBe(40012);

      // 申请状态保持 pending
      const detailRes = await request(app).get(`/api/applications/${returnEmpty}`);
      expect(detailRes.body.data.approval_status).toBe('pending');
    });

    // #16 无效场景：退回原因超过500字符
    it('#16 退回原因超过 500 字符时系统拒绝，提示"原因不能超过500个字符"', async () => {
      const longReason = '退'.repeat(501);
      const res = await request(app)
        .post(`/api/approvals/${returnLong}/return`)
        .send({ operator_session_id: APPROVER, reason: longReason });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40013);
      expect(res.body.msg).toContain('原因不能超过500个字符');

      // 恰好 500 字符应该通过
      const exactReason = '退'.repeat(500);
      const res2 = await request(app)
        .post(`/api/approvals/${returnLong}/return`)
        .send({ operator_session_id: APPROVER, reason: exactReason });
      expect(res2.body.code).toBe(0);
    });

    // #17 无效场景：重复退回已处理申请
    it('#17 对已退回申请再次退回，系统阻止并提示"该申请已处理，不可重复操作"', async () => {
      // 先退回
      await request(app)
        .post(`/api/approvals/${returnDuplicate}/return`)
        .send({ operator_session_id: APPROVER, reason: '首次退回' });

      // 再次退回
      const res = await request(app)
        .post(`/api/approvals/${returnDuplicate}/return`)
        .send({ operator_session_id: APPROVER, reason: '再次退回' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40010);
      expect(res.body.msg).toContain('该申请已处理，不可重复操作');
    });
  });

  // ============================================================
  // US015: 拒绝操作
  // ============================================================
  describe('US015: 拒绝操作', () => {
    // #18 正常流程：拒绝申请并填写拒绝原因
    it('#18 拒绝后状态变 rejected（终态），原因持久化保存，申请流程终止', async () => {
      const reason = '访客不符合入校条件，拒绝其入校申请';
      const res = await request(app)
        .post(`/api/approvals/${rejectNormal}/reject`)
        .send({ operator_session_id: APPROVER, reason });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.approval_status).toBe('rejected');

      // 拒绝原因在审批记录中持久化
      const recordsRes = await request(app).get(`/api/records/${rejectNormal}`);
      const records = recordsRes.body.data.approval_records;
      const rejectRecord = records.find(
        (r: { operation_type: string }) => r.operation_type === 'reject'
      );
      expect(rejectRecord).toBeDefined();
      expect(rejectRecord.reason).toBe(reason);

      // 已拒绝不生成通行证
      const pass = recordsRes.body.data.pass;
      expect(pass).toBeNull();
    });

    // #19 无效场景：拒绝原因为空
    it('#19 拒绝不填原因时阻止提交，提示"拒绝必须填写原因"', async () => {
      // 不传 reason
      const res1 = await request(app)
        .post(`/api/approvals/${rejectEmpty}/reject`)
        .send({ operator_session_id: APPROVER });

      expect(res1.status).toBe(400);
      expect(res1.body.code).toBe(40012);
      expect(res1.body.msg).toBe('拒绝必须填写原因');

      // 空字符串
      const res2 = await request(app)
        .post(`/api/approvals/${rejectEmpty}/reject`)
        .send({ operator_session_id: APPROVER, reason: '' });

      expect(res2.status).toBe(400);
      expect(res2.body.code).toBe(40012);

      // 申请状态保持 pending
      const detailRes = await request(app).get(`/api/applications/${rejectEmpty}`);
      expect(detailRes.body.data.approval_status).toBe('pending');
    });

    // #20 无效场景：拒绝原因超过500字符
    it('#20 拒绝原因超过 500 字符时系统拒绝，提示"原因不能超过500个字符"', async () => {
      const longReason = '拒'.repeat(501);
      const res = await request(app)
        .post(`/api/approvals/${rejectLong}/reject`)
        .send({ operator_session_id: APPROVER, reason: longReason });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40013);
      expect(res.body.msg).toContain('原因不能超过500个字符');

      // 恰好 500 字符应该通过
      const exactReason = '拒'.repeat(500);
      const res2 = await request(app)
        .post(`/api/approvals/${rejectLong}/reject`)
        .send({ operator_session_id: APPROVER, reason: exactReason });
      expect(res2.body.code).toBe(0);
    });

    // #21 无效场景：重复拒绝已处理申请
    it('#21 对已拒绝申请再次拒绝，系统阻止并提示"该申请已处理，不可重复操作"', async () => {
      // 先拒绝
      await request(app)
        .post(`/api/approvals/${rejectDuplicate}/reject`)
        .send({ operator_session_id: APPROVER, reason: '首次拒绝' });

      // 再次拒绝
      const res = await request(app)
        .post(`/api/approvals/${rejectDuplicate}/reject`)
        .send({ operator_session_id: APPROVER, reason: '再次拒绝' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(40010);
      expect(res.body.msg).toContain('该申请已处理，不可重复操作');

      // 对已拒绝申请执行同意操作也被拦截
      const approveRes = await request(app)
        .post(`/api/approvals/${rejectDuplicate}/approve`)
        .send({ operator_session_id: APPROVER });
      expect(approveRes.status).toBe(400);
      expect(approveRes.body.code).toBe(40010);
    });
  });

  // ============================================================
  // US017: 已处理审批历史查看（补充测试 - 前端操作相关）
  // ============================================================
  describe('US017: 已处理审批历史（操作行为验证）', () => {
    // #26 正常流程：查看我已处理的审批历史记录
    it('#26 我已处理列表含操作结果标识（通过 approval_status 区分同意/退回/拒绝）', async () => {
      const res = await request(app)
        .get('/api/approvals/processed')
        .query({ session_id: APPROVER });

      expect(res.body.code).toBe(0);
      const items = res.body.data.items;

      // 查找不同操作结果的记录
      const approvedItem = items.find(
        (a: { id: string }) => a.id === approveNormal
      );
      expect(approvedItem).toBeDefined();
      expect(approvedItem.approval_status).toBe('approved');

      const returnedItem = items.find(
        (a: { id: string }) => a.id === returnNormal
      );
      expect(returnedItem).toBeDefined();
      expect(returnedItem.approval_status).toBe('returned');

      const rejectedItem = items.find(
        (a: { id: string }) => a.id === rejectNormal
      );
      expect(rejectedItem).toBeDefined();
      expect(rejectedItem.approval_status).toBe('rejected');
    });

    // #27 无效场景：加载了非当前用户处理的审批记录
    it('#27 未执行过审批操作的用户，我已处理列表为空', async () => {
      const res = await request(app)
        .get('/api/approvals/processed')
        .query({ session_id: 'fk42-never-approved-anything' });

      expect(res.body.code).toBe(0);
      expect(res.body.data.items).toHaveLength(0);
    });

    // #28 无效场景：操作结果标识错误
    it('#28 审批记录的 operation_type 与实际执行的操作一致（标识正确性）', async () => {
      // 同意操作的记录
      const approveRecords = await request(app).get(`/api/records/${approveNormal}`);
      const approveRecs = approveRecords.body.data.approval_records;
      const approveRec = approveRecs.find(
        (r: { operation_type: string }) => r.operation_type === 'approve'
      );
      expect(approveRec).toBeDefined();
      // 不应有 return 或 reject 记录
      const wrongRecs = approveRecs.filter(
        (r: { operation_type: string }) => r.operation_type !== 'approve'
      );
      expect(wrongRecs).toHaveLength(0);

      // 退回操作的记录
      const returnRecords = await request(app).get(`/api/records/${returnNormal}`);
      const returnRecs = returnRecords.body.data.approval_records;
      const returnRec = returnRecs.find(
        (r: { operation_type: string }) => r.operation_type === 'return'
      );
      expect(returnRec).toBeDefined();

      // 拒绝操作的记录
      const rejectRecords = await request(app).get(`/api/records/${rejectNormal}`);
      const rejectRecs = rejectRecords.body.data.approval_records;
      const rejectRec = rejectRecs.find(
        (r: { operation_type: string }) => r.operation_type === 'reject'
      );
      expect(rejectRec).toBeDefined();
    });

    // #29 无效场景：尝试修改或删除审批历史记录
    it('#29 审批记录表只写不改不删 — 无 UPDATE/DELETE 端点，历史记录永久留存', async () => {
      // 获取审批记录 ID
      const recordsRes = await request(app).get(`/api/records/${approveNormal}`);
      const records = recordsRes.body.data.approval_records;
      expect(records.length).toBeGreaterThanOrEqual(1);

      // 尝试 PATCH 修改审批记录 — 不存在此端点
      const patchRes = await request(app)
        .patch(`/api/approvals/${records[0].id}`)
        .send({ reason: '修改原因' });
      expect([404, 405]).toContain(patchRes.status);

      // 尝试 DELETE 删除审批记录 — 不存在此端点
      const delRes = await request(app)
        .delete(`/api/approvals/${records[0].id}`);
      expect([404, 405]).toContain(delRes.status);

      // 验证记录仍然存在且未被修改
      const verifyRes = await request(app).get(`/api/records/${approveNormal}`);
      const verifyRecords = verifyRes.body.data.approval_records;
      expect(verifyRecords.length).toBe(records.length);
      const verifyRec = verifyRecords.find(
        (r: { id: string }) => r.id === records[0].id
      );
      expect(verifyRec).toBeDefined();
      expect(verifyRec.operation_type).toBe('approve');
      expect(verifyRec.operator_session_id).toBe(APPROVER);
    });
  });
});
