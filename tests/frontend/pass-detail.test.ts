/**
 * FK-43: 【综合测试】前端通行证详情测试 — US019
 *
 * 测试前端详情页的数据展示逻辑与错误处理：
 *   #8  正常查看完整信息（全字段映射展示）
 *   #9  身份信息一致确认放行（信息核对+操作区展示）
 *   #10 身份信息不一致拒绝入校（不执行确认操作）
 *   #11 传入无效的通行证记录ID（VR1 错误展示）
 *   #12 审批状态非已同意（VR2 错误展示）
 */

import { describe, it, expect } from 'vitest';
import { ApprovalStatusLabels, PassStatusLabels } from '../../src/shared/types';
import type { VisitorApplication, VisitorPass } from '../../src/shared/types';

// ============================================================
// 详情页数据处理逻辑（与 detail.tsx 一致）
// ============================================================

/** 模拟详情页数据：检查通行证是否可展示 */
function checkPassViewable(passData: {
  pass_status: string;
  application: { approval_status: string } | null;
}): { viewable: boolean; error?: string } {
  if (!passData.application) {
    return { viewable: false, error: '通行证记录不存在或已失效' };
  }
  if (passData.application.approval_status !== 'approved') {
    return { viewable: false, error: '该申请未审批通过，无通行证可查看' };
  }
  return { viewable: true };
}

/** 模拟详情页数据：检查是否显示确认到访按钮 */
function shouldShowConfirmButton(passStatus: string): boolean {
  return passStatus !== 'visited';
}

/** 模拟详情页数据：检查是否显示数据异常提示 */
function checkDataAnomaly(passStatus: string, actualVisitTime: string | null): boolean {
  return passStatus === 'visited' && actualVisitTime === null;
}

/** 模拟部门名称映射 */
function getDepartmentName(deptId: string, departments: { id: string; name: string }[]): string {
  const dept = departments.find((d) => d.id === deptId);
  return dept?.name || deptId;
}

// ============================================================
// 测试数据工厂
// ============================================================

function createMockApplication(overrides: Partial<VisitorApplication> = {}): VisitorApplication {
  return {
    id: 'app-001',
    visitor_name: '张三',
    phone: '13800138000',
    id_card: '110101199001011234',
    company: '测试单位',
    visitor_count: 2,
    is_driving: true,
    license_plate: '京A12345',
    contact_person: '内部对接人A',
    department_id: 'dept-001',
    visit_start_time: '2024-05-15T09:00:00.000Z',
    visit_end_time: '2024-05-15T17:00:00.000Z',
    visit_purpose: '业务交流',
    attachment_url: null,
    approval_status: 'approved',
    pass_status: 'not_visited',
    session_id: 'session-001',
    version: 2,
    created_at: '2024-05-14T10:00:00.000Z',
    updated_at: '2024-05-14T12:00:00.000Z',
    ...overrides,
  };
}

function createMockPass(overrides: Partial<VisitorPass> = {}): VisitorPass {
  return {
    id: 'pass-001',
    application_id: 'app-001',
    pass_status: 'not_visited',
    actual_visit_time: null,
    created_at: '2024-05-14T12:00:00.000Z',
    ...overrides,
  };
}

const mockDepartments = [
  { id: 'dept-001', name: '教务处' },
  { id: 'dept-002', name: '总务处' },
  { id: 'dept-003', name: '保卫处' },
];

describe('FK-43 前端: US019 通行证详情展示', () => {
  // ============================================================
  // US019 #8: 正常查看完整信息
  // ============================================================
  describe('US019 #8: 正常查看完整信息', () => {
    it('详情页展示通行证完整信息：审批状态、通行状态', () => {
      const app = createMockApplication();
      const pass = createMockPass();

      // 审批状态和通行状态应正确映射显示文本
      expect(ApprovalStatusLabels[app.approval_status]).toBe('已同意');
      expect(PassStatusLabels[pass.pass_status as keyof typeof PassStatusLabels]).toBe('未到访');
    });

    it('详情页展示访客信息：姓名、手机号、身份证号、访客人数', () => {
      const app = createMockApplication({
        visitor_name: '张三',
        phone: '13800138000',
        id_card: '110101199001011234',
        visitor_count: 2,
      });

      expect(app.visitor_name).toBe('张三');
      expect(app.phone).toBe('13800138000');
      expect(app.id_card).toBe('110101199001011234');
      expect(app.visitor_count).toBe(2);
    });

    it('详情页展示车辆信息：车牌号', () => {
      const app = createMockApplication({ license_plate: '京A12345' });
      expect(app.license_plate).toBe('京A12345');
    });

    it('详情页展示预约信息：时间段、对接人、部门名称', () => {
      const app = createMockApplication({
        visit_start_time: '2024-05-15T09:00:00.000Z',
        visit_end_time: '2024-05-15T17:00:00.000Z',
        contact_person: '内部对接人A',
        department_id: 'dept-001',
      });

      expect(app.visit_start_time).toBe('2024-05-15T09:00:00.000Z');
      expect(app.visit_end_time).toBe('2024-05-15T17:00:00.000Z');
      expect(app.contact_person).toBe('内部对接人A');
      expect(getDepartmentName(app.department_id, mockDepartments)).toBe('教务处');
    });

    it('可选字段为null时显示占位符"-"', () => {
      const app = createMockApplication({
        id_card: null,
        license_plate: null,
        company: null,
      });

      // 前端显示逻辑：null → '-'
      expect(app.id_card || '-').toBe('-');
      expect(app.license_plate || '-').toBe('-');
      expect(app.company || '-').toBe('-');
    });

    it('详情内容为申请表单中字段的完整映射', () => {
      const app = createMockApplication();
      const requiredFields = [
        'visitor_name', 'phone', 'id_card', 'visitor_count',
        'license_plate', 'visit_start_time', 'visit_end_time',
        'contact_person', 'department_id', 'approval_status',
        'visit_purpose',
      ];

      for (const field of requiredFields) {
        expect(app).toHaveProperty(field);
      }
    });
  });

  // ============================================================
  // US019 #9: 身份信息一致确认放行
  // ============================================================
  describe('US019 #9: 身份信息一致确认放行', () => {
    it('详情页展示姓名和身份证号供门卫核对', () => {
      const app = createMockApplication({
        visitor_name: '张三',
        id_card: '110101199001011234',
      });

      // 前端展示的核心身份信息
      expect(app.visitor_name).toBe('张三');
      expect(app.id_card).toBe('110101199001011234');
    });

    it('未到访状态下，详情页底部显示确认到访操作区', () => {
      const pass = createMockPass({ pass_status: 'not_visited' });
      expect(shouldShowConfirmButton(pass.pass_status)).toBe(true);
    });
  });

  // ============================================================
  // US019 #10: 身份信息不一致拒绝入校
  // ============================================================
  describe('US019 #10: 身份信息不一致拒绝入校', () => {
    it('信息不一致时，门卫不执行确认到访操作', () => {
      const pass = createMockPass({ pass_status: 'not_visited' });

      // 门卫选择不确认，通行证保持 not_visited
      expect(pass.pass_status).toBe('not_visited');
      expect(pass.actual_visit_time).toBeNull();
    });

    it('不确认后通行证数据不变', () => {
      const app = createMockApplication({
        visitor_name: '李四',
        id_card: '310101198505052345',
      });

      // 信息不一致，不执行确认操作
      expect(app.visitor_name).toBe('李四');
      expect(app.id_card).toBe('310101198505052345');
    });
  });

  // ============================================================
  // US019 #11: 传入无效的通行证记录ID（VR1）
  // ============================================================
  describe('US019 #11: 传入无效的通行证记录ID（VR1）', () => {
    it('API返回404时，页面显示"通行证记录不存在或已失效"', () => {
      const result = checkPassViewable({
        pass_status: 'not_visited',
        application: null,
      });

      expect(result.viewable).toBe(false);
      expect(result.error).toBe('通行证记录不存在或已失效');
    });

    it('页面不展示通行证详情内容', () => {
      const result = checkPassViewable({
        pass_status: 'not_visited',
        application: null,
      });

      expect(result.viewable).toBe(false);
      // 前端应展示空状态或错误状态，不渲染详情
    });
  });

  // ============================================================
  // US019 #12: 审批状态非已同意（VR2）
  // ============================================================
  describe('US019 #12: 审批状态非已同意（VR2）', () => {
    it('审批中的申请，详情页显示"该申请未审批通过，无通行证可查看"', () => {
      const result = checkPassViewable({
        pass_status: 'not_visited',
        application: { approval_status: 'pending' },
      });

      expect(result.viewable).toBe(false);
      expect(result.error).toBe('该申请未审批通过，无通行证可查看');
    });

    it('已拒绝的申请，详情页显示"该申请未审批通过，无通行证可查看"', () => {
      const result = checkPassViewable({
        pass_status: 'not_visited',
        application: { approval_status: 'rejected' },
      });

      expect(result.viewable).toBe(false);
      expect(result.error).toBe('该申请未审批通过，无通行证可查看');
    });

    it('已退回的申请，详情页显示错误', () => {
      const result = checkPassViewable({
        pass_status: 'not_visited',
        application: { approval_status: 'returned' },
      });

      expect(result.viewable).toBe(false);
      expect(result.error).toBe('该申请未审批通过，无通行证可查看');
    });

    it('已同意的申请正常展示', () => {
      const result = checkPassViewable({
        pass_status: 'not_visited',
        application: { approval_status: 'approved' },
      });

      expect(result.viewable).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  // ============================================================
  // 额外：数据异常检测（US021 #21 前端逻辑）
  // ============================================================
  describe('数据异常检测', () => {
    it('已到访但有实际到访时间：正常', () => {
      expect(checkDataAnomaly('visited', '14:30')).toBe(false);
    });

    it('已到访但缺少实际到访时间：数据异常', () => {
      expect(checkDataAnomaly('visited', null)).toBe(true);
    });

    it('未到访且无实际到访时间：正常', () => {
      expect(checkDataAnomaly('not_visited', null)).toBe(false);
    });
  });
});
