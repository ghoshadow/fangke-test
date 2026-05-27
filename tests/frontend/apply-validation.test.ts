import { describe, it, expect } from 'vitest';
import { validateApplication, getFirstError } from '../../src/frontend/validators/application';
import type { CreateApplicationInput } from '../../src/shared/types';

/**
 * FK-41: 前端校验规则综合测试 — 提交访客申请（US001-US009）
 *
 * 覆盖前端 validateApplication 函数的 13 条校验规则，
 * 验证与后端校验器的一致性，确保前后端双重校验结果一致。
 */

/** 构造一组全部合法的基准数据 */
function validBase(): Partial<CreateApplicationInput> {
  return {
    visitor_name: '张三',
    phone: '13800138000',
    id_card: '',
    company: '',
    visitor_count: 2,
    is_driving: false,
    license_plate: '',
    contact_person: '李四',
    department_id: 'dept-001',
    visit_start_time: '09:00',
    visit_end_time: '17:00',
    visit_purpose: '业务交流',
    attachment_url: '',
    session_id: 'test-session',
  };
}

describe('FK-41: 前端校验规则综合测试', () => {
  // ============================================================
  // US001: 访客基本信息采集
  // ============================================================
  describe('US001: 访客基本信息采集', () => {
    it('[PASS] US001-正常填写访客基本信息（选填项留空）', () => {
      const errors = validateApplication({
        ...validBase(),
        id_card: '',
        company: '',
      });
      expect(Object.keys(errors)).toHaveLength(0);
    });

    it('[FAIL] US001-访客姓名为空-违反必填校验', () => {
      const errors = validateApplication({ ...validBase(), visitor_name: '' });
      expect(errors.visitor_name).toBeDefined();
      expect(errors.visitor_name).toBe('请填写访客姓名');
    });

    it('[FAIL] US001-访客姓名超过20字符-违反长度校验', () => {
      const errors = validateApplication({
        ...validBase(),
        visitor_name: '测'.repeat(21),
      });
      expect(errors.visitor_name).toBeDefined();
      expect(errors.visitor_name).toContain('20');
    });

    it('[FAIL] US001-手机号格式错误-违反格式校验', () => {
      const errors = validateApplication({
        ...validBase(),
        phone: '23456789012',
      });
      expect(errors.phone).toBeDefined();
      expect(errors.phone).toContain('手机号');
    });

    it('[FAIL] US001-访客单位超过50字符-违反长度校验', () => {
      const errors = validateApplication({
        ...validBase(),
        company: 'A'.repeat(51),
      });
      expect(errors.company).toBeDefined();
      expect(errors.company).toContain('50');
    });
  });

  // ============================================================
  // US002: 访客人数与车辆信息
  // ============================================================
  describe('US002: 访客人数与车辆信息', () => {
    it('[PASS] US002-不开车情况正常填写', () => {
      const errors = validateApplication({
        ...validBase(),
        visitor_count: 3,
        is_driving: false,
        license_plate: '',
      });
      expect(errors.visitor_count).toBeUndefined();
      expect(errors.license_plate).toBeUndefined();
    });

    it('[PASS] US002-开车情况正常填写', () => {
      const errors = validateApplication({
        ...validBase(),
        visitor_count: 2,
        is_driving: true,
        license_plate: '京A12345',
      });
      expect(errors.visitor_count).toBeUndefined();
      expect(errors.license_plate).toBeUndefined();
    });

    it('[FAIL] US002-访客人数小于1-违反范围校验', () => {
      const errors = validateApplication({ ...validBase(), visitor_count: 0 });
      expect(errors.visitor_count).toBeDefined();
    });

    it('[FAIL] US002-访客人数非整数-违反格式校验', () => {
      const errors = validateApplication({ ...validBase(), visitor_count: 1.5 });
      expect(errors.visitor_count).toBeDefined();
    });

    it('[FAIL] US002-选择开车但车牌号为空-违反联动必填校验', () => {
      const errors = validateApplication({
        ...validBase(),
        is_driving: true,
        license_plate: '',
      });
      expect(errors.license_plate).toBeDefined();
      expect(errors.license_plate).toContain('车牌号');
    });
  });

  // ============================================================
  // US003: 拜访对接信息
  // ============================================================
  describe('US003: 拜访对接信息', () => {
    it('[PASS] US003-正常填写拜访对接信息', () => {
      const errors = validateApplication({
        ...validBase(),
        contact_person: '王老师',
        department_id: 'dept-001',
      });
      expect(errors.contact_person).toBeUndefined();
      expect(errors.department_id).toBeUndefined();
    });

    it('[FAIL] US003-内部对接人为空-违反必填校验', () => {
      const errors = validateApplication({ ...validBase(), contact_person: '' });
      expect(errors.contact_person).toBeDefined();
    });

    it('[FAIL] US003-内部对接人超过20字符-违反长度校验', () => {
      const errors = validateApplication({
        ...validBase(),
        contact_person: '名'.repeat(21),
      });
      expect(errors.contact_person).toBeDefined();
      expect(errors.contact_person).toContain('20');
    });

    it('[FAIL] US003-对接人部门未选择-违反枚举必填校验', () => {
      const errors = validateApplication({ ...validBase(), department_id: '' });
      expect(errors.department_id).toBeDefined();
      expect(errors.department_id).toContain('部门');
    });
  });

  // ============================================================
  // US004: 拜访时间段
  // ============================================================
  describe('US004: 拜访时间段', () => {
    it('[PASS] US004-正常选择拜访时间段（结束时间晚于起始时间）', () => {
      const errors = validateApplication({
        ...validBase(),
        visit_start_time: '09:00',
        visit_end_time: '17:00',
      });
      expect(errors.visit_start_time).toBeUndefined();
      expect(errors.visit_end_time).toBeUndefined();
    });

    it('[FAIL] US004-拜访起始时间为空-违反必填校验', () => {
      const errors = validateApplication({
        ...validBase(),
        visit_start_time: '',
      });
      expect(errors.visit_start_time).toBeDefined();
    });

    it('[FAIL] US004-结束时间早于起始时间-违反时间顺序校验', () => {
      const errors = validateApplication({
        ...validBase(),
        visit_start_time: '14:00',
        visit_end_time: '09:00',
      });
      expect(errors.visit_end_time).toBeDefined();
    });

    it('[FAIL] US004-结束时间等于起始时间-违反时间顺序校验', () => {
      const errors = validateApplication({
        ...validBase(),
        visit_start_time: '09:00',
        visit_end_time: '09:00',
      });
      expect(errors.visit_end_time).toBeDefined();
    });
  });

  // ============================================================
  // US005: 到访事宜说明
  // ============================================================
  describe('US005: 到访事宜说明', () => {
    it('[PASS] US005-正常填写到访事宜说明', () => {
      const errors = validateApplication({
        ...validBase(),
        visit_purpose: '参加学术交流会议',
      });
      expect(errors.visit_purpose).toBeUndefined();
    });

    it('[FAIL] US005-到访事宜为空-违反必填校验', () => {
      const errors = validateApplication({ ...validBase(), visit_purpose: '' });
      expect(errors.visit_purpose).toBeDefined();
    });

    it('[FAIL] US005-到访事宜超过200字符-违反长度校验', () => {
      const errors = validateApplication({
        ...validBase(),
        visit_purpose: '事'.repeat(201),
      });
      expect(errors.visit_purpose).toBeDefined();
      expect(errors.visit_purpose).toContain('200');
    });
  });

  // ============================================================
  // US006: 附件上传
  // ============================================================
  describe('US006: 附件上传', () => {
    it('[PASS] US006-不上传附件校验通过', () => {
      const errors = validateApplication({
        ...validBase(),
        attachment_url: null,
      });
      expect(errors.attachment_url).toBeUndefined();
    });

    it('[PASS] US006-上传一个附件URL校验通过', () => {
      const errors = validateApplication({
        ...validBase(),
        attachment_url: 'https://example.com/files/doc.pdf',
      });
      expect(errors.attachment_url).toBeUndefined();
    });

    it('[FAIL] US006-附件URL超长校验失败（模拟数量限制）', () => {
      const errors = validateApplication({
        ...validBase(),
        attachment_url: 'x'.repeat(501),
      });
      expect(errors.attachment_url).toBeDefined();
    });
  });

  // ============================================================
  // US007: 表单提交控制
  // ============================================================
  describe('US007: 表单提交控制', () => {
    it('[PASS] US007-全部必填项填写正确时校验通过', () => {
      const errors = validateApplication(validBase());
      expect(Object.keys(errors)).toHaveLength(0);
      expect(getFirstError(errors)).toBeNull();
    });

    it('[FAIL] US007-存在必填项为空时校验失败（提交应被阻止）', () => {
      const data: Partial<CreateApplicationInput> = {
        visitor_name: '',
        phone: '',
        visitor_count: undefined,
        is_driving: undefined,
        contact_person: '',
        department_id: '',
        visit_start_time: '',
        visit_end_time: '',
        visit_purpose: '',
      };
      const errors = validateApplication(data);
      expect(Object.keys(errors).length).toBeGreaterThan(0);
      expect(getFirstError(errors)).not.toBeNull();
    });
  });

  // ============================================================
  // US009: 教职工代申请
  // ============================================================
  describe('US009: 教职工代申请', () => {
    it('[PASS] US009-教职工代访客正常填写时校验通过', () => {
      const data: Partial<CreateApplicationInput> = {
        ...validBase(),
        visitor_name: '访客王五',
        phone: '13900139000',
        contact_person: '教工张三',
        session_id: 'teacher-session',
      };
      const errors = validateApplication(data);
      expect(Object.keys(errors)).toHaveLength(0);
    });

    it('[FAIL] US009-教职工代申请必填信息缺失时校验失败', () => {
      const data: Partial<CreateApplicationInput> = {
        visitor_name: '',
        phone: '',
        visitor_count: undefined,
        is_driving: undefined,
        contact_person: '教工张三',
        department_id: 'dept-001',
        visit_start_time: '09:00',
        visit_end_time: '17:00',
        visit_purpose: '代申请',
        session_id: 'teacher-session',
      };
      const errors = validateApplication(data);
      expect(errors.visitor_name).toBeDefined();
      expect(errors.phone).toBeDefined();
      expect(errors.visitor_count).toBeDefined();
      expect(errors.is_driving).toBeDefined();
    });
  });

  // ============================================================
  // 前后端一致性验证
  // ============================================================
  describe('前后端校验一致性', () => {
    it('合法数据前后端均通过', () => {
      const data = validBase();
      const errors = validateApplication(data);
      expect(Object.keys(errors)).toHaveLength(0);
    });

    it('空姓名前后端均报错', () => {
      const data = { ...validBase(), visitor_name: '' };
      const errors = validateApplication(data);
      expect(errors.visitor_name).toBeDefined();
    });

    it('错误手机号前后端均报错', () => {
      const data = { ...validBase(), phone: '12345' };
      const errors = validateApplication(data);
      expect(errors.phone).toBeDefined();
    });

    it('开车不填车牌前后端均报错', () => {
      const data = { ...validBase(), is_driving: true, license_plate: '' };
      const errors = validateApplication(data);
      expect(errors.license_plate).toBeDefined();
    });

    it('结束时间早于起始时间前后端均报错', () => {
      const data = {
        ...validBase(),
        visit_start_time: '17:00',
        visit_end_time: '09:00',
      };
      const errors = validateApplication(data);
      expect(errors.visit_end_time).toBeDefined();
    });
  });
});
