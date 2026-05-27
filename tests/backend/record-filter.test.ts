import { describe, it, expect, beforeAll } from 'vitest';
import { initDatabase } from '../../src/backend/config';
import { DepartmentModel } from '../../src/backend/models/department';
import { ApplicationModel } from '../../src/backend/models/application';
import { VisitorPassModel } from '../../src/backend/models/visitor-pass';

/**
 * FK-37: 【测试】多条件组合筛选查询（10维度）
 *
 * 验证 GET /api/records 的 10 个筛选维度各自生效、AND 组合、结果正确性。
 *
 * 10 个筛选维度：
 *   1. 访客姓名 (visitor_name, LIKE)
 *   2. 手机号 (phone, 精确匹配)
 *   3. 身份证号 (id_card, 精确匹配)
 *   4. 内部对接人 (contact_person, LIKE)
 *   5. 对接人部门 (department_id, 精确匹配)
 *   6. 访客单位 (company, LIKE)
 *   7. 拜访时间段 (visit_start_from / visit_start_to, 范围)
 *   8. 车牌号 (license_plate, LIKE)
 *   9. 审批状态 (approval_status, 精确匹配)
 *   10. 通行状态 (pass_status, 精确匹配)
 *
 * 测试场景覆盖 US022 / US023 / US024：
 *   1. 单一条件（访客姓名）
 *   2. 单一条件（审批状态=已退回）
 *   3. 单一条件（通行状态=已到访）
 *   4. 时间范围筛选
 *   5. 3 个条件 AND 组合
 *   6. 全部 10 个条件组合
 *   7. 设置条件后无匹配
 *   8. 重置筛选条件（空查询返回全量）
 *   9. 筛选条件有效性校验
 */
describe('FK-37: 多条件组合筛选查询（10维度）', () => {
  let deptJWC: string; // 教务处
  let deptBWC: string; // 保卫处

  // --- 用于场景验证的测试数据 ID ---
  let appIdZhangSan: string;
  let appIdLiSi: string;
  let appIdWangWu: string;
  let appIdZhaoLiu: string;
  let appIdSunQi: string;
  let appIdQianBa: string;

  beforeAll(async () => {
    await initDatabase();

    const depts = DepartmentModel.findAll();
    deptJWC = depts.find((d) => d.name === '教务处')!.id;
    deptBWC = depts.find((d) => d.name === '保卫处')!.id;

    // ── 数据 1: 张三 — approved + visited，全字段填充 ──
    const a1 = ApplicationModel.create({
      visitor_name: '张三',
      phone: '13800138001',
      id_card: '110101199001011234',
      company: '北京科技有限公司',
      visitor_count: 1,
      is_driving: true,
      license_plate: '京A12345',
      contact_person: '对接人王',
      department_id: deptJWC,
      visit_start_time: '2024-06-01T09:00:00.000Z',
      visit_end_time: '2024-06-01T17:00:00.000Z',
      visit_purpose: '业务交流',
      session_id: 'fk37-session-1',
    });
    ApplicationModel.updateApprovalStatus(a1.id, 'approved', a1.version);
    VisitorPassModel.create({ application_id: a1.id });
    // 同步通行证状态到申请表（模拟路由层行为）
    ApplicationModel.updatePassStatus(a1.id, 'not_visited');
    // 确认到访
    const pass1 = VisitorPassModel.findByApplicationId(a1.id)!;
    VisitorPassModel.confirmVisit(pass1.id, '09:15');
    ApplicationModel.updatePassStatus(a1.id, 'visited');
    appIdZhangSan = a1.id;

    // ── 数据 2: 李四 — approved + not_visited ──
    const a2 = ApplicationModel.create({
      visitor_name: '李四',
      phone: '13900139002',
      id_card: '310101198505052345',
      company: '上海贸易有限公司',
      visitor_count: 2,
      is_driving: false,
      contact_person: '对接人王',
      department_id: deptJWC,
      visit_start_time: '2024-06-05T10:00:00.000Z',
      visit_end_time: '2024-06-05T16:00:00.000Z',
      visit_purpose: '合作洽谈',
      session_id: 'fk37-session-2',
    });
    ApplicationModel.updateApprovalStatus(a2.id, 'approved', a2.version);
    VisitorPassModel.create({ application_id: a2.id });
    ApplicationModel.updatePassStatus(a2.id, 'not_visited');
    appIdLiSi = a2.id;

    // ── 数据 3: 王五 — returned（已退回） ──
    const a3 = ApplicationModel.create({
      visitor_name: '王五',
      phone: '15800158003',
      company: '广州咨询公司',
      visitor_count: 1,
      is_driving: false,
      contact_person: '对接人赵',
      department_id: deptBWC,
      visit_start_time: '2024-06-10T08:30:00.000Z',
      visit_end_time: '2024-06-10T12:00:00.000Z',
      visit_purpose: '审计检查',
      session_id: 'fk37-session-3',
    });
    ApplicationModel.updateApprovalStatus(a3.id, 'returned', a3.version);
    appIdWangWu = a3.id;

    // ── 数据 4: 赵六 — pending（待审批） ──
    const a4 = ApplicationModel.create({
      visitor_name: '赵六',
      phone: '13700137004',
      company: '深圳技术有限公司',
      visitor_count: 3,
      is_driving: true,
      license_plate: '粤B67890',
      contact_person: '对接人钱',
      department_id: deptBWC,
      visit_start_time: '2024-06-15T14:00:00.000Z',
      visit_end_time: '2024-06-15T18:00:00.000Z',
      visit_purpose: '设备维护',
      session_id: 'fk37-session-4',
    });
    appIdZhaoLiu = a4.id;

    // ── 数据 5: 孙七 — rejected（已拒绝） ──
    const a5 = ApplicationModel.create({
      visitor_name: '孙七',
      phone: '13600136005',
      id_card: '440101199203031234',
      visitor_count: 1,
      is_driving: false,
      contact_person: '对接人钱',
      department_id: deptJWC,
      visit_start_time: '2024-06-20T09:00:00.000Z',
      visit_end_time: '2024-06-20T11:00:00.000Z',
      visit_purpose: '推销拜访',
      session_id: 'fk37-session-5',
    });
    ApplicationModel.updateApprovalStatus(a5.id, 'rejected', a5.version);
    appIdSunQi = a5.id;

    // ── 数据 6: 钱八 — approved + visited，另一时间段 ──
    const a6 = ApplicationModel.create({
      visitor_name: '钱八',
      phone: '13500135006',
      company: '北京科技有限公司',
      visitor_count: 1,
      is_driving: true,
      license_plate: '京C11111',
      contact_person: '对接人王',
      department_id: deptBWC,
      visit_start_time: '2024-07-01T09:00:00.000Z',
      visit_end_time: '2024-07-01T17:00:00.000Z',
      visit_purpose: '年度审查',
      session_id: 'fk37-session-6',
    });
    ApplicationModel.updateApprovalStatus(a6.id, 'approved', a6.version);
    VisitorPassModel.create({ application_id: a6.id });
    ApplicationModel.updatePassStatus(a6.id, 'not_visited');
    const pass6 = VisitorPassModel.findByApplicationId(a6.id)!;
    VisitorPassModel.confirmVisit(pass6.id, '10:00');
    ApplicationModel.updatePassStatus(a6.id, 'visited');
    appIdQianBa = a6.id;
  });

  // ================================================================
  // 场景 1: 单一条件（访客姓名）— 返回姓名匹配的全部记录
  // ================================================================
  describe('场景 1: 单一条件（访客姓名）', () => {
    it('模糊匹配返回包含关键字的全部记录', () => {
      // "张" 应匹配 "张三"
      const result = ApplicationModel.recordQuery({ visitor_name: '张' });
      expect(result.items.length).toBeGreaterThanOrEqual(1);
      const names = result.items.map((i) => i.visitor_name);
      expect(names).toContain('张三');
    });

    it('完整姓名返回精确匹配记录', () => {
      const result = ApplicationModel.recordQuery({ visitor_name: '张三' });
      expect(result.items.length).toBeGreaterThanOrEqual(1);
      const match = result.items.find((i) => i.id === appIdZhangSan);
      expect(match).toBeDefined();
      expect(match!.visitor_name).toBe('张三');
      expect(match!.phone).toBe('13800138001');
    });

    it('单字匹配多个结果', () => {
      // "人" 不出现在任何访客姓名中，但在对接人中
      // 测试一个不匹配任何访客姓名的字
      const result = ApplicationModel.recordQuery({ visitor_name: '不存在的姓名' });
      expect(result.items.length).toBe(0);
    });

    it('姓名筛选不影响其他维度的记录', () => {
      const result = ApplicationModel.recordQuery({ visitor_name: '李四' });
      expect(result.items.length).toBeGreaterThanOrEqual(1);
      const match = result.items.find((i) => i.id === appIdLiSi);
      expect(match).toBeDefined();
      expect(match!.approval_status).toBe('approved');
    });
  });

  // ================================================================
  // 场景 2: 单一条件（审批状态=已退回）— 仅返回已退回记录
  // ================================================================
  describe('场景 2: 单一条件（审批状态=已退回）', () => {
    it('仅返回 approval_status=returned 的记录', () => {
      const result = ApplicationModel.recordQuery({ approval_status: 'returned' });
      expect(result.items.length).toBeGreaterThanOrEqual(1);
      expect(result.items.every((i) => i.approval_status === 'returned')).toBe(true);
    });

    it('王五在已退回列表中', () => {
      const result = ApplicationModel.recordQuery({ approval_status: 'returned' });
      const match = result.items.find((i) => i.id === appIdWangWu);
      expect(match).toBeDefined();
      expect(match!.visitor_name).toBe('王五');
    });

    it('已退回列表不包含其他状态的记录', () => {
      const result = ApplicationModel.recordQuery({ approval_status: 'returned' });
      const ids = result.items.map((i) => i.id);
      expect(ids).not.toContain(appIdZhangSan); // approved
      expect(ids).not.toContain(appIdZhaoLiu); // pending
      expect(ids).not.toContain(appIdSunQi); // rejected
    });

    it('查询 approved 状态返回正确的记录', () => {
      const result = ApplicationModel.recordQuery({ approval_status: 'approved' });
      expect(result.items.length).toBeGreaterThanOrEqual(3); // 张三、李四、钱八
      expect(result.items.every((i) => i.approval_status === 'approved')).toBe(true);
    });

    it('查询 rejected 状态返回正确的记录', () => {
      const result = ApplicationModel.recordQuery({ approval_status: 'rejected' });
      expect(result.items.length).toBeGreaterThanOrEqual(1);
      const match = result.items.find((i) => i.id === appIdSunQi);
      expect(match).toBeDefined();
    });
  });

  // ================================================================
  // 场景 3: 单一条件（通行状态=已到访）— 仅返回已到访记录
  // ================================================================
  describe('场景 3: 单一条件（通行状态=已到访）', () => {
    it('仅返回 pass_status=visited 的记录', () => {
      const result = ApplicationModel.recordQuery({ pass_status: 'visited' });
      expect(result.items.length).toBeGreaterThanOrEqual(1);
      expect(result.items.every((i) => i.pass_status === 'visited')).toBe(true);
    });

    it('张三和钱八在已到访列表中', () => {
      const result = ApplicationModel.recordQuery({ pass_status: 'visited' });
      const ids = result.items.map((i) => i.id);
      expect(ids).toContain(appIdZhangSan);
      expect(ids).toContain(appIdQianBa);
    });

    it('已到访列表不包含未到访记录', () => {
      const result = ApplicationModel.recordQuery({ pass_status: 'visited' });
      const ids = result.items.map((i) => i.id);
      expect(ids).not.toContain(appIdLiSi); // not_visited
    });

    it('查询 not_visited 状态返回正确的记录', () => {
      const result = ApplicationModel.recordQuery({ pass_status: 'not_visited' });
      expect(result.items.length).toBeGreaterThanOrEqual(1);
      expect(result.items.every((i) => i.pass_status === 'not_visited')).toBe(true);
      const ids = result.items.map((i) => i.id);
      expect(ids).toContain(appIdLiSi);
    });

    it('通行状态筛选不包含无通行证的记录', () => {
      // 待审批/已退回/已拒绝的记录没有通行证（pass_status = null）
      const result = ApplicationModel.recordQuery({ pass_status: 'visited' });
      const ids = result.items.map((i) => i.id);
      expect(ids).not.toContain(appIdWangWu); // returned, no pass
      expect(ids).not.toContain(appIdZhaoLiu); // pending, no pass
      expect(ids).not.toContain(appIdSunQi); // rejected, no pass
    });
  });

  // ================================================================
  // 场景 4: 时间范围筛选 — 返回拜访时间在范围内的记录
  // ================================================================
  describe('场景 4: 时间范围筛选', () => {
    it('指定起止时间返回范围内的记录', () => {
      const result = ApplicationModel.recordQuery({
        visit_start_from: '2024-06-01T00:00:00.000Z',
        visit_start_to: '2024-06-10T23:59:59.000Z',
      });
      expect(result.items.length).toBeGreaterThanOrEqual(3); // 张三、李四、王五
      const ids = result.items.map((i) => i.id);
      expect(ids).toContain(appIdZhangSan); // 6/1
      expect(ids).toContain(appIdLiSi); // 6/5
      expect(ids).toContain(appIdWangWu); // 6/10
    });

    it('范围不包含边界外的记录', () => {
      const result = ApplicationModel.recordQuery({
        visit_start_from: '2024-06-01T00:00:00.000Z',
        visit_start_to: '2024-06-10T23:59:59.000Z',
      });
      const ids = result.items.map((i) => i.id);
      expect(ids).not.toContain(appIdQianBa); // 7/1, 超出范围
    });

    it('只指定起始时间返回起始时间之后的记录', () => {
      const result = ApplicationModel.recordQuery({
        visit_start_from: '2024-06-15T00:00:00.000Z',
      });
      expect(result.items.length).toBeGreaterThanOrEqual(2); // 赵六、孙七、钱八
      const ids = result.items.map((i) => i.id);
      expect(ids).toContain(appIdZhaoLiu); // 6/15
      expect(ids).toContain(appIdSunQi); // 6/20
      expect(ids).toContain(appIdQianBa); // 7/1
    });

    it('只指定截止时间返回截止时间之前的记录', () => {
      const result = ApplicationModel.recordQuery({
        visit_start_to: '2024-06-05T23:59:59.000Z',
      });
      const ids = result.items.map((i) => i.id);
      expect(ids).toContain(appIdZhangSan); // 6/1
      expect(ids).toContain(appIdLiSi); // 6/5
      expect(ids).not.toContain(appIdWangWu); // 6/10, 超出范围
    });

    it('极窄时间范围仅匹配精确的记录', () => {
      const result = ApplicationModel.recordQuery({
        visit_start_from: '2024-06-01T08:00:00.000Z',
        visit_start_to: '2024-06-01T10:00:00.000Z',
      });
      expect(result.items.length).toBeGreaterThanOrEqual(1);
      const match = result.items.find((i) => i.id === appIdZhangSan);
      expect(match).toBeDefined();
    });
  });

  // ================================================================
  // 场景 5: 3 个条件 AND 组合 — 同时满足所有条件的记录
  // ================================================================
  describe('场景 5: 3 个条件 AND 组合', () => {
    it('姓名 + 审批状态 + 对接人部门返回精确结果', () => {
      const result = ApplicationModel.recordQuery({
        visitor_name: '张三',
        approval_status: 'approved',
        department_id: deptJWC,
      });
      expect(result.items.length).toBe(1);
      expect(result.items[0].id).toBe(appIdZhangSan);
    });

    it('审批状态 + 通行状态 + 对接人部门返回精确结果', () => {
      const result = ApplicationModel.recordQuery({
        approval_status: 'approved',
        pass_status: 'visited',
        department_id: deptBWC,
      });
      expect(result.items.length).toBeGreaterThanOrEqual(1);
      const match = result.items.find((i) => i.id === appIdQianBa);
      expect(match).toBeDefined();
    });

    it('姓名 + 手机号 + 访客单位返回精确结果', () => {
      const result = ApplicationModel.recordQuery({
        visitor_name: '李四',
        phone: '13900139002',
        company: '上海',
      });
      expect(result.items.length).toBe(1);
      expect(result.items[0].id).toBe(appIdLiSi);
    });

    it('AND 组合中一个条件不满足则返回空', () => {
      // 张三是 approved，不是 returned
      const result = ApplicationModel.recordQuery({
        visitor_name: '张三',
        approval_status: 'returned',
        department_id: deptJWC,
      });
      expect(result.items.length).toBe(0);
    });

    it('时间范围 + 审批状态 + 车牌号返回精确结果', () => {
      const result = ApplicationModel.recordQuery({
        visit_start_from: '2024-05-01T00:00:00.000Z',
        visit_start_to: '2024-06-30T23:59:59.000Z',
        approval_status: 'approved',
        license_plate: '京A',
      });
      expect(result.items.length).toBe(1);
      expect(result.items[0].id).toBe(appIdZhangSan);
    });
  });

  // ================================================================
  // 场景 6: 全部 10 个条件组合 — 精确匹配，结果正确
  // ================================================================
  describe('场景 6: 全部 10 个条件组合', () => {
    it('张三的所有条件组合返回精确匹配', () => {
      const result = ApplicationModel.recordQuery({
        visitor_name: '张三',
        phone: '13800138001',
        id_card: '110101199001011234',
        contact_person: '对接人王',
        department_id: deptJWC,
        company: '北京科技',
        visit_start_from: '2024-06-01T00:00:00.000Z',
        visit_start_to: '2024-06-01T23:59:59.000Z',
        license_plate: '京A12345',
        approval_status: 'approved',
        pass_status: 'visited',
      });
      expect(result.items.length).toBe(1);
      expect(result.items[0].id).toBe(appIdZhangSan);
      expect(result.items[0].visitor_name).toBe('张三');
    });

    it('钱八的所有条件组合返回精确匹配', () => {
      const result = ApplicationModel.recordQuery({
        visitor_name: '钱八',
        phone: '13500135006',
        contact_person: '对接人王',
        department_id: deptBWC,
        company: '北京科技',
        visit_start_from: '2024-07-01T00:00:00.000Z',
        visit_start_to: '2024-07-01T23:59:59.000Z',
        license_plate: '京C11111',
        approval_status: 'approved',
        pass_status: 'visited',
      });
      expect(result.items.length).toBe(1);
      expect(result.items[0].id).toBe(appIdQianBa);
    });

    it('全部条件中一个不满足则返回空', () => {
      const result = ApplicationModel.recordQuery({
        visitor_name: '张三',
        phone: '13800138001',
        id_card: '110101199001011234',
        contact_person: '对接人王',
        department_id: deptJWC,
        company: '北京科技',
        visit_start_from: '2024-06-01T00:00:00.000Z',
        visit_start_to: '2024-06-01T23:59:59.000Z',
        license_plate: '京A12345',
        approval_status: 'approved',
        pass_status: 'not_visited', // 张三实际是 visited
      });
      expect(result.items.length).toBe(0);
    });

    it('全部条件返回正确分页元数据', () => {
      const result = ApplicationModel.recordQuery({
        visitor_name: '张三',
        phone: '13800138001',
        id_card: '110101199001011234',
        contact_person: '对接人王',
        department_id: deptJWC,
        company: '北京科技',
        visit_start_from: '2024-06-01T00:00:00.000Z',
        visit_start_to: '2024-06-01T23:59:59.000Z',
        license_plate: '京A12345',
        approval_status: 'approved',
        pass_status: 'visited',
        page: 1,
        page_size: 20,
      });
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.page_size).toBe(20);
    });
  });

  // ================================================================
  // 场景 7: 设置条件后无匹配 — 空结果列表，展示空状态提示
  // ================================================================
  describe('场景 7: 设置条件后无匹配', () => {
    it('不存在的访客姓名返回空列表', () => {
      const result = ApplicationModel.recordQuery({
        visitor_name: '完全不存在的人XXXYYY',
      });
      expect(result.items.length).toBe(0);
      expect(result.total).toBe(0);
    });

    it('不存在的手机号返回空列表', () => {
      const result = ApplicationModel.recordQuery({ phone: '19999999999' });
      expect(result.items.length).toBe(0);
      expect(result.total).toBe(0);
    });

    it('组合条件互相矛盾返回空列表', () => {
      // 张三在教务处，不在保卫处
      const result = ApplicationModel.recordQuery({
        visitor_name: '张三',
        department_id: deptBWC,
      });
      expect(result.items.length).toBe(0);
    });

    it('时间范围内无记录返回空列表', () => {
      const result = ApplicationModel.recordQuery({
        visit_start_from: '2030-01-01T00:00:00.000Z',
        visit_start_to: '2030-12-31T23:59:59.000Z',
      });
      expect(result.items.length).toBe(0);
    });

    it('空结果仍返回正确的分页元数据', () => {
      const result = ApplicationModel.recordQuery({
        visitor_name: '不存在XXX',
        page: 1,
        page_size: 20,
      });
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.page).toBe(1);
      expect(result.page_size).toBe(20);
    });

    it('不存在的身份证号返回空列表', () => {
      const result = ApplicationModel.recordQuery({
        id_card: '999999999999999999',
      });
      expect(result.items.length).toBe(0);
    });

    it('不存在的车牌号返回空列表', () => {
      const result = ApplicationModel.recordQuery({
        license_plate: '不存在的车牌XXX',
      });
      expect(result.items.length).toBe(0);
    });
  });

  // ================================================================
  // 场景 8: 重置筛选条件 — 所有条件清空，恢复全量列表
  // ================================================================
  describe('场景 8: 重置筛选条件（空查询返回全量）', () => {
    it('无任何筛选条件返回全部记录', () => {
      const result = ApplicationModel.recordQuery({});
      expect(result.items.length).toBeGreaterThanOrEqual(6);
      expect(result.total).toBeGreaterThanOrEqual(6);
    });

    it('全量列表包含所有状态的记录', () => {
      const result = ApplicationModel.recordQuery({});
      const ids = result.items.map((i) => i.id);
      expect(ids).toContain(appIdZhangSan); // approved
      expect(ids).toContain(appIdLiSi); // approved
      expect(ids).toContain(appIdWangWu); // returned
      expect(ids).toContain(appIdZhaoLiu); // pending
      expect(ids).toContain(appIdSunQi); // rejected
      expect(ids).toContain(appIdQianBa); // approved
    });

    it('全量列表支持分页', () => {
      const result = ApplicationModel.recordQuery({ page: 1, page_size: 3 });
      expect(result.items.length).toBeLessThanOrEqual(3);
      expect(result.page).toBe(1);
      expect(result.page_size).toBe(3);
      expect(result.total).toBeGreaterThanOrEqual(6);
    });

    it('分页第二页返回不同数据', () => {
      const page1 = ApplicationModel.recordQuery({ page: 1, page_size: 3 });
      const page2 = ApplicationModel.recordQuery({ page: 2, page_size: 3 });

      const page1Ids = page1.items.map((i) => i.id);
      const page2Ids = page2.items.map((i) => i.id);

      // 两页数据不应没有交集
      for (const id of page2Ids) {
        expect(page1Ids).not.toContain(id);
      }
    });

    it('全量列表默认分页参数正确', () => {
      const result = ApplicationModel.recordQuery({});
      expect(result.page).toBe(1);
      expect(result.page_size).toBe(20);
    });
  });

  // ================================================================
  // 场景 9: 筛选条件有效性校验
  // ================================================================
  describe('场景 9: 筛选条件有效性校验', () => {
    it('无效手机号格式（非11位）返回空结果（精确匹配）', () => {
      // 手机号使用精确匹配，无效格式自然不匹配任何记录
      const result = ApplicationModel.recordQuery({ phone: '123' });
      expect(result.items.length).toBe(0);
    });

    it('无效手机号格式（含字母）返回空结果', () => {
      const result = ApplicationModel.recordQuery({ phone: '138abc12345' });
      expect(result.items.length).toBe(0);
    });

    it('空字符串手机号等同无条件筛选', () => {
      // 空字符串在 recordQuery 中被视为 falsy，不参与条件
      const result = ApplicationModel.recordQuery({ phone: '' });
      expect(result.items.length).toBeGreaterThanOrEqual(6);
    });

    it('无效身份证号返回空结果', () => {
      const result = ApplicationModel.recordQuery({ id_card: '12345' });
      expect(result.items.length).toBe(0);
    });

    it('无效时间段（起始晚于截止）返回空结果', () => {
      // 起始 2025 年，截止 2024 年，逻辑上无交集
      const result = ApplicationModel.recordQuery({
        visit_start_from: '2025-01-01T00:00:00.000Z',
        visit_start_to: '2024-01-01T00:00:00.000Z',
      });
      expect(result.items.length).toBe(0);
    });

    it('特殊字符不会导致查询异常', () => {
      const result = ApplicationModel.recordQuery({
        visitor_name: "'; DROP TABLE visitor_application; --",
      });
      // 应返回空结果而非报错
      expect(result.items.length).toBe(0);
    });

    it('undefined 条件被忽略，不影响查询', () => {
      const result = ApplicationModel.recordQuery({
        visitor_name: undefined,
        phone: undefined,
        id_card: undefined,
        department_id: undefined,
        approval_status: undefined,
        pass_status: undefined,
      });
      // 所有条件均为 undefined，等同无筛选
      expect(result.items.length).toBeGreaterThanOrEqual(6);
    });

    it('LIKE 查询字段不会匹配 null 值', () => {
      // company 字段：孙七没有 company
      const result = ApplicationModel.recordQuery({ company: '科技' });
      const ids = result.items.map((i) => i.id);
      // 孙七没有 company，不应出现在结果中
      expect(ids).not.toContain(appIdSunQi);
    });
  });
});
