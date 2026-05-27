import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { initDatabase, getDatabase } from '../../src/backend/config';
import { DepartmentModel } from '../../src/backend/models/department';
import { ApplicationModel } from '../../src/backend/models/application';
import { ApprovalRecordModel } from '../../src/backend/models/approval-record';
import { VisitorPassModel } from '../../src/backend/models/visitor-pass';
import { DraftModel } from '../../src/backend/models/draft';

describe('Backend Models', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  describe('DepartmentModel', () => {
    it('findAll returns seeded departments', () => {
      const depts = DepartmentModel.findAll();
      expect(depts.length).toBe(12);
      expect(depts[0].name).toBe('教务处');
      expect(depts[0]).toHaveProperty('sort_order');
    });

    it('findById returns a department', () => {
      const depts = DepartmentModel.findAll();
      const dept = DepartmentModel.findById(depts[0].id);
      expect(dept).not.toBeNull();
      expect(dept!.name).toBe('教务处');
    });

    it('findById returns null for nonexistent id', () => {
      const dept = DepartmentModel.findById('nonexistent');
      expect(dept).toBeNull();
    });

    it('findByName returns a department', () => {
      const dept = DepartmentModel.findByName('保卫处');
      expect(dept).not.toBeNull();
      expect(dept!.name).toBe('保卫处');
    });
  });

  describe('ApplicationModel', () => {
    let testDeptId: string;

    beforeAll(() => {
      const depts = DepartmentModel.findAll();
      testDeptId = depts[0].id;
    });

    it('create and findById', () => {
      const app = ApplicationModel.create({
        visitor_name: '张三',
        phone: '13800138000',
        visitor_count: 2,
        is_driving: false,
        contact_person: '李四',
        department_id: testDeptId,
        visit_start_time: '2024-03-01T09:00:00.000Z',
        visit_end_time: '2024-03-01T17:00:00.000Z',
        visit_purpose: '业务交流',
        session_id: 'test-session-1',
      });

      expect(app.id).toBeDefined();
      expect(app.visitor_name).toBe('张三');
      expect(app.approval_status).toBe('pending');
      expect(app.pass_status).toBeNull();
      expect(app.is_driving).toBe(false);

      const found = ApplicationModel.findById(app.id);
      expect(found).not.toBeNull();
      expect(found!.visitor_name).toBe('张三');
    });

    it('create with optional fields', () => {
      const app = ApplicationModel.create({
        visitor_name: '王五',
        phone: '13900139000',
        id_card: '110101199001011234',
        company: '测试公司',
        visitor_count: 1,
        is_driving: true,
        license_plate: '京A12345',
        contact_person: '赵六',
        department_id: testDeptId,
        visit_start_time: '2024-03-02T09:00:00.000Z',
        visit_end_time: '2024-03-02T12:00:00.000Z',
        visit_purpose: '面试',
        session_id: 'test-session-2',
      });

      expect(app.id_card).toBe('110101199001011234');
      expect(app.company).toBe('测试公司');
      expect(app.is_driving).toBe(true);
      expect(app.license_plate).toBe('京A12345');
    });

    it('query by session_id', () => {
      const result = ApplicationModel.query({ session_id: 'test-session-1' });
      expect(result.items.length).toBeGreaterThanOrEqual(1);
      expect(result.items.every(a => a.session_id === 'test-session-1')).toBe(true);
    });

    it('query by approval_status', () => {
      const result = ApplicationModel.query({ approval_status: 'pending' });
      expect(result.items.length).toBeGreaterThanOrEqual(1);
    });

    it('recordQuery with multiple filters', () => {
      const result = ApplicationModel.recordQuery({
        visitor_name: '张',
        department_id: testDeptId,
      });
      expect(result.items.length).toBeGreaterThanOrEqual(1);
    });

    it('updateApprovalStatus', () => {
      const app = ApplicationModel.create({
        visitor_name: '测试更新',
        phone: '13700137000',
        visitor_count: 1,
        is_driving: false,
        contact_person: '联系人',
        department_id: testDeptId,
        visit_start_time: '2024-03-03T09:00:00.000Z',
        visit_end_time: '2024-03-03T17:00:00.000Z',
        visit_purpose: '测试',
        session_id: 'test-session-update',
      });

      ApplicationModel.updateApprovalStatus(app.id, 'approved', app.version);
      const updated = ApplicationModel.findById(app.id);
      expect(updated!.approval_status).toBe('approved');
      expect(updated!.version).toBe(app.version + 1);
    });

    it('updatePassStatus', () => {
      const app = ApplicationModel.create({
        visitor_name: '通行测试',
        phone: '13600136000',
        visitor_count: 1,
        is_driving: false,
        contact_person: '联系人',
        department_id: testDeptId,
        visit_start_time: '2024-03-04T09:00:00.000Z',
        visit_end_time: '2024-03-04T17:00:00.000Z',
        visit_purpose: '通行测试',
        session_id: 'test-session-pass',
      });

      ApplicationModel.updatePassStatus(app.id, 'not_visited');
      const updated = ApplicationModel.findById(app.id);
      expect(updated!.pass_status).toBe('not_visited');
    });

    it('updateFields resets status to pending', () => {
      const app = ApplicationModel.create({
        visitor_name: '退回重提',
        phone: '13500135000',
        visitor_count: 1,
        is_driving: false,
        contact_person: '联系人',
        department_id: testDeptId,
        visit_start_time: '2024-03-05T09:00:00.000Z',
        visit_end_time: '2024-03-05T17:00:00.000Z',
        visit_purpose: '原始目的',
        session_id: 'test-session-return',
      });

      ApplicationModel.updateApprovalStatus(app.id, 'returned', app.version);
      ApplicationModel.updateFields(app.id, { visit_purpose: '更新后的目的' });

      const updated = ApplicationModel.findById(app.id);
      expect(updated!.approval_status).toBe('pending');
      expect(updated!.visit_purpose).toBe('更新后的目的');
    });

    it('findBySessionId', () => {
      const apps = ApplicationModel.findBySessionId('test-session-1');
      expect(apps.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('ApprovalRecordModel', () => {
    let testAppId: string;

    beforeAll(() => {
      const depts = DepartmentModel.findAll();
      const app = ApplicationModel.create({
        visitor_name: '审批记录测试',
        phone: '13400134000',
        visitor_count: 1,
        is_driving: false,
        contact_person: '联系人',
        department_id: depts[0].id,
        visit_start_time: '2024-03-06T09:00:00.000Z',
        visit_end_time: '2024-03-06T17:00:00.000Z',
        visit_purpose: '测试审批记录',
        session_id: 'test-session-approval',
      });
      testAppId = app.id;
    });

    it('create and findByApplicationId', () => {
      const record = ApprovalRecordModel.create({
        application_id: testAppId,
        operation_type: 'approve',
        reason: '同意来访',
        operator_session_id: 'admin-session',
        operated_at: new Date().toISOString(),
      });

      expect(record.id).toBeDefined();
      expect(record.operation_type).toBe('approve');

      const records = ApprovalRecordModel.findByApplicationId(testAppId);
      expect(records.length).toBe(1);
      expect(records[0].reason).toBe('同意来访');
    });

    it('existsByApplicationAndSession', () => {
      expect(
        ApprovalRecordModel.existsByApplicationAndSession(testAppId, 'admin-session')
      ).toBe(true);
      expect(
        ApprovalRecordModel.existsByApplicationAndSession(testAppId, 'other-session')
      ).toBe(false);
    });

    it('create without reason', () => {
      const record = ApprovalRecordModel.create({
        application_id: testAppId,
        operation_type: 'return',
        operator_session_id: 'admin-session-2',
        operated_at: new Date().toISOString(),
      });
      expect(record.reason).toBeNull();
    });
  });

  describe('VisitorPassModel', () => {
    let testAppId: string;

    beforeAll(() => {
      const depts = DepartmentModel.findAll();
      const app = ApplicationModel.create({
        visitor_name: '通行证测试',
        phone: '13300133000',
        visitor_count: 1,
        is_driving: false,
        contact_person: '联系人',
        department_id: depts[0].id,
        visit_start_time: '2024-03-07T09:00:00.000Z',
        visit_end_time: '2024-03-07T17:00:00.000Z',
        visit_purpose: '测试通行证',
        session_id: 'test-session-pass-model',
      });
      testAppId = app.id;
    });

    it('create and findById', () => {
      const pass = VisitorPassModel.create({ application_id: testAppId });
      expect(pass.id).toBeDefined();
      expect(pass.pass_status).toBe('not_visited');
      expect(pass.actual_visit_time).toBeNull();

      const found = VisitorPassModel.findById(pass.id);
      expect(found).not.toBeNull();
    });

    it('findByApplicationId', () => {
      const pass = VisitorPassModel.findByApplicationId(testAppId);
      expect(pass).not.toBeNull();
    });

    it('confirmVisit', () => {
      const pass = VisitorPassModel.findByApplicationId(testAppId)!;
      VisitorPassModel.confirmVisit(pass.id);

      const updated = VisitorPassModel.findById(pass.id);
      expect(updated!.pass_status).toBe('visited');
      expect(updated!.actual_visit_time).not.toBeNull();
    });

    it('confirmVisit is idempotent-safe (throws on duplicate)', () => {
      const pass = VisitorPassModel.findByApplicationId(testAppId)!;
      expect(() => VisitorPassModel.confirmVisit(pass.id)).toThrow('已确认到访');
    });

    it('query with filter', () => {
      const result = VisitorPassModel.query({ pass_status: 'visited' });
      expect(result.items.length).toBeGreaterThanOrEqual(1);
    });

    it('search by keyword', () => {
      const result = VisitorPassModel.search('通行证测试');
      expect(result.items.length).toBeGreaterThanOrEqual(1);
      expect(result.items[0].visitor_name).toBe('通行证测试');
    });
  });

  describe('DraftModel', () => {
    it('save and findBySessionId (new application scenario)', () => {
      const draft = DraftModel.save({
        session_id: 'draft-session-1',
        form_data: JSON.stringify({ visitor_name: '草稿测试' }),
      });

      expect(draft.id).toBeDefined();
      expect(draft.application_id).toBeNull();

      const found = DraftModel.findBySessionId('draft-session-1');
      expect(found).not.toBeNull();
      expect(JSON.parse(found!.form_data).visitor_name).toBe('草稿测试');
    });

    it('save upserts for same session_id (new app scenario)', () => {
      DraftModel.save({
        session_id: 'draft-session-1',
        form_data: JSON.stringify({ visitor_name: '更新后的草稿' }),
      });

      const found = DraftModel.findBySessionId('draft-session-1');
      expect(JSON.parse(found!.form_data).visitor_name).toBe('更新后的草稿');
    });

    it('save and findBySessionAndApplication (return scenario)', () => {
      const depts = DepartmentModel.findAll();
      const app = ApplicationModel.create({
        visitor_name: '退回草稿测试',
        phone: '13200132000',
        visitor_count: 1,
        is_driving: false,
        contact_person: '联系人',
        department_id: depts[0].id,
        visit_start_time: '2024-03-08T09:00:00.000Z',
        visit_end_time: '2024-03-08T17:00:00.000Z',
        visit_purpose: '测试',
        session_id: 'draft-return-session',
      });

      const draft = DraftModel.save({
        session_id: 'draft-return-session',
        application_id: app.id,
        form_data: JSON.stringify({ visitor_name: '修改后的名字' }),
      });

      expect(draft.application_id).toBe(app.id);

      const found = DraftModel.findBySessionAndApplication('draft-return-session', app.id);
      expect(found).not.toBeNull();
    });

    it('deleteBySessionAndApplication', () => {
      DraftModel.deleteBySessionAndApplication('draft-session-1', null);
      const found = DraftModel.findBySessionId('draft-session-1');
      expect(found).toBeNull();
    });
  });
});
