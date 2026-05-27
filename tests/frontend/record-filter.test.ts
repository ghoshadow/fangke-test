import { describe, it, expect } from 'vitest';
import {
  validateVisitorName,
  validatePhone,
  validateIdCard,
  validateContactPerson,
  validateLicensePlate,
  validateCompany,
  validateDateRange,
  validateApprovalStatus,
  validatePassStatus,
  validateRecordFilter,
  getFirstFilterError,
} from '../../src/frontend/validators/record-filter';

// ============================================================
// FK-44: 记录查询筛选校验器单元测试 (US022-US024)
// 覆盖：各字段单独校验 + 整体校验 + 首条错误提取
// ============================================================

describe('FK-44: 记录查询筛选校验器', () => {
  // ================================================================
  // US022: 访客维度校验
  // ================================================================
  describe('US022: 访客维度校验', () => {
    // Test #5: 姓名输入超长字符
    describe('validateVisitorName', () => {
      it('空字符串通过校验', () => {
        expect(validateVisitorName('')).toBeNull();
      });

      it('正常姓名通过校验', () => {
        expect(validateVisitorName('张三')).toBeNull();
      });

      it('恰好50字符通过校验', () => {
        expect(validateVisitorName('测'.repeat(50))).toBeNull();
      });

      it('51字符超长返回错误', () => {
        const err = validateVisitorName('测'.repeat(51));
        expect(err).toBe('姓名长度不能超过50个字符');
      });

      it('100字符超长返回错误', () => {
        const err = validateVisitorName('测'.repeat(100));
        expect(err).toBe('姓名长度不能超过50个字符');
      });
    });

    // Test #6: 手机号格式不正确（非数字）
    describe('validatePhone', () => {
      it('空字符串通过校验', () => {
        expect(validatePhone('')).toBeNull();
      });

      it('纯数字通过校验', () => {
        expect(validatePhone('1381234')).toBeNull();
      });

      it('完整11位手机号通过校验', () => {
        expect(validatePhone('13800138000')).toBeNull();
      });

      it('含字母返回格式错误', () => {
        const err = validatePhone('abcdefghijk');
        expect(err).toBe('手机号格式有误，请输入数字');
      });

      it('含特殊字符返回格式错误', () => {
        const err = validatePhone('138-1234-5678');
        expect(err).toBe('手机号格式有误，请输入数字');
      });

      it('含空格返回格式错误', () => {
        const err = validatePhone('138 1234 5678');
        expect(err).toBe('手机号格式有误，请输入数字');
      });
    });

    // Test #7: 身份证号格式不正确
    describe('validateIdCard', () => {
      it('空字符串通过校验', () => {
        expect(validateIdCard('')).toBeNull();
      });

      it('15位数字通过校验', () => {
        expect(validateIdCard('320102900101123')).toBeNull();
      });

      it('18位数字通过校验', () => {
        expect(validateIdCard('320102199001011234')).toBeNull();
      });

      it('18位末位X通过校验', () => {
        expect(validateIdCard('32010219900101123X')).toBeNull();
      });

      it('18位末位小写x通过校验', () => {
        expect(validateIdCard('32010219900101123x')).toBeNull();
      });

      it('5位数字返回格式错误', () => {
        const err = validateIdCard('12345');
        expect(err).toBe('身份证号格式有误');
      });

      it('16位数字返回格式错误', () => {
        const err = validateIdCard('1234567890123456');
        expect(err).toBe('身份证号格式有误');
      });

      it('含字母（非末位）返回格式错误', () => {
        const err = validateIdCard('32010A199001011234');
        expect(err).toBe('身份证号格式有误');
      });
    });
  });

  // ================================================================
  // US023: 对接维度校验
  // ================================================================
  describe('US023: 对接维度校验', () => {
    // Test #12: 对接人姓名超长
    describe('validateContactPerson', () => {
      it('空字符串通过校验', () => {
        expect(validateContactPerson('')).toBeNull();
      });

      it('正常姓名通过校验', () => {
        expect(validateContactPerson('李四')).toBeNull();
      });

      it('恰好50字符通过校验', () => {
        expect(validateContactPerson('测'.repeat(50))).toBeNull();
      });

      it('51字符超长返回错误', () => {
        const err = validateContactPerson('测'.repeat(51));
        expect(err).toBe('对接人姓名长度不能超过50个字符');
      });
    });

    // Test #13: 车牌号格式不正确
    describe('validateLicensePlate', () => {
      it('空字符串通过校验', () => {
        expect(validateLicensePlate('')).toBeNull();
      });

      it('合法车牌号京A12345通过校验', () => {
        expect(validateLicensePlate('京A12345')).toBeNull();
      });

      it('合法车牌号沪B67890通过校验', () => {
        expect(validateLicensePlate('沪B67890')).toBeNull();
      });

      it('特殊字符@@@@@@返回格式错误', () => {
        const err = validateLicensePlate('@@@@@@');
        expect(err).toBe('车牌号格式不正确');
      });

      it('纯数字返回格式错误', () => {
        const err = validateLicensePlate('12345');
        expect(err).toBe('车牌号格式不正确');
      });

      it('英文车牌返回格式错误', () => {
        const err = validateLicensePlate('ABC1234');
        expect(err).toBe('车牌号格式不正确');
      });
    });

    // Test #14: 单位名称超长
    describe('validateCompany', () => {
      it('空字符串通过校验', () => {
        expect(validateCompany('')).toBeNull();
      });

      it('正常单位名称通过校验', () => {
        expect(validateCompany('某某科技有限公司')).toBeNull();
      });

      it('恰好100字符通过校验', () => {
        expect(validateCompany('测'.repeat(100))).toBeNull();
      });

      it('101字符超长返回错误', () => {
        const err = validateCompany('测'.repeat(101));
        expect(err).toBe('单位名称长度不能超过100个字符');
      });
    });
  });

  // ================================================================
  // US024: 时间与状态维度校验
  // ================================================================
  describe('US024: 时间与状态维度校验', () => {
    // Test #19: 起始时间晚于结束时间
    describe('validateDateRange', () => {
      it('两个都为空通过校验', () => {
        expect(validateDateRange('', '')).toBeNull();
      });

      it('只有起始时间通过校验', () => {
        expect(validateDateRange('2025-01-01', '')).toBeNull();
      });

      it('只有结束时间通过校验', () => {
        expect(validateDateRange('', '2025-12-31')).toBeNull();
      });

      it('正常范围通过校验', () => {
        expect(validateDateRange('2025-01-01', '2025-12-31')).toBeNull();
      });

      it('起始晚于结束返回错误', () => {
        const err = validateDateRange('2025-12-31', '2025-01-01');
        expect(err).toBe('起始时间必须早于结束时间，请重新选择');
      });

      // Test #20: 起始时间等于结束时间
      it('起始等于结束返回错误', () => {
        const err = validateDateRange('2025-06-15', '2025-06-15');
        expect(err).toBe('起始时间必须早于结束时间，请重新选择');
      });
    });

    // Test #21: 非法审批状态值
    describe('validateApprovalStatus', () => {
      it('空字符串通过校验', () => {
        expect(validateApprovalStatus('')).toBeNull();
      });

      it('pending通过校验', () => {
        expect(validateApprovalStatus('pending')).toBeNull();
      });

      it('approved通过校验', () => {
        expect(validateApprovalStatus('approved')).toBeNull();
      });

      it('returned通过校验', () => {
        expect(validateApprovalStatus('returned')).toBeNull();
      });

      it('rejected通过校验', () => {
        expect(validateApprovalStatus('rejected')).toBeNull();
      });

      it('非法状态值返回错误', () => {
        const err = validateApprovalStatus('invalid_status');
        expect(err).toBe('审批状态值无效');
      });

      it('大小写敏感 — Approved返回错误', () => {
        const err = validateApprovalStatus('Approved');
        expect(err).toBe('审批状态值无效');
      });
    });

    // Test #22: 非法通行状态值
    describe('validatePassStatus', () => {
      it('空字符串通过校验', () => {
        expect(validatePassStatus('')).toBeNull();
      });

      it('not_visited通过校验', () => {
        expect(validatePassStatus('not_visited')).toBeNull();
      });

      it('visited通过校验', () => {
        expect(validatePassStatus('visited')).toBeNull();
      });

      it('非法状态值返回错误', () => {
        const err = validatePassStatus('unknown_status');
        expect(err).toBe('通行状态值无效');
      });

      it('大小写敏感 — Visited返回错误', () => {
        const err = validatePassStatus('Visited');
        expect(err).toBe('通行状态值无效');
      });
    });
  });

  // ================================================================
  // 整体校验
  // ================================================================
  describe('validateRecordFilter 整体校验', () => {
    it('全部空值通过校验', () => {
      const errors = validateRecordFilter({});
      expect(Object.keys(errors).length).toBe(0);
    });

    it('全部合法值通过校验', () => {
      const errors = validateRecordFilter({
        visitor_name: '张三',
        phone: '1381234',
        id_card: '320102199001011234',
        contact_person: '李四',
        company: '某某科技',
        license_plate: '京A12345',
        visit_date_from: '2025-01-01',
        visit_date_to: '2025-12-31',
        approval_status: 'approved',
        pass_status: 'visited',
      });
      expect(Object.keys(errors).length).toBe(0);
    });

    it('多字段同时报错', () => {
      const errors = validateRecordFilter({
        visitor_name: '测'.repeat(51),
        phone: 'abc',
        approval_status: 'invalid',
      });
      expect(errors.visitor_name).toBeDefined();
      expect(errors.phone).toBeDefined();
      expect(errors.approval_status).toBeDefined();
    });

    it('时间范围错误在 visit_date 键', () => {
      const errors = validateRecordFilter({
        visit_date_from: '2025-12-31',
        visit_date_to: '2025-01-01',
      });
      expect(errors.visit_date).toBe('起始时间必须早于结束时间，请重新选择');
    });
  });

  // ================================================================
  // getFirstFilterError
  // ================================================================
  describe('getFirstFilterError', () => {
    it('空对象返回null', () => {
      expect(getFirstFilterError({})).toBeNull();
    });

    it('有错误时返回第一条错误信息', () => {
      const errors = validateRecordFilter({ phone: 'abc' });
      const firstError = getFirstFilterError(errors);
      expect(firstError).toBe('手机号格式有误，请输入数字');
    });
  });
});
