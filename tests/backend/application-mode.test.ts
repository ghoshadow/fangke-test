import { describe, it, expect, beforeAll } from 'vitest';
import { initDatabase } from '../../src/backend/config';
import { DepartmentModel } from '../../src/backend/models/department';
import { ApplicationModel } from '../../src/backend/models/application';
import { ApprovalRecordModel } from '../../src/backend/models/approval-record';
import { VisitorPassModel } from '../../src/backend/models/visitor-pass';
import { validateApplication } from '../../src/backend/validators/application';
import type { CreateApplicationInput } from '../../src/shared/types';

/**
 * FK-30: 申请模式适配测试（自主申请 + 代申请）
 *
 * 验证自主申请与教职工代申请共用同一表单模板，
 * 字段、校验规则、提交流程完全一致。
 */
describe('申请模式适配（自主申请+代申请）', () => {
  let deptId: string;

  beforeAll(async () => {
    await initDatabase();
    const depts = DepartmentModel.findAll();
    deptId = depts[0].id;
  });

  // ==========================================================
  // 场景 1 & 2：两种模式的表单字段完全一致
  // ==========================================================
  describe('表单字段一致性', () => {
    it('自主申请：访客本人提交，14 个字段完整存储', () => {
      const input: CreateApplicationInput = {
        visitor_name: '自主访客',
        phone: '13800000001',
        id_card: '110101199001011234',
        company: '外部单位A',
        visitor_count: 2,
        is_driving: true,
        license_plate: '京A12345',
        contact_person: '校内对接人',
        department_id: deptId,
        visit_start_time: '2024-05-01T09:00:00.000Z',
        visit_end_time: '2024-05-01T17:00:00.000Z',
        visit_purpose: '自主申请业务交流',
        attachment_url: null,
        session_id: 'visitor-self-session',
      };

      const app = ApplicationModel.create(input);

      expect(app.id).toBeDefined();
      expect(app.visitor_name).toBe('自主访客');
      expect(app.phone).toBe('13800000001');
      expect(app.id_card).toBe('110101199001011234');
      expect(app.company).toBe('外部单位A');
      expect(app.visitor_count).toBe(2);
      expect(app.is_driving).toBe(true);
      expect(app.license_plate).toBe('京A12345');
      expect(app.contact_person).toBe('校内对接人');
      expect(app.department_id).toBe(deptId);
      expect(app.visit_start_time).toBe('2024-05-01T09:00:00.000Z');
      expect(app.visit_end_time).toBe('2024-05-01T17:00:00.000Z');
      expect(app.visit_purpose).toBe('自主申请业务交流');
      expect(app.attachment_url).toBeNull();
      expect(app.session_id).toBe('visitor-self-session');
      // 初始状态
      expect(app.approval_status).toBe('pending');
      expect(app.pass_status).toBeNull();
    });

    it('代申请：教职工代访客提交，同样 14 个字段完整存储', () => {
      const input: CreateApplicationInput = {
        visitor_name: '代申请访客',
        phone: '13800000002',
        id_card: '110101199002022345',
        company: '外部单位B',
        visitor_count: 3,
        is_driving: false,
        license_plate: null,
        contact_person: '教职工代申请人',
        department_id: deptId,
        visit_start_time: '2024-05-02T09:00:00.000Z',
        visit_end_time: '2024-05-02T17:00:00.000Z',
        visit_purpose: '代申请业务交流',
        attachment_url: null,
        session_id: 'staff-proxy-session',
      };

      const app = ApplicationModel.create(input);

      expect(app.id).toBeDefined();
      expect(app.visitor_name).toBe('代申请访客');
      expect(app.phone).toBe('13800000002');
      expect(app.id_card).toBe('110101199002022345');
      expect(app.company).toBe('外部单位B');
      expect(app.visitor_count).toBe(3);
      expect(app.is_driving).toBe(false);
      expect(app.license_plate).toBeNull();
      expect(app.contact_person).toBe('教职工代申请人');
      expect(app.department_id).toBe(deptId);
      expect(app.visit_start_time).toBe('2024-05-02T09:00:00.000Z');
      expect(app.visit_end_time).toBe('2024-05-02T17:00:00.000Z');
      expect(app.visit_purpose).toBe('代申请业务交流');
      expect(app.attachment_url).toBeNull();
      expect(app.session_id).toBe('staff-proxy-session');
      // 初始状态与自主申请一致
      expect(app.approval_status).toBe('pending');
      expect(app.pass_status).toBeNull();
    });

    it('两种模式创建的数据结构完全相同（字段名和类型一致）', () => {
      const selfInput: CreateApplicationInput = {
        visitor_name: '结构对比-自主',
        phone: '13800000010',
        visitor_count: 1,
        is_driving: false,
        contact_person: '对接人A',
        department_id: deptId,
        visit_start_time: '2024-05-03T09:00:00.000Z',
        visit_end_time: '2024-05-03T17:00:00.000Z',
        visit_purpose: '结构对比',
        session_id: 'self-session-struct',
      };

      const proxyInput: CreateApplicationInput = {
        visitor_name: '结构对比-代申请',
        phone: '13800000011',
        visitor_count: 1,
        is_driving: false,
        contact_person: '对接人B',
        department_id: deptId,
        visit_start_time: '2024-05-03T09:00:00.000Z',
        visit_end_time: '2024-05-03T17:00:00.000Z',
        visit_purpose: '结构对比',
        session_id: 'proxy-session-struct',
      };

      const selfApp = ApplicationModel.create(selfInput);
      const proxyApp = ApplicationModel.create(proxyInput);

      // 两种模式返回的对象具有完全相同的 key 集合
      const selfKeys = Object.keys(selfApp).sort();
      const proxyKeys = Object.keys(proxyApp).sort();
      expect(selfKeys).toEqual(proxyKeys);

      // 验证所有预期的 14+ 个字段都存在
      const expectedFields = [
        'id', 'visitor_name', 'phone', 'id_card', 'company',
        'visitor_count', 'is_driving', 'license_plate',
        'contact_person', 'department_id',
        'visit_start_time', 'visit_end_time',
        'visit_purpose', 'attachment_url',
        'approval_status', 'pass_status', 'session_id',
        'version', 'created_at', 'updated_at',
      ];
      for (const field of expectedFields) {
        expect(selfKeys).toContain(field);
      }
    });
  });

  // ==========================================================
  // 场景 2（续）：校验规则一致性
  // ==========================================================
  describe('校验规则一致性（同一套 validateApplication）', () => {
    const validBase = {
      visitor_name: '测试访客',
      phone: '13800000099',
      visitor_count: 1,
      is_driving: false,
      contact_person: '对接人',
      department_id: 'some-dept',
      visit_start_time: '2024-06-01T09:00:00.000Z',
      visit_end_time: '2024-06-01T17:00:00.000Z',
      visit_purpose: '校验测试',
      session_id: 'validation-test',
    };

    it('自主申请和代申请使用同一校验函数，无差异', () => {
      // 自主申请的数据
      const selfData = { ...validBase, session_id: 'self-validate' };
      // 代申请的数据（仅 session_id 不同，代表提交者不同）
      const proxyData = { ...validBase, session_id: 'proxy-validate' };

      const selfErrors = validateApplication(selfData);
      const proxyErrors = validateApplication(proxyData);

      // 两者校验结果完全一致
      expect(Object.keys(selfErrors).length).toBe(0);
      expect(Object.keys(proxyErrors).length).toBe(0);
    });

    it('同样的错误数据，无论申请模式，校验结果一致', () => {
      const invalidSelf = { ...validBase, phone: '123', session_id: 'self-invalid' };
      const invalidProxy = { ...invalidSelf, session_id: 'proxy-invalid' };

      const selfErrors = validateApplication(invalidSelf);
      const proxyErrors = validateApplication(invalidProxy);

      expect(selfErrors).toEqual(proxyErrors);
      expect(selfErrors.phone).toBeDefined();
    });

    it('13 条校验规则对两种模式无差别执行', () => {
      // 逐条验证核心规则对两种 session 的输入一视同仁
      const testCases: Array<{ field: string; data: Partial<CreateApplicationInput> }> = [
        { field: 'visitor_name', data: { ...validBase, visitor_name: '' } },
        { field: 'phone', data: { ...validBase, phone: 'abc' } },
        { field: 'visitor_count', data: { ...validBase, visitor_count: 0 } },
        { field: 'is_driving', data: { ...validBase, is_driving: undefined } },
        { field: 'license_plate', data: { ...validBase, is_driving: true, license_plate: '' } },
        { field: 'contact_person', data: { ...validBase, contact_person: '' } },
        { field: 'department_id', data: { ...validBase, department_id: '' } },
        { field: 'visit_purpose', data: { ...validBase, visit_purpose: '' } },
      ];

      for (const tc of testCases) {
        const selfResult = validateApplication({ ...tc.data, session_id: 'self' });
        const proxyResult = validateApplication({ ...tc.data, session_id: 'proxy' });
        expect(selfResult).toEqual(proxyResult);
        expect(Object.keys(selfResult)).toContain(tc.field);
      }
    });
  });

  // ==========================================================
  // 场景 3：代申请提交后进入审批流程，与自主申请一致
  // ==========================================================
  describe('提交流程一致性', () => {
    let selfAppId: string;
    let proxyAppId: string;

    beforeAll(() => {
      // 自主申请
      const selfApp = ApplicationModel.create({
        visitor_name: '流程对比-自主',
        phone: '13900000001',
        visitor_count: 1,
        is_driving: false,
        contact_person: '对接人X',
        department_id: deptId,
        visit_start_time: '2024-05-10T09:00:00.000Z',
        visit_end_time: '2024-05-10T17:00:00.000Z',
        visit_purpose: '自主申请流程测试',
        session_id: 'flow-self-session',
      });
      selfAppId = selfApp.id;

      // 代申请
      const proxyApp = ApplicationModel.create({
        visitor_name: '流程对比-代申请',
        phone: '13900000002',
        visitor_count: 1,
        is_driving: false,
        contact_person: '对接人Y',
        department_id: deptId,
        visit_start_time: '2024-05-11T09:00:00.000Z',
        visit_end_time: '2024-05-11T17:00:00.000Z',
        visit_purpose: '代申请流程测试',
        session_id: 'flow-proxy-session',
      });
      proxyAppId = proxyApp.id;
    });

    it('两种模式提交后初始状态均为 pending', () => {
      const selfApp = ApplicationModel.findById(selfAppId)!;
      const proxyApp = ApplicationModel.findById(proxyAppId)!;

      expect(selfApp.approval_status).toBe('pending');
      expect(proxyApp.approval_status).toBe('pending');
      expect(selfApp.pass_status).toBeNull();
      expect(proxyApp.pass_status).toBeNull();
    });

    it('两种模式审批通过后均生成通行证，状态一致', () => {
      // 审批自主申请
      ApprovalRecordModel.create({
        application_id: selfAppId,
        operation_type: 'approve',
        reason: null,
        operator_session_id: 'approver-1',
        operated_at: new Date().toISOString(),
      });
      ApplicationModel.updateApprovalStatus(selfAppId, 'approved', 1);
      VisitorPassModel.create({ application_id: selfAppId });

      // 审批代申请
      ApprovalRecordModel.create({
        application_id: proxyAppId,
        operation_type: 'approve',
        reason: null,
        operator_session_id: 'approver-2',
        operated_at: new Date().toISOString(),
      });
      ApplicationModel.updateApprovalStatus(proxyAppId, 'approved', 1);
      VisitorPassModel.create({ application_id: proxyAppId });

      const selfApp = ApplicationModel.findById(selfAppId)!;
      const proxyApp = ApplicationModel.findById(proxyAppId)!;

      expect(selfApp.approval_status).toBe('approved');
      expect(proxyApp.approval_status).toBe('approved');

      const selfPass = VisitorPassModel.findByApplicationId(selfAppId);
      const proxyPass = VisitorPassModel.findByApplicationId(proxyAppId);

      expect(selfPass).not.toBeNull();
      expect(proxyPass).not.toBeNull();
      expect(selfPass!.pass_status).toBe('not_visited');
      expect(proxyPass!.pass_status).toBe('not_visited');
    });

    it('两种模式的审批记录结构相同', () => {
      const selfRecords = ApprovalRecordModel.findByApplicationId(selfAppId);
      const proxyRecords = ApprovalRecordModel.findByApplicationId(proxyAppId);

      expect(selfRecords.length).toBe(1);
      expect(proxyRecords.length).toBe(1);

      // 记录结构一致
      expect(Object.keys(selfRecords[0]).sort()).toEqual(Object.keys(proxyRecords[0]).sort());
      expect(selfRecords[0].operation_type).toBe('approve');
      expect(proxyRecords[0].operation_type).toBe('approve');
    });
  });

  // ==========================================================
  // 场景 4：代申请中对接人设为教职工本人
  // ==========================================================
  describe('代申请对接人为教职工本人', () => {
    it('教职工代申请，对接人填写自己，表单正常创建', () => {
      const staffSession = 'staff-is-contact-session';
      const staffName = '王教授';

      const app = ApplicationModel.create({
        visitor_name: '来访客人',
        phone: '13700000088',
        visitor_count: 1,
        is_driving: false,
        contact_person: staffName, // 对接人就是代申请的教职工本人
        department_id: deptId,
        visit_start_time: '2024-05-15T09:00:00.000Z',
        visit_end_time: '2024-05-15T17:00:00.000Z',
        visit_purpose: '学术访问',
        session_id: staffSession,
      });

      expect(app.id).toBeDefined();
      expect(app.contact_person).toBe(staffName);
      expect(app.session_id).toBe(staffSession);
      expect(app.approval_status).toBe('pending');
    });

    it('对接人为教职工时，校验规则正常通过', () => {
      const data: Partial<CreateApplicationInput> = {
        visitor_name: '来访客人',
        phone: '13700000088',
        visitor_count: 1,
        is_driving: false,
        contact_person: '王教授', // 教职工本人作为对接人
        department_id: deptId,
        visit_start_time: '2024-05-15T09:00:00.000Z',
        visit_end_time: '2024-05-15T17:00:00.000Z',
        visit_purpose: '学术访问',
        session_id: 'staff-contact-validate',
      };

      const errors = validateApplication(data);
      expect(Object.keys(errors).length).toBe(0);
    });

    it('对接人为教职工时，审批流程正常走通', () => {
      const staffSession = 'staff-contact-flow-session';
      const staffName = '李主任';

      const app = ApplicationModel.create({
        visitor_name: '重要来宾',
        phone: '13600000077',
        visitor_count: 5,
        is_driving: true,
        license_plate: '沪B88888',
        contact_person: staffName,
        department_id: deptId,
        visit_start_time: '2024-05-20T08:00:00.000Z',
        visit_end_time: '2024-05-20T18:00:00.000Z',
        visit_purpose: '校企合作考察',
        session_id: staffSession,
      });

      // 审批通过
      ApprovalRecordModel.create({
        application_id: app.id,
        operation_type: 'approve',
        reason: null,
        operator_session_id: 'senior-approver',
        operated_at: new Date().toISOString(),
      });
      ApplicationModel.updateApprovalStatus(app.id, 'approved', 1);
      VisitorPassModel.create({ application_id: app.id });

      const updated = ApplicationModel.findById(app.id)!;
      expect(updated.approval_status).toBe('approved');
      expect(updated.contact_person).toBe(staffName);

      const pass = VisitorPassModel.findByApplicationId(app.id);
      expect(pass).not.toBeNull();
      expect(pass!.pass_status).toBe('not_visited');
    });
  });

  // ==========================================================
  // 场景 5：两种模式提交后状态流转完全一致
  // ==========================================================
  describe('状态流转一致性', () => {
    it('自主申请和代申请均进入 pending → approved → visited 完整生命周期', () => {
      // 创建自主申请
      const selfApp = ApplicationModel.create({
        visitor_name: '生命周期-自主',
        phone: '13500000001',
        visitor_count: 1,
        is_driving: false,
        contact_person: '对接人S',
        department_id: deptId,
        visit_start_time: '2024-06-01T09:00:00.000Z',
        visit_end_time: '2024-06-01T17:00:00.000Z',
        visit_purpose: '生命周期测试-自主',
        session_id: 'lifecycle-self',
      });

      // 创建代申请
      const proxyApp = ApplicationModel.create({
        visitor_name: '生命周期-代申请',
        phone: '13500000002',
        visitor_count: 1,
        is_driving: false,
        contact_person: '对接人P',
        department_id: deptId,
        visit_start_time: '2024-06-02T09:00:00.000Z',
        visit_end_time: '2024-06-02T17:00:00.000Z',
        visit_purpose: '生命周期测试-代申请',
        session_id: 'lifecycle-proxy',
      });

      // === 阶段 1：初始状态均为 pending ===
      expect(selfApp.approval_status).toBe('pending');
      expect(proxyApp.approval_status).toBe('pending');

      // === 阶段 2：审批通过 ===
      for (const appId of [selfApp.id, proxyApp.id]) {
        ApprovalRecordModel.create({
          application_id: appId,
          operation_type: 'approve',
          reason: null,
          operator_session_id: 'lifecycle-approver',
          operated_at: new Date().toISOString(),
        });
        ApplicationModel.updateApprovalStatus(appId, 'approved', 1);
        VisitorPassModel.create({ application_id: appId });
      }

      const selfApproved = ApplicationModel.findById(selfApp.id)!;
      const proxyApproved = ApplicationModel.findById(proxyApp.id)!;
      expect(selfApproved.approval_status).toBe('approved');
      expect(proxyApproved.approval_status).toBe('approved');

      // === 阶段 3：确认到访 ===
      const selfPass = VisitorPassModel.findByApplicationId(selfApp.id)!;
      const proxyPass = VisitorPassModel.findByApplicationId(proxyApp.id)!;

      VisitorPassModel.confirmVisit(selfPass.id, '10:00');
      VisitorPassModel.confirmVisit(proxyPass.id, '10:30');

      ApplicationModel.updatePassStatus(selfApp.id, 'visited');
      ApplicationModel.updatePassStatus(proxyApp.id, 'visited');

      const selfFinal = ApplicationModel.findById(selfApp.id)!;
      const proxyFinal = ApplicationModel.findById(proxyApp.id)!;

      // 两种模式最终状态完全一致
      expect(selfFinal.approval_status).toBe('approved');
      expect(proxyFinal.approval_status).toBe('approved');
      expect(selfFinal.pass_status).toBe('visited');
      expect(proxyFinal.pass_status).toBe('visited');
    });

    it('自主申请和代申请均支持 pending → returned → pending 退回重提流程', () => {
      // 创建自主申请
      const selfApp = ApplicationModel.create({
        visitor_name: '退回-自主',
        phone: '13400000001',
        visitor_count: 1,
        is_driving: false,
        contact_person: '对接人R1',
        department_id: deptId,
        visit_start_time: '2024-06-10T09:00:00.000Z',
        visit_end_time: '2024-06-10T17:00:00.000Z',
        visit_purpose: '退回流程-自主',
        session_id: 'return-self',
      });

      // 创建代申请
      const proxyApp = ApplicationModel.create({
        visitor_name: '退回-代申请',
        phone: '13400000002',
        visitor_count: 1,
        is_driving: false,
        contact_person: '对接人R2',
        department_id: deptId,
        visit_start_time: '2024-06-11T09:00:00.000Z',
        visit_end_time: '2024-06-11T17:00:00.000Z',
        visit_purpose: '退回流程-代申请',
        session_id: 'return-proxy',
      });

      // 退回两条申请
      for (const appId of [selfApp.id, proxyApp.id]) {
        ApprovalRecordModel.create({
          application_id: appId,
          operation_type: 'return',
          reason: '信息不完整',
          operator_session_id: 'return-approver',
          operated_at: new Date().toISOString(),
        });
        ApplicationModel.updateApprovalStatus(appId, 'returned', 1);
      }

      const selfReturned = ApplicationModel.findById(selfApp.id)!;
      const proxyReturned = ApplicationModel.findById(proxyApp.id)!;
      expect(selfReturned.approval_status).toBe('returned');
      expect(proxyReturned.approval_status).toBe('returned');

      // 修改后重提
      ApplicationModel.updateFields(selfApp.id, { visit_purpose: '退回流程-自主-已补充' });
      ApplicationModel.updateFields(proxyApp.id, { visit_purpose: '退回流程-代申请-已补充' });

      const selfResubmitted = ApplicationModel.findById(selfApp.id)!;
      const proxyResubmitted = ApplicationModel.findById(proxyApp.id)!;

      // 重提后状态均恢复为 pending
      expect(selfResubmitted.approval_status).toBe('pending');
      expect(proxyResubmitted.approval_status).toBe('pending');
      expect(selfResubmitted.visit_purpose).toBe('退回流程-自主-已补充');
      expect(proxyResubmitted.visit_purpose).toBe('退回流程-代申请-已补充');
    });

    it('自主申请和代申请均可被拒绝（终态一致）', () => {
      const selfApp = ApplicationModel.create({
        visitor_name: '拒绝-自主',
        phone: '13300000001',
        visitor_count: 1,
        is_driving: false,
        contact_person: '对接人J1',
        department_id: deptId,
        visit_start_time: '2024-06-20T09:00:00.000Z',
        visit_end_time: '2024-06-20T17:00:00.000Z',
        visit_purpose: '拒绝测试-自主',
        session_id: 'reject-self',
      });

      const proxyApp = ApplicationModel.create({
        visitor_name: '拒绝-代申请',
        phone: '13300000002',
        visitor_count: 1,
        is_driving: false,
        contact_person: '对接人J2',
        department_id: deptId,
        visit_start_time: '2024-06-21T09:00:00.000Z',
        visit_end_time: '2024-06-21T17:00:00.000Z',
        visit_purpose: '拒绝测试-代申请',
        session_id: 'reject-proxy',
      });

      for (const appId of [selfApp.id, proxyApp.id]) {
        ApprovalRecordModel.create({
          application_id: appId,
          operation_type: 'reject',
          reason: '不符合入校条件',
          operator_session_id: 'reject-approver',
          operated_at: new Date().toISOString(),
        });
        ApplicationModel.updateApprovalStatus(appId, 'rejected', 1);
      }

      const selfRejected = ApplicationModel.findById(selfApp.id)!;
      const proxyRejected = ApplicationModel.findById(proxyApp.id)!;

      // 两种模式拒绝后状态一致
      expect(selfRejected.approval_status).toBe('rejected');
      expect(proxyRejected.approval_status).toBe('rejected');
    });
  });
});
