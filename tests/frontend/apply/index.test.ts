import { describe, it, expect } from 'vitest';
import { validateApplication } from '../../../src/frontend/validators/application';
import type { CreateApplicationInput } from '../../../src/shared/types';

/**
 * FK-41: 前端申请表单逻辑测试
 *
 * 测试前端申请表单的核心逻辑：
 * - 表单完整性判断（isFormComplete）的等效验证逻辑
 * - 提交前校验（validateApplication）在各场景下的行为
 * - 字段联动关系（如是否开车→车牌号）
 *
 * 注：由于测试环境为 Node（非 JSDOM），不测试 React 组件渲染，
 * 而是通过校验函数验证表单数据的正确性。
 */

/** 构造合法基准数据 */
function validBase(): Partial<CreateApplicationInput> {
  return {
    visitor_name: '张三',
    phone: '13800138000',
    visitor_count: 2,
    is_driving: false,
    contact_person: '李四',
    department_id: '教务处',
    visit_start_time: '09:00',
    visit_end_time: '17:00',
    visit_purpose: '业务交流',
    session_id: 'test-session',
  };
}

/**
 * 模拟前端 isFormComplete 逻辑：
 * 检查所有必填字段是否已填写，用于控制提交按钮的启用/禁用
 */
function isFormComplete(data: Partial<CreateApplicationInput>): boolean {
  const checks: boolean[] = [
    !!data.visitor_name?.trim(),
    !!data.phone && data.phone.length === 11,
    data.visitor_count !== undefined && data.visitor_count !== null && (data.visitor_count as number) >= 1,
    !!data.contact_person?.trim(),
    !!data.department_id?.trim(),
    !!data.visit_start_time?.trim(),
    !!data.visit_end_time?.trim(),
    !!data.visit_purpose?.trim(),
  ];
  if (data.is_driving) {
    checks.push(!!data.license_plate?.trim());
  }
  return checks.every(Boolean);
}

describe('FK-41: 前端申请表单逻辑测试', () => {
  // ============================================================
  // 表单完整性判断（对应提交按钮启用/禁用）
  // ============================================================
  describe('表单完整性判断（isFormComplete）', () => {
    it('全部必填项填写完整时返回 true', () => {
      expect(isFormComplete(validBase())).toBe(true);
    });

    it('访客姓名为空时返回 false', () => {
      expect(isFormComplete({ ...validBase(), visitor_name: '' })).toBe(false);
    });

    it('手机号不足11位时返回 false', () => {
      expect(isFormComplete({ ...validBase(), phone: '1380013' })).toBe(false);
    });

    it('访客人数未填时返回 false', () => {
      expect(isFormComplete({ ...validBase(), visitor_count: undefined })).toBe(false);
    });

    it('访客人数为0时返回 false', () => {
      expect(isFormComplete({ ...validBase(), visitor_count: 0 })).toBe(false);
    });

    it('对接人为空时返回 false', () => {
      expect(isFormComplete({ ...validBase(), contact_person: '' })).toBe(false);
    });

    it('部门未选择时返回 false', () => {
      expect(isFormComplete({ ...validBase(), department_id: '' })).toBe(false);
    });

    it('起始时间为空时返回 false', () => {
      expect(isFormComplete({ ...validBase(), visit_start_time: '' })).toBe(false);
    });

    it('结束时间为空时返回 false', () => {
      expect(isFormComplete({ ...validBase(), visit_end_time: '' })).toBe(false);
    });

    it('到访事宜为空时返回 false', () => {
      expect(isFormComplete({ ...validBase(), visit_purpose: '' })).toBe(false);
    });

    it('开车但车牌号为空时返回 false', () => {
      expect(isFormComplete({
        ...validBase(),
        is_driving: true,
        license_plate: '',
      })).toBe(false);
    });

    it('不开车时车牌号为空不影响完整性', () => {
      expect(isFormComplete({
        ...validBase(),
        is_driving: false,
        license_plate: '',
      })).toBe(true);
    });
  });

  // ============================================================
  // 字段联动逻辑
  // ============================================================
  describe('字段联动逻辑', () => {
    it('是否开车→车牌号联动：开车时车牌号必填', () => {
      // 开车时，空车牌号校验失败
      const errors = validateApplication({
        ...validBase(),
        is_driving: true,
        license_plate: '',
      });
      expect(errors.license_plate).toBeDefined();
    });

    it('是否开车→车牌号联动：不开车时车牌号可空', () => {
      const errors = validateApplication({
        ...validBase(),
        is_driving: false,
        license_plate: '',
      });
      expect(errors.license_plate).toBeUndefined();
    });

    it('时间联动：结束时间必须晚于起始时间', () => {
      const errors = validateApplication({
        ...validBase(),
        visit_start_time: '14:00',
        visit_end_time: '09:00',
      });
      expect(errors.visit_end_time).toBeDefined();
    });

    it('时间联动：结束时间等于起始时间也不通过', () => {
      const errors = validateApplication({
        ...validBase(),
        visit_start_time: '09:00',
        visit_end_time: '09:00',
      });
      expect(errors.visit_end_time).toBeDefined();
    });
  });

  // ============================================================
  // 提交前校验与完整性联合验证
  // ============================================================
  describe('提交前校验与完整性联合验证', () => {
    it('完整性通过且校验通过 → 可以提交', () => {
      const data = validBase();
      expect(isFormComplete(data)).toBe(true);
      const errors = validateApplication(data);
      expect(Object.keys(errors)).toHaveLength(0);
    });

    it('完整性通过但校验可能失败 → 手机号格式不对', () => {
      // isFormComplete 只检查 phone.length === 11，不检查格式
      const data = { ...validBase(), phone: '23456789012' };
      expect(isFormComplete(data)).toBe(true); // 11位，完整性通过
      const errors = validateApplication(data);
      expect(errors.phone).toBeDefined(); // 但校验失败（不以1开头）
    });

    it('完整性未通过 → 提交按钮禁用', () => {
      const data = { ...validBase(), visitor_name: '' };
      expect(isFormComplete(data)).toBe(false);
    });

    it('选填字段（身份证号、单位、附件）不影响完整性', () => {
      const data = {
        ...validBase(),
        id_card: '',
        company: '',
        attachment_url: '',
      };
      expect(isFormComplete(data)).toBe(true);
      const errors = validateApplication(data);
      expect(Object.keys(errors)).toHaveLength(0);
    });

    it('选填字段填写合法值不影响校验', () => {
      const data = {
        ...validBase(),
        id_card: '110101199001011234',
        company: '某科技有限公司',
        attachment_url: 'https://example.com/file.pdf',
      };
      expect(isFormComplete(data)).toBe(true);
      const errors = validateApplication(data);
      expect(Object.keys(errors)).toHaveLength(0);
    });
  });

  // ============================================================
  // 多字段组合校验
  // ============================================================
  describe('多字段组合校验', () => {
    it('多个必填项同时为空时全部报错', () => {
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
      expect(Object.keys(errors).length).toBeGreaterThanOrEqual(9);
    });

    it('边界值：姓名20字符+单位50字符+事宜200字符全部通过', () => {
      const data = {
        ...validBase(),
        visitor_name: '测'.repeat(20),
        company: '公'.repeat(50),
        visit_purpose: '事'.repeat(200),
      };
      const errors = validateApplication(data);
      expect(errors.visitor_name).toBeUndefined();
      expect(errors.company).toBeUndefined();
      expect(errors.visit_purpose).toBeUndefined();
    });

    it('边界值：姓名21字符+单位51字符+事宜201字符全部失败', () => {
      const data = {
        ...validBase(),
        visitor_name: '测'.repeat(21),
        company: '公'.repeat(51),
        visit_purpose: '事'.repeat(201),
      };
      const errors = validateApplication(data);
      expect(errors.visitor_name).toBeDefined();
      expect(errors.company).toBeDefined();
      expect(errors.visit_purpose).toBeDefined();
    });
  });
});
