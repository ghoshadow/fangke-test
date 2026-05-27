import { describe, it, expect } from 'vitest';
import { validateApplication, getFirstError } from '../../src/backend/validators/application';
import type { CreateApplicationInput } from '../../src/shared/types';

/**
 * FK-41: 后端校验规则综合测试 — 提交访客申请（US001-US009）
 *
 * 覆盖 34 个测试用例中与校验相关的场景，验证后端 validateApplication
 * 函数的 13 条规则在各种边界条件下的正确性。
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

describe('FK-41: 后端校验规则综合测试', () => {
  // ============================================================
  // US001: 访客基本信息采集（姓名/手机号/身份证号/单位）
  // ============================================================
  describe('US001: 访客基本信息采集', () => {
    it('[PASS] US001-正常填写访客基本信息（所有必填项正确填写，选填项留空）', () => {
      const data: Partial<CreateApplicationInput> = {
        ...validBase(),
        id_card: '',
        company: '',
      };
      const errors = validateApplication(data);
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
      // 不以1开头的11位数字
      const errors = validateApplication({ ...validBase(), phone: '23456789012' });
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
    it('[PASS] US002-不开车情况正常填写访客人数与车辆信息', () => {
      const data = {
        ...validBase(),
        visitor_count: 3,
        is_driving: false,
        license_plate: '',
      };
      const errors = validateApplication(data);
      expect(errors.visitor_count).toBeUndefined();
      expect(errors.is_driving).toBeUndefined();
      expect(errors.license_plate).toBeUndefined();
    });

    it('[PASS] US002-开车情况正常填写访客人数与车辆信息', () => {
      const data = {
        ...validBase(),
        visitor_count: 2,
        is_driving: true,
        license_plate: '京A12345',
      };
      const errors = validateApplication(data);
      expect(errors.visitor_count).toBeUndefined();
      expect(errors.is_driving).toBeUndefined();
      expect(errors.license_plate).toBeUndefined();
    });

    it('[FAIL] US002-访客人数小于1-违反范围校验', () => {
      const errors = validateApplication({ ...validBase(), visitor_count: 0 });
      expect(errors.visitor_count).toBeDefined();
      expect(errors.visitor_count).toContain('至少');
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
      const data = {
        ...validBase(),
        contact_person: '王老师',
        department_id: 'dept-001',
      };
      const errors = validateApplication(data);
      expect(errors.contact_person).toBeUndefined();
      expect(errors.department_id).toBeUndefined();
    });

    it('[FAIL] US003-内部对接人为空-违反必填校验', () => {
      const errors = validateApplication({ ...validBase(), contact_person: '' });
      expect(errors.contact_person).toBeDefined();
      expect(errors.contact_person).toContain('对接人');
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
      const data = {
        ...validBase(),
        visit_start_time: '09:00',
        visit_end_time: '17:00',
      };
      const errors = validateApplication(data);
      expect(errors.visit_start_time).toBeUndefined();
      expect(errors.visit_end_time).toBeUndefined();
    });

    it('[FAIL] US004-拜访起始时间为空-违反必填校验', () => {
      const errors = validateApplication({
        ...validBase(),
        visit_start_time: '',
      });
      expect(errors.visit_start_time).toBeDefined();
      expect(errors.visit_start_time).toContain('起始时间');
    });

    it('[FAIL] US004-结束时间早于起始时间-违反时间顺序校验', () => {
      const errors = validateApplication({
        ...validBase(),
        visit_start_time: '14:00',
        visit_end_time: '09:00',
      });
      expect(errors.visit_end_time).toBeDefined();
      expect(errors.visit_end_time).toContain('早于');
    });

    it('[FAIL] US004-结束时间等于起始时间-违反时间顺序校验', () => {
      const errors = validateApplication({
        ...validBase(),
        visit_start_time: '09:00',
        visit_end_time: '09:00',
      });
      expect(errors.visit_end_time).toBeDefined();
      expect(errors.visit_end_time).toContain('早于');
    });
  });

  // ============================================================
  // US005: 到访事宜说明
  // ============================================================
  describe('US005: 到访事宜说明', () => {
    it('[PASS] US005-正常填写到访事宜说明', () => {
      const data = {
        ...validBase(),
        visit_purpose: '参加学术交流会议，讨论合作事宜',
      };
      const errors = validateApplication(data);
      expect(errors.visit_purpose).toBeUndefined();
    });

    it('[FAIL] US005-到访事宜为空-违反必填校验', () => {
      const errors = validateApplication({ ...validBase(), visit_purpose: '' });
      expect(errors.visit_purpose).toBeDefined();
      expect(errors.visit_purpose).toContain('到访事宜');
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
  // US006: 附件上传（校验层仅校验URL长度）
  // ============================================================
  describe('US006: 附件上传校验', () => {
    it('[PASS] 不上传附件时校验通过', () => {
      const errors = validateApplication({
        ...validBase(),
        attachment_url: null,
      });
      expect(errors.attachment_url).toBeUndefined();
    });

    it('[PASS] 上传附件URL长度合理时校验通过', () => {
      const errors = validateApplication({
        ...validBase(),
        attachment_url: 'https://example.com/files/doc.pdf',
      });
      expect(errors.attachment_url).toBeUndefined();
    });

    it('[FAIL] 附件URL超长时校验失败', () => {
      const errors = validateApplication({
        ...validBase(),
        attachment_url: 'x'.repeat(501),
      });
      expect(errors.attachment_url).toBeDefined();
    });
  });

  // ============================================================
  // US007: 表单提交控制（全量校验）
  // ============================================================
  describe('US007: 表单提交控制', () => {
    it('[PASS] US007-全部必填项填写正确时校验通过', () => {
      const errors = validateApplication(validBase());
      expect(Object.keys(errors)).toHaveLength(0);
      expect(getFirstError(errors)).toBeNull();
    });

    it('[FAIL] US007-存在必填项为空时校验失败', () => {
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
      // 验证每个必填字段都有错误
      expect(errors.visitor_name).toBeDefined();
      expect(errors.phone).toBeDefined();
      expect(errors.visitor_count).toBeDefined();
      expect(errors.is_driving).toBeDefined();
      expect(errors.contact_person).toBeDefined();
      expect(errors.department_id).toBeDefined();
      expect(errors.visit_start_time).toBeDefined();
      expect(errors.visit_end_time).toBeDefined();
      expect(errors.visit_purpose).toBeDefined();
    });
  });

  // ============================================================
  // US009: 教职工代申请（使用相同的校验规则）
  // ============================================================
  describe('US009: 教职工代申请校验', () => {
    it('[PASS] US009-教职工代访客正常填写时校验通过', () => {
      // 教职工代申请使用相同的表单和校验规则
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
  // 综合边界条件
  // ============================================================
  describe('综合边界条件', () => {
    it('姓名恰好20字符通过', () => {
      const errors = validateApplication({
        ...validBase(),
        visitor_name: '测'.repeat(20),
      });
      expect(errors.visitor_name).toBeUndefined();
    });

    it('手机号11位以1开头通过', () => {
      const errors = validateApplication({
        ...validBase(),
        phone: '13800138000',
      });
      expect(errors.phone).toBeUndefined();
    });

    it('手机号不足11位报错', () => {
      const errors = validateApplication({
        ...validBase(),
        phone: '1380013',
      });
      expect(errors.phone).toBeDefined();
    });

    it('手机号超过11位报错', () => {
      const errors = validateApplication({
        ...validBase(),
        phone: '138001380001',
      });
      expect(errors.phone).toBeDefined();
    });

    it('身份证号15位合法通过', () => {
      const errors = validateApplication({
        ...validBase(),
        id_card: '110101850101001',
      });
      expect(errors.id_card).toBeUndefined();
    });

    it('身份证号18位合法通过', () => {
      const errors = validateApplication({
        ...validBase(),
        id_card: '110101199001011234',
      });
      expect(errors.id_card).toBeUndefined();
    });

    it('身份证号18位末位X通过', () => {
      const errors = validateApplication({
        ...validBase(),
        id_card: '11010119900101123X',
      });
      expect(errors.id_card).toBeUndefined();
    });

    it('身份证号格式不合法报错', () => {
      const errors = validateApplication({
        ...validBase(),
        id_card: '12345',
      });
      expect(errors.id_card).toBeDefined();
    });

    it('访客单位恰好50字符通过', () => {
      const errors = validateApplication({
        ...validBase(),
        company: 'A'.repeat(50),
      });
      expect(errors.company).toBeUndefined();
    });

    it('访客人数为1通过', () => {
      const errors = validateApplication({
        ...validBase(),
        visitor_count: 1,
      });
      expect(errors.visitor_count).toBeUndefined();
    });

    it('访客人数为负数报错', () => {
      const errors = validateApplication({
        ...validBase(),
        visitor_count: -1,
      });
      expect(errors.visitor_count).toBeDefined();
    });

    it('车牌号格式正确通过', () => {
      const errors = validateApplication({
        ...validBase(),
        is_driving: true,
        license_plate: '京A12345',
      });
      expect(errors.license_plate).toBeUndefined();
    });

    it('车牌号格式不正确报错', () => {
      const errors = validateApplication({
        ...validBase(),
        is_driving: true,
        license_plate: 'ABC123',
      });
      expect(errors.license_plate).toBeDefined();
    });

    it('到访事宜恰好200字符通过', () => {
      const errors = validateApplication({
        ...validBase(),
        visit_purpose: '事'.repeat(200),
      });
      expect(errors.visit_purpose).toBeUndefined();
    });

    it('不开车时车牌号为空不报错', () => {
      const errors = validateApplication({
        ...validBase(),
        is_driving: false,
        license_plate: '',
      });
      expect(errors.license_plate).toBeUndefined();
    });
  });
});
