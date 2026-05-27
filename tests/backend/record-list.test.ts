import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { initDatabase } from '../../src/backend/config';
import { DepartmentModel } from '../../src/backend/models/department';
import { ApplicationModel } from '../../src/backend/models/application';
import { VisitorPassModel } from '../../src/backend/models/visitor-pass';
import recordRoutes from '../../src/backend/routes/record';
import { errorHandler } from '../../src/backend/middleware/response';

// ============================================================
// 【测试】查询结果列表展示与分页 — FK-38
// 测试 GET /api/records 接口：字段完整性、排序规则、分页功能、数据不可篡改
// 覆盖 8 个场景，关联用户故事 US022, US023, US024
// ============================================================

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/records', recordRoutes);
  app.use(errorHandler);
  return app;
}

/**
 * 辅助：创建测试申请（不同状态）
 */
function createTestApp_Record(overrides: Partial<{
  visitor_name: string;
  phone: string;
  id_card: string;
  company: string;
  visitor_count: number;
  is_driving: boolean;
  license_plate: string;
  contact_person: string;
  department_id: string;
  visit_start_time: string;
  visit_end_time: string;
  visit_purpose: string;
  session_id: string;
}>) {
  return ApplicationModel.create({
    visitor_name: overrides.visitor_name ?? '列表测试访客',
    phone: overrides.phone ?? '13800000000',
    id_card: overrides.id_card ?? null,
    company: overrides.company ?? null,
    visitor_count: overrides.visitor_count ?? 1,
    is_driving: overrides.is_driving ?? false,
    license_plate: overrides.license_plate ?? null,
    contact_person: overrides.contact_person ?? '对接人',
    department_id: overrides.department_id ?? DepartmentModel.findAll()[0].id,
    visit_start_time: overrides.visit_start_time ?? '2024-07-01T09:00:00.000Z',
    visit_end_time: overrides.visit_end_time ?? '2024-07-01T17:00:00.000Z',
    visit_purpose: overrides.visit_purpose ?? '列表测试',
    session_id: overrides.session_id ?? 'fk38-test-session',
  });
}

describe('FK-38: 查询结果列表展示与分页', () => {
  let testApp: ReturnType<typeof createTestApp>;
  let deptId: string;
  let deptId2: string;

  // 用于字段完整性测试的申请 ID
  let appPendingId: string;
  let appApprovedId: string;
  let appVisitedId: string;
  let appDrivingId: string;

  // 用于分页测试的申请 ID 列表（按创建时间从旧到新）
  const pageTestIds: string[] = [];
  const PAGE_TEST_COUNT = 25; // 超过默认 20 条/页，确保多页

  beforeAll(async () => {
    await initDatabase();
    testApp = createTestApp();

    const depts = DepartmentModel.findAll();
    deptId = depts[0].id;
    deptId2 = depts[1].id;

    // ── 字段完整性测试数据 ──

    // 1. pending 状态（无 pass_status）
    const appPending = createTestApp_Record({
      visitor_name: 'FK38-待审批访客',
      phone: '13811110001',
      contact_person: 'FK38对接人A',
      department_id: deptId,
      visit_purpose: 'FK38字段测试-pending',
    });
    appPendingId = appPending.id;

    // 2. approved 状态（pass_status = not_visited）
    const appApproved = createTestApp_Record({
      visitor_name: 'FK38-已同意访客',
      phone: '13811110002',
      company: 'FK38测试公司',
      visitor_count: 3,
      is_driving: true,
      license_plate: '京A12345',
      contact_person: 'FK38对接人B',
      department_id: deptId2,
      visit_purpose: 'FK38字段测试-approved',
    });
    ApplicationModel.updateApprovalStatus(appApproved.id, 'approved', appApproved.version);
    VisitorPassModel.create({ application_id: appApproved.id });
    ApplicationModel.updatePassStatus(appApproved.id, 'not_visited');
    appApprovedId = appApproved.id;

    // 3. approved + visited 状态
    const appVisited = createTestApp_Record({
      visitor_name: 'FK38-已到访访客',
      phone: '13811110003',
      contact_person: 'FK38对接人C',
      department_id: deptId,
      visit_purpose: 'FK38字段测试-visited',
    });
    ApplicationModel.updateApprovalStatus(appVisited.id, 'approved', appVisited.version);
    const pass = VisitorPassModel.create({ application_id: appVisited.id });
    ApplicationModel.updatePassStatus(appVisited.id, 'visited');
    appVisitedId = appVisited.id;

    // 4. 开车访客（含车牌号）
    const appDriving = createTestApp_Record({
      visitor_name: 'FK38-开车访客',
      phone: '13811110004',
      is_driving: true,
      license_plate: '沪B67890',
      contact_person: 'FK38对接人D',
      department_id: deptId,
      visit_purpose: 'FK38字段测试-driving',
    });
    ApplicationModel.updateApprovalStatus(appDriving.id, 'approved', appDriving.version);
    VisitorPassModel.create({ application_id: appDriving.id });
    appDrivingId = appDriving.id;

    // ── 分页测试数据（25 条，同一筛选条件） ──
    for (let i = 0; i < PAGE_TEST_COUNT; i++) {
      const app = createTestApp_Record({
        visitor_name: `FK38-分页访客-${String(i + 1).padStart(2, '0')}`,
        phone: `1381112${String(i).padStart(4, '0')}`,
        visit_purpose: `FK38分页测试数据-${i + 1}`,
        session_id: 'fk38-page-session',
      });
      pageTestIds.push(app.id);
    }
  });

  // ============================================================
  // 场景 1: 结果列表每行字段 — 展示 9 个字段
  // ============================================================
  describe('场景1: 结果列表每行字段完整', () => {
    it('每行包含访客姓名 + 手机号（访客信息）', async () => {
      const res = await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-待审批访客' });

      expect(res.status).toBe(200);
      const item = res.body.data.items.find((i: { id: string }) => i.id === appPendingId);
      expect(item).toBeDefined();
      expect(item.visitor_name).toBe('FK38-待审批访客');
      expect(item.phone).toBe('13811110001');
    });

    it('每行包含对接人 + 部门 ID（对接人/部门）', async () => {
      const res = await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-已同意访客' });

      const item = res.body.data.items.find((i: { id: string }) => i.id === appApprovedId);
      expect(item).toBeDefined();
      expect(item.contact_person).toBe('FK38对接人B');
      expect(item.department_id).toBe(deptId2);
    });

    it('每行包含拜访起始时间 + 结束时间（拜访时间）', async () => {
      const res = await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-已同意访客' });

      const item = res.body.data.items.find((i: { id: string }) => i.id === appApprovedId);
      expect(item.visit_start_time).toBe('2024-07-01T09:00:00.000Z');
      expect(item.visit_end_time).toBe('2024-07-01T17:00:00.000Z');
    });

    it('每行包含访客人数', async () => {
      const res = await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-已同意访客' });

      const item = res.body.data.items.find((i: { id: string }) => i.id === appApprovedId);
      expect(item.visitor_count).toBe(3);
    });

    it('每行包含车牌号（开车时有值，不开车时为 null）', async () => {
      // 开车访客有车牌号
      const resDriving = await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-开车访客' });
      const drivingItem = resDriving.body.data.items.find(
        (i: { id: string }) => i.id === appDrivingId,
      );
      expect(drivingItem.license_plate).toBe('沪B67890');

      // 不开车访客无车牌号
      const resPending = await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-待审批访客' });
      const pendingItem = resPending.body.data.items.find(
        (i: { id: string }) => i.id === appPendingId,
      );
      expect(pendingItem.license_plate).toBeNull();
    });

    it('每行包含到访事宜', async () => {
      const res = await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-已同意访客' });

      const item = res.body.data.items.find((i: { id: string }) => i.id === appApprovedId);
      expect(item.visit_purpose).toBe('FK38字段测试-approved');
    });

    it('每行包含审批状态（覆盖 pending/approved 两种状态）', async () => {
      const resPending = await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-待审批访客' });
      const pendingItem = resPending.body.data.items.find(
        (i: { id: string }) => i.id === appPendingId,
      );
      expect(pendingItem.approval_status).toBe('pending');

      const resApproved = await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-已同意访客' });
      const approvedItem = resApproved.body.data.items.find(
        (i: { id: string }) => i.id === appApprovedId,
      );
      expect(approvedItem.approval_status).toBe('approved');
    });

    it('每行包含通行状态（null=无通行证 / not_visited / visited）', async () => {
      // pending 状态：pass_status = null
      const resPending = await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-待审批访客' });
      const pendingItem = resPending.body.data.items.find(
        (i: { id: string }) => i.id === appPendingId,
      );
      expect(pendingItem.pass_status).toBeNull();

      // approved 状态：pass_status = not_visited
      const resApproved = await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-已同意访客' });
      const approvedItem = resApproved.body.data.items.find(
        (i: { id: string }) => i.id === appApprovedId,
      );
      expect(approvedItem.pass_status).toBe('not_visited');

      // visited 状态：pass_status = visited
      const resVisited = await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-已到访访客' });
      const visitedItem = resVisited.body.data.items.find(
        (i: { id: string }) => i.id === appVisitedId,
      );
      expect(visitedItem.pass_status).toBe('visited');
    });

    it('每行包含 id 作为查看详情入口', async () => {
      const res = await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-待审批访客' });

      const item = res.body.data.items.find((i: { id: string }) => i.id === appPendingId);
      expect(item.id).toBeDefined();
      expect(typeof item.id).toBe('string');
      expect(item.id.length).toBeGreaterThan(0);
    });

    it('单条记录包含全部 9 组字段（完整性汇总验证）', async () => {
      const res = await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-已同意访客' });

      const item = res.body.data.items.find((i: { id: string }) => i.id === appApprovedId);
      expect(item).toBeDefined();

      // 9 组字段对应的数据键
      const requiredKeys = [
        'visitor_name',     // 1. 访客信息（姓名）
        'phone',            // 2. 访客信息（手机号）
        'contact_person',   // 3. 对接人
        'department_id',    // 4. 部门
        'visit_start_time', // 5. 拜访时间（起始）
        'visit_end_time',   // 6. 拜访时间（结束）
        'visitor_count',    // 7. 人数
        'license_plate',    // 8. 车牌号
        'visit_purpose',    // 9. 到访事宜
        'approval_status',  // 10. 审批状态
        'pass_status',      // 11. 通行状态
        'id',               // 12. 查看详情入口
      ];

      for (const key of requiredKeys) {
        expect(item).toHaveProperty(key);
      }
    });
  });

  // ============================================================
  // 场景 2: 默认排序 — 按提交时间倒序
  // ============================================================
  describe('场景2: 默认排序（提交时间倒序）', () => {
    it('无筛选条件时结果按 created_at 倒序排列', async () => {
      const res = await request(testApp)
        .get('/api/records')
        .query({ page_size: 100 });

      expect(res.status).toBe(200);
      const items = res.body.data.items;
      expect(items.length).toBeGreaterThanOrEqual(2);

      // 验证每条记录的 created_at 不小于后一条
      for (let i = 0; i < items.length - 1; i++) {
        const curr = new Date(items[i].created_at).getTime();
        const next = new Date(items[i + 1].created_at).getTime();
        expect(curr).toBeGreaterThanOrEqual(next);
      }
    });

    it('分页查询时仍按 created_at 倒序排列', async () => {
      const res = await request(testApp)
        .get('/api/records')
        .query({ page: 1, page_size: 5 });

      const items = res.body.data.items;
      expect(items.length).toBe(5);

      for (let i = 0; i < items.length - 1; i++) {
        const curr = new Date(items[i].created_at).getTime();
        const next = new Date(items[i + 1].created_at).getTime();
        expect(curr).toBeGreaterThanOrEqual(next);
      }
    });

    it('分页查询第二页的数据时间早于第一页最后一条', async () => {
      const page1 = await request(testApp)
        .get('/api/records')
        .query({ page: 1, page_size: 5 });
      const page2 = await request(testApp)
        .get('/api/records')
        .query({ page: 2, page_size: 5 });

      const lastOfPage1 = new Date(
        page1.body.data.items[page1.body.data.items.length - 1].created_at,
      ).getTime();
      const firstOfPage2 = new Date(page2.body.data.items[0].created_at).getTime();

      // 第二页的第一条应不晚于第一页的最后一条
      expect(firstOfPage2).toBeLessThanOrEqual(lastOfPage1);
    });

    it('分页查询无数据重复（同一 ID 不出现两次）', async () => {
      const page1 = await request(testApp)
        .get('/api/records')
        .query({ page: 1, page_size: 10 });
      const page2 = await request(testApp)
        .get('/api/records')
        .query({ page: 2, page_size: 10 });

      const ids1 = new Set(page1.body.data.items.map((i: { id: string }) => i.id));
      const ids2 = page2.body.data.items.map((i: { id: string }) => i.id);

      for (const id of ids2) {
        expect(ids1.has(id)).toBe(false);
      }
    });
  });

  // ============================================================
  // 场景 3: 首页加载 — 第一页数据 + 分页控件显示总页数
  // ============================================================
  describe('场景3: 首页加载', () => {
    it('默认返回第一页，page=1', async () => {
      const res = await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-分页访客' });

      expect(res.status).toBe(200);
      expect(res.body.data.page).toBe(1);
    });

    it('首页返回 page_size 条数据（当总数超过一页时）', async () => {
      const res = await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-分页访客', page_size: 10 });

      expect(res.body.data.items.length).toBe(10);
    });

    it('total 字段反映符合条件的总记录数', async () => {
      const res = await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-分页访客' });

      expect(res.body.data.total).toBeGreaterThanOrEqual(PAGE_TEST_COUNT);
    });

    it('分页元数据包含 page、page_size、total、items 四个字段', async () => {
      const res = await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-分页访客' });

      const data = res.body.data;
      expect(data).toHaveProperty('items');
      expect(data).toHaveProperty('total');
      expect(data).toHaveProperty('page');
      expect(data).toHaveProperty('page_size');
      expect(Array.isArray(data.items)).toBe(true);
      expect(typeof data.total).toBe('number');
      expect(typeof data.page).toBe('number');
      expect(typeof data.page_size).toBe('number');
    });

    it('page_size 与请求参数一致', async () => {
      const res = await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-分页访客', page_size: 5 });

      expect(res.body.data.page_size).toBe(5);
    });
  });

  // ============================================================
  // 场景 4: 点击下一页/上一页
  // ============================================================
  describe('场景4: 点击下一页/上一页', () => {
    it('page=2 返回第二页数据', async () => {
      const res = await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-分页访客', page: 2, page_size: 10 });

      expect(res.status).toBe(200);
      expect(res.body.data.page).toBe(2);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
    });

    it('第二页数据与第一页无重叠', async () => {
      const page1 = await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-分页访客', page: 1, page_size: 10 });
      const page2 = await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-分页访客', page: 2, page_size: 10 });

      const ids1 = new Set(page1.body.data.items.map((i: { id: string }) => i.id));
      const ids2 = new Set(page2.body.data.items.map((i: { id: string }) => i.id));

      // 两个集合无交集
      for (const id of ids2) {
        expect(ids1.has(id)).toBe(false);
      }
    });

    it('从第二页回到第一页（page=1）返回第一页数据', async () => {
      const page1First = await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-分页访客', page: 1, page_size: 10 });
      // 访问第二页
      await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-分页访客', page: 2, page_size: 10 });
      // 回到第一页
      const page1Again = await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-分页访客', page: 1, page_size: 10 });

      expect(page1Again.body.data.page).toBe(1);
      expect(page1Again.body.data.items.length).toBe(page1First.body.data.items.length);

      // 第一页数据应完全一致
      const ids1 = page1First.body.data.items.map((i: { id: string }) => i.id);
      const ids1Again = page1Again.body.data.items.map((i: { id: string }) => i.id);
      expect(ids1).toEqual(ids1Again);
    });

    it('翻页时 total 保持不变', async () => {
      const page1 = await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-分页访客', page: 1, page_size: 10 });
      const page2 = await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-分页访客', page: 2, page_size: 10 });

      expect(page1.body.data.total).toBe(page2.body.data.total);
    });
  });

  // ============================================================
  // 场景 5: 跳转到指定页
  // ============================================================
  describe('场景5: 跳转到指定页', () => {
    it('直接请求 page=3 返回第三页数据', async () => {
      const res = await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-分页访客', page: 3, page_size: 10 });

      expect(res.status).toBe(200);
      expect(res.body.data.page).toBe(3);
      // 25 条数据，page_size=10，第三页应有 5 条
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
    });

    it('请求超出总页数的页码返回空列表', async () => {
      const res = await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-分页访客', page: 999, page_size: 10 });

      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual([]);
      // total 不为 0（数据存在，只是页码超出）
      expect(res.body.data.total).toBeGreaterThanOrEqual(PAGE_TEST_COUNT);
    });

    it('直接跳转到最后一页返回正确数据', async () => {
      // 先获取总数
      const first = await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-分页访客', page: 1, page_size: 10 });
      const totalPages = Math.ceil(first.body.data.total / 10);

      const lastPage = await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-分页访客', page: totalPages, page_size: 10 });

      expect(lastPage.status).toBe(200);
      expect(lastPage.body.data.page).toBe(totalPages);
      expect(lastPage.body.data.items.length).toBeGreaterThanOrEqual(1);
    });

    it('page=1 是默认值（不传 page 参数时）', async () => {
      const res = await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-分页访客' });

      expect(res.body.data.page).toBe(1);
    });
  });

  // ============================================================
  // 场景 6: 翻页请求失败 — 异常参数处理
  // ============================================================
  describe('场景6: 翻页请求失败（异常参数处理）', () => {
    it('page 为负数时 API 正常响应（不崩溃）', async () => {
      const res = await request(testApp)
        .get('/api/records')
        .query({ page: -1, page_size: 10 });

      // 不应返回 500 错误
      expect(res.status).not.toBe(500);
    });

    it('page 为非数字字符串时 API 正常响应', async () => {
      const res = await request(testApp)
        .get('/api/records')
        .query({ page: 'abc' });

      expect(res.status).not.toBe(500);
    });

    it('page_size 为非数字字符串时 API 正常响应', async () => {
      const res = await request(testApp)
        .get('/api/records')
        .query({ page_size: 'xyz' });

      expect(res.status).not.toBe(500);
    });

    it('page_size 为 0 时 API 不崩溃', async () => {
      const res = await request(testApp)
        .get('/api/records')
        .query({ page: 1, page_size: 0 });

      expect(res.status).not.toBe(500);
    });

    it('超出范围的大页码返回空列表而非错误', async () => {
      const res = await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-分页访客', page: 10000, page_size: 20 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.items).toEqual([]);
    });
  });

  // ============================================================
  // 场景 7: 数据量超过 1 页 — 分页控件正常显示
  // ============================================================
  describe('场景7: 数据量超过1页', () => {
    it('total > page_size 时分页有意义（total/page_size > 1）', async () => {
      const res = await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-分页访客', page_size: 10 });

      const totalPages = Math.ceil(res.body.data.total / res.body.data.page_size);
      expect(totalPages).toBeGreaterThanOrEqual(2);
    });

    it('逐页浏览可覆盖全部数据', async () => {
      const pageSize = 10;
      const first = await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-分页访客', page: 1, page_size: pageSize });

      const total = first.body.data.total;
      const totalPages = Math.ceil(total / pageSize);
      const allIds = new Set<string>();

      for (let p = 1; p <= totalPages; p++) {
        const res = await request(testApp)
          .get('/api/records')
          .query({ name: 'FK38-分页访客', page: p, page_size: pageSize });

        for (const item of res.body.data.items) {
          allIds.add(item.id);
        }
      }

      // 所有页的 ID 总数应等于 total
      expect(allIds.size).toBe(total);
    });

    it('逐页浏览无重复数据', async () => {
      const pageSize = 10;
      const first = await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-分页访客', page: 1, page_size: pageSize });

      const totalPages = Math.ceil(first.body.data.total / pageSize);
      const allIds: string[] = [];

      for (let p = 1; p <= totalPages; p++) {
        const res = await request(testApp)
          .get('/api/records')
          .query({ name: 'FK38-分页访客', page: p, page_size: pageSize });

        for (const item of res.body.data.items) {
          allIds.push(item.id);
        }
      }

      // 无重复
      expect(new Set(allIds).size).toBe(allIds.length);
    });

    it('每页 page_size 一致，最后一页可不满', async () => {
      const pageSize = 10;
      const first = await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-分页访客', page: 1, page_size: pageSize });
      const totalPages = Math.ceil(first.body.data.total / pageSize);

      // 非最后一页都应有 page_size 条数据
      for (let p = 1; p < totalPages; p++) {
        const res = await request(testApp)
          .get('/api/records')
          .query({ name: 'FK38-分页访客', page: p, page_size: pageSize });
        expect(res.body.data.items.length).toBe(pageSize);
      }

      // 最后一页可以有 1~page_size 条
      const lastRes = await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-分页访客', page: totalPages, page_size: pageSize });
      expect(lastRes.body.data.items.length).toBeGreaterThanOrEqual(1);
      expect(lastRes.body.data.items.length).toBeLessThanOrEqual(pageSize);
    });
  });

  // ============================================================
  // 场景 8: 列表数据不可篡改 — 无编辑入口，仅可查看
  // ============================================================
  describe('场景8: 列表数据不可篡改（只读）', () => {
    it('GET /api/records 不修改任何记录数据（连续两次查询结果一致）', async () => {
      const res1 = await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-已同意访客' });
      const res2 = await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-已同意访客' });

      const items1 = res1.body.data.items.find((i: { id: string }) => i.id === appApprovedId);
      const items2 = res2.body.data.items.find((i: { id: string }) => i.id === appApprovedId);

      expect(items1).toEqual(items2);
    });

    it('GET /api/records 返回的数据结构与 Model 层一致（不可篡改字段齐全）', async () => {
      const res = await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-已同意访客' });

      const item = res.body.data.items.find((i: { id: string }) => i.id === appApprovedId);

      // 验证与数据库直接查询的字段完全一致
      const dbItem = ApplicationModel.findById(appApprovedId);
      expect(dbItem).not.toBeNull();

      expect(item.visitor_name).toBe(dbItem!.visitor_name);
      expect(item.phone).toBe(dbItem!.phone);
      expect(item.visitor_count).toBe(dbItem!.visitor_count);
      expect(item.approval_status).toBe(dbItem!.approval_status);
      expect(item.pass_status).toBe(dbItem!.pass_status);
      expect(item.visit_purpose).toBe(dbItem!.visit_purpose);
    });

    it('记录查询 API 只有 GET 方法（无 POST/PUT/PATCH/DELETE）', async () => {
      // POST /api/records → 404
      const postRes = await request(testApp)
        .post('/api/records')
        .send({ visitor_name: '恶意篡改' });
      expect(postRes.status).toBe(404);

      // PUT /api/records → 404
      const putRes = await request(testApp)
        .put('/api/records/some-id')
        .send({ visitor_name: '恶意修改' });
      expect(putRes.status).toBe(404);

      // PATCH /api/records → 404
      const patchRes = await request(testApp)
        .patch('/api/records/some-id')
        .send({ visitor_name: '恶意修改' });
      expect(patchRes.status).toBe(404);

      // DELETE /api/records → 404
      const deleteRes = await request(testApp)
        .delete('/api/records/some-id');
      expect(deleteRes.status).toBe(404);
    });

    it('GET 请求后数据保持不变（approval_status 不被查询修改）', async () => {
      // 查询前的状态
      const before = ApplicationModel.findById(appApprovedId);
      expect(before!.approval_status).toBe('approved');

      // 执行多次查询
      await request(testApp).get('/api/records').query({ name: 'FK38' });
      await request(testApp).get('/api/records').query({ name: 'FK38' });
      await request(testApp).get('/api/records').query({ name: 'FK38' });

      // 查询后状态不变
      const after = ApplicationModel.findById(appApprovedId);
      expect(after!.approval_status).toBe('approved');
      expect(after!.visitor_name).toBe(before!.visitor_name);
      expect(after!.pass_status).toBe(before!.pass_status);
    });

    it('GET 请求后 total 不变（查询不新增/删除记录）', async () => {
      const res1 = await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-分页访客' });
      const total1 = res1.body.data.total;

      // 执行查询
      await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-分页访客' });

      const res2 = await request(testApp)
        .get('/api/records')
        .query({ name: 'FK38-分页访客' });
      const total2 = res2.body.data.total;

      expect(total1).toBe(total2);
    });
  });
});
