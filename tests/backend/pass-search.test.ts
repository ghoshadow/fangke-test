import { describe, it, expect, beforeAll } from 'vitest';
import { initDatabase } from '../../src/backend/config';
import { DepartmentModel } from '../../src/backend/models/department';
import { ApplicationModel } from '../../src/backend/models/application';
import { VisitorPassModel } from '../../src/backend/models/visitor-pass';

/**
 * FK-34: 【测试】通行证搜索与查找
 *
 * 验证门卫通过姓名/手机号/身份证号搜索定位访客通行证。
 * 测试场景覆盖 US018 用户故事的 6 个场景：
 *   1. 完整姓名搜索
 *   2. 部分姓名模糊搜索
 *   3. 手机号搜索
 *   4. 多条件组合搜索（AND 逻辑）
 *   5. 搜索无匹配
 *   6. 搜索结果仅限审批状态=已同意的记录
 */
describe('FK-34: 通行证搜索与查找', () => {
  let deptId: string;

  // 用于精确匹配的测试数据
  let appZhangSan: string;
  let appLiSi: string;
  let appWangWu: string;
  // 用于审批状态过滤测试
  let appPending: string;
  let appRejected: string;

  beforeAll(async () => {
    await initDatabase();
    const depts = DepartmentModel.findAll();
    deptId = depts[0].id;

    // --- 准备已审批通过的测试数据 ---

    // 张三 (含身份证号)
    const a1 = ApplicationModel.create({
      visitor_name: '张三',
      phone: '13800138001',
      id_card: '110101199001011234',
      visitor_count: 1,
      is_driving: false,
      contact_person: '联系人A',
      department_id: deptId,
      visit_start_time: '2024-05-01T09:00:00.000Z',
      visit_end_time: '2024-05-01T17:00:00.000Z',
      visit_purpose: '业务交流',
      session_id: 'fk34-session-1',
    });
    ApplicationModel.updateApprovalStatus(a1.id, 'approved', a1.version);
    VisitorPassModel.create({ application_id: a1.id });
    appZhangSan = a1.id;

    // 张小明 (名字中包含"张")
    const a2 = ApplicationModel.create({
      visitor_name: '张小明',
      phone: '13900139002',
      id_card: '310101198505052345',
      visitor_count: 2,
      is_driving: true,
      license_plate: '沪A12345',
      contact_person: '联系人B',
      department_id: deptId,
      visit_start_time: '2024-05-02T09:00:00.000Z',
      visit_end_time: '2024-05-02T17:00:00.000Z',
      visit_purpose: '面试',
      session_id: 'fk34-session-2',
    });
    ApplicationModel.updateApprovalStatus(a2.id, 'approved', a2.version);
    VisitorPassModel.create({ application_id: a2.id });
    appLiSi = a2.id;

    // 王五 (独立的姓名和手机号)
    const a3 = ApplicationModel.create({
      visitor_name: '王五',
      phone: '15800158003',
      visitor_count: 1,
      is_driving: false,
      contact_person: '联系人C',
      department_id: deptId,
      visit_start_time: '2024-05-03T09:00:00.000Z',
      visit_end_time: '2024-05-03T17:00:00.000Z',
      visit_purpose: '参观学习',
      session_id: 'fk34-session-3',
    });
    ApplicationModel.updateApprovalStatus(a3.id, 'approved', a3.version);
    VisitorPassModel.create({ application_id: a3.id });
    appWangWu = a3.id;

    // --- 准备非 approved 状态的数据（用于场景 6 验证） ---

    // pending 状态 - 不应出现在搜索结果中
    const a4 = ApplicationModel.create({
      visitor_name: '赵六待审',
      phone: '13700137004',
      visitor_count: 1,
      is_driving: false,
      contact_person: '联系人D',
      department_id: deptId,
      visit_start_time: '2024-05-04T09:00:00.000Z',
      visit_end_time: '2024-05-04T17:00:00.000Z',
      visit_purpose: '待审批测试',
      session_id: 'fk34-session-4',
    });
    appPending = a4.id;

    // rejected 状态 - 不应出现在搜索结果中
    const a5 = ApplicationModel.create({
      visitor_name: '孙七被拒',
      phone: '13600136005',
      visitor_count: 1,
      is_driving: false,
      contact_person: '联系人E',
      department_id: deptId,
      visit_start_time: '2024-05-05T09:00:00.000Z',
      visit_end_time: '2024-05-05T17:00:00.000Z',
      visit_purpose: '拒绝测试',
      session_id: 'fk34-session-5',
    });
    ApplicationModel.updateApprovalStatus(a5.id, 'rejected', a5.version);
    appRejected = a5.id;
  });

  describe('场景 1: 输入完整访客姓名搜索', () => {
    it('返回精确匹配的通行证记录', () => {
      const result = VisitorPassModel.search({ name: '张三' });
      expect(result.items.length).toBeGreaterThanOrEqual(1);
      const match = result.items.find((i) => i.application_id === appZhangSan);
      expect(match).toBeDefined();
      expect(match!.visitor_name).toBe('张三');
      expect(match!.phone).toBe('13800138001');
    });

    it('返回完整访客信息（含通行证字段和申请表字段）', () => {
      const result = VisitorPassModel.search({ name: '王五' });
      expect(result.items.length).toBeGreaterThanOrEqual(1);
      const match = result.items.find((i) => i.application_id === appWangWu);
      expect(match).toBeDefined();
      expect(match).toHaveProperty('id');
      expect(match).toHaveProperty('pass_status');
      expect(match).toHaveProperty('visitor_name');
      expect(match).toHaveProperty('phone');
    });
  });

  describe('场景 2: 输入部分姓名模糊搜索', () => {
    it('返回包含该关键词的所有记录', () => {
      // "张" 应匹配 "张三" 和 "张小明"
      const result = VisitorPassModel.search({ name: '张' });
      expect(result.items.length).toBeGreaterThanOrEqual(2);
      const names = result.items.map((i) => i.visitor_name);
      expect(names).toContain('张三');
      expect(names).toContain('张小明');
    });

    it('单字"小"匹配张小明', () => {
      const result = VisitorPassModel.search({ name: '小' });
      expect(result.items.length).toBeGreaterThanOrEqual(1);
      const match = result.items.find((i) => i.application_id === appLiSi);
      expect(match).toBeDefined();
      expect(match!.visitor_name).toBe('张小明');
    });

    it('不匹配无关记录', () => {
      const result = VisitorPassModel.search({ name: '张' });
      const names = result.items.map((i) => i.visitor_name);
      expect(names).not.toContain('王五');
    });
  });

  describe('场景 3: 输入手机号搜索', () => {
    it('精确前缀匹配返回对应访客', () => {
      // 完整手机号匹配
      const result = VisitorPassModel.search({ phone: '13800138001' });
      expect(result.items.length).toBe(1);
      expect(result.items[0].visitor_name).toBe('张三');
      expect(result.items[0].phone).toBe('13800138001');
    });

    it('手机号前缀匹配返回所有以该前缀开头的访客', () => {
      // "138" 前缀应匹配 13800138001
      const result = VisitorPassModel.search({ phone: '138' });
      expect(result.items.length).toBeGreaterThanOrEqual(1);
      const match = result.items.find((i) => i.application_id === appZhangSan);
      expect(match).toBeDefined();
    });

    it('不同手机号前缀返回不同访客', () => {
      const result = VisitorPassModel.search({ phone: '158' });
      expect(result.items.length).toBeGreaterThanOrEqual(1);
      const match = result.items.find((i) => i.application_id === appWangWu);
      expect(match).toBeDefined();
      expect(match!.visitor_name).toBe('王五');
    });
  });

  describe('场景 4: 多条件组合搜索（AND 逻辑）', () => {
    it('姓名+手机号同时匹配返回精确结果', () => {
      const result = VisitorPassModel.search({ name: '张三', phone: '138' });
      expect(result.items.length).toBe(1);
      expect(result.items[0].visitor_name).toBe('张三');
      expect(result.items[0].phone).toBe('13800138001');
    });

    it('姓名+身份证号同时匹配返回精确结果', () => {
      const result = VisitorPassModel.search({ name: '张三', id_card: '110101199001011234' });
      expect(result.items.length).toBe(1);
      expect(result.items[0].visitor_name).toBe('张三');
    });

    it('手机号+身份证号同时匹配返回精确结果', () => {
      const result = VisitorPassModel.search({ phone: '13900139002', id_card: '310101198505052345' });
      expect(result.items.length).toBe(1);
      expect(result.items[0].visitor_name).toBe('张小明');
    });

    it('姓名+手机号不匹配时返回空（AND 逻辑）', () => {
      // "张三" 的手机号不是 158 开头
      const result = VisitorPassModel.search({ name: '张三', phone: '158' });
      expect(result.items.length).toBe(0);
    });

    it('三条件全部满足时返回精确结果', () => {
      const result = VisitorPassModel.search({
        name: '张',
        phone: '138',
        id_card: '110101199001011234',
      });
      expect(result.items.length).toBe(1);
      expect(result.items[0].visitor_name).toBe('张三');
    });
  });

  describe('场景 5: 搜索无匹配', () => {
    it('姓名无匹配返回空列表', () => {
      const result = VisitorPassModel.search({ name: '不存在的访客名字XXX' });
      expect(result.items.length).toBe(0);
      expect(result.total).toBe(0);
    });

    it('手机号无匹配返回空列表', () => {
      const result = VisitorPassModel.search({ phone: '19999999999' });
      expect(result.items.length).toBe(0);
      expect(result.total).toBe(0);
    });

    it('身份证号无匹配返回空列表', () => {
      const result = VisitorPassModel.search({ id_card: '999999999999999999' });
      expect(result.items.length).toBe(0);
      expect(result.total).toBe(0);
    });

    it('组合条件无匹配返回空列表', () => {
      const result = VisitorPassModel.search({ name: '张三', phone: '199' });
      expect(result.items.length).toBe(0);
    });

    it('返回正确的分页元数据（即使为空）', () => {
      const result = VisitorPassModel.search({ name: '不存在的名字' });
      expect(result.page).toBe(1);
      expect(result.page_size).toBe(20);
      expect(result.total).toBe(0);
      expect(result.items).toEqual([]);
    });
  });

  describe('场景 6: 搜索结果仅限审批状态=已同意的记录', () => {
    it('已审批通过的记录出现在搜索结果中', () => {
      const result = VisitorPassModel.search({ name: '张三' });
      expect(result.items.length).toBeGreaterThanOrEqual(1);
      const match = result.items.find((i) => i.application_id === appZhangSan);
      expect(match).toBeDefined();
    });

    it('pending 状态的申请不出现在搜索结果中（无通行证）', () => {
      // 赵六待审 - 是 pending 状态，不应有通行证
      const result = VisitorPassModel.search({ name: '赵六待审' });
      expect(result.items.length).toBe(0);
      const match = result.items.find((i) => i.application_id === appPending);
      expect(match).toBeUndefined();
    });

    it('rejected 状态的申请不出现在搜索结果中（无通行证）', () => {
      // 孙七被拒 - 是 rejected 状态，不应有通行证
      const result = VisitorPassModel.search({ name: '孙七被拒' });
      expect(result.items.length).toBe(0);
      const match = result.items.find((i) => i.application_id === appRejected);
      expect(match).toBeUndefined();
    });

    it('全量搜索时仅包含 approved 状态的通行证', () => {
      // 不带搜索条件时，列表也应仅包含已审批的通行证
      const result = VisitorPassModel.search({});
      expect(result.items.length).toBeGreaterThanOrEqual(3);
      const appIds = result.items.map((i) => i.application_id);
      // approved 的应该出现
      expect(appIds).toContain(appZhangSan);
      expect(appIds).toContain(appLiSi);
      expect(appIds).toContain(appWangWu);
      // pending/rejected 不应出现
      expect(appIds).not.toContain(appPending);
      expect(appIds).not.toContain(appRejected);
    });
  });
});
