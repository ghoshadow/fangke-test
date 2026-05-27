import { describe, it, expect } from 'vitest';
import { validateApplication, getFirstError } from '../../../src/backend/validators/application';
import type { CreateApplicationInput } from '../../../src/shared/types';

/**
 * FK-28: 后端校验器测试 — 13 条校验规则
 *
 * 后端校验器在 API 路由层被调用，对所有提交数据进行二次校验。
 * 测试覆盖所有规则的边界条件，确保前后端校验一致性。
 */

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

describe('FK-28: 后端校验器 — validateApplication', () => {
  // Rule 1: 访客姓名
  describe('Rule 1: 访客姓名', () => {
    it('空字符串报错', () => {
      const errors = validateApplication({ ...validBase(), visitor_name: '' });
      expect(errors.visitor_name).toBe('请填写访客姓名');
    });

    it('纯空格报错', () => {
      const errors = validateApplication({ ...validBase(), visitor_name: '   ' });
      expect(errors.visitor_name).toBe('请填写访客姓名');
    });

    it('超过20字符报错', () => {
      const errors = validateApplication({ ...validBase(), visitor_name: '张'.repeat(21) });
      expect(errors.visitor_name).toBe('访客姓名不能超过20个字符');
    });

    it('恰好20字符通过', () => {
      const errors = validateApplication({ ...validBase(), visitor_name: '张'.repeat(20) });
      expect(errors.visitor_name).toBeUndefined();
    });
  });

  // Rule 2: 手机号
  describe('Rule 2: 手机号', () => {
    it('空值报错', () => {
      const errors = validateApplication({ ...validBase(), phone: '' });
      expect(errors.phone).toBe('请输入手机号');
    });

    it('不足11位报错', () => {
      const errors = validateApplication({ ...validBase(), phone: '1380013' });
      expect(errors.phone).toBe('请输入正确11位手机号');
    });

    it('不以1开头报错', () => {
      const errors = validateApplication({ ...validBase(), phone: '23800138000' });
      expect(errors.phone).toBe('请输入正确11位手机号');
    });

    it('正确格式通过', () => {
      const errors = validateApplication({ ...validBase(), phone: '15912345678' });
      expect(errors.phone).toBeUndefined();
    });
  });

  // Rule 3: 身份证号
  describe('Rule 3: 身份证号', () => {
    it('空值通过（选填）', () => {
      const errors = validateApplication({ ...validBase(), id_card: '' });
      expect(errors.id_card).toBeUndefined();
    });

    it('15位纯数字通过', () => {
      const errors = validateApplication({ ...validBase(), id_card: '110101900101123' });
      expect(errors.id_card).toBeUndefined();
    });

    it('18位末位X通过', () => {
      const errors = validateApplication({ ...validBase(), id_card: '11010119900101123X' });
      expect(errors.id_card).toBeUndefined();
    });

    it('错误位数报错', () => {
      const errors = validateApplication({ ...validBase(), id_card: '1234567' });
      expect(errors.id_card).toBe('请输入正确的身份证号格式');
    });
  });

  // Rule 4: 访客单位
  describe('Rule 4: 访客单位', () => {
    it('空值通过（选填）', () => {
      const errors = validateApplication({ ...validBase(), company: '' });
      expect(errors.company).toBeUndefined();
    });

    it('超过50字符报错', () => {
      const errors = validateApplication({ ...validBase(), company: '测'.repeat(51) });
      expect(errors.company).toBe('访客单位不能超过50个字符');
    });
  });

  // Rule 5: 访客人数
  describe('Rule 5: 访客人数', () => {
    it('undefined 报错', () => {
      const errors = validateApplication({ ...validBase(), visitor_count: undefined });
      expect(errors.visitor_count).toBe('访客人数至少为1人');
    });

    it('0报错', () => {
      const errors = validateApplication({ ...validBase(), visitor_count: 0 });
      expect(errors.visitor_count).toBe('访客人数至少为1人');
    });

    it('负数报错', () => {
      const errors = validateApplication({ ...validBase(), visitor_count: -5 });
      expect(errors.visitor_count).toBe('访客人数至少为1人');
    });

    it('小数报错', () => {
      const errors = validateApplication({ ...validBase(), visitor_count: 2.5 });
      expect(errors.visitor_count).toBe('访客人数至少为1人');
    });

    it('正整数通过', () => {
      const errors = validateApplication({ ...validBase(), visitor_count: 5 });
      expect(errors.visitor_count).toBeUndefined();
    });
  });

  // Rule 6: 是否开车
  describe('Rule 6: 是否开车', () => {
    it('undefined 报错', () => {
      const errors = validateApplication({ ...validBase(), is_driving: undefined });
      expect(errors.is_driving).toBe('请选择是否开车');
    });

    it('null 报错', () => {
      const errors = validateApplication({ ...validBase(), is_driving: null as unknown as boolean });
      expect(errors.is_driving).toBe('请选择是否开车');
    });

    it('false 通过', () => {
      const errors = validateApplication({ ...validBase(), is_driving: false });
      expect(errors.is_driving).toBeUndefined();
    });
  });

  // Rule 7: 车牌号
  describe('Rule 7: 车牌号', () => {
    it('开车=是，车牌号为空报错', () => {
      const errors = validateApplication({ ...validBase(), is_driving: true, license_plate: '' });
      expect(errors.license_plate).toBe('开车必须填写车牌号');
    });

    it('开车=是，格式错误报错', () => {
      const errors = validateApplication({ ...validBase(), is_driving: true, license_plate: '12345' });
      expect(errors.license_plate).toBe('请输入正确的车牌号格式');
    });

    it('开车=是，正确格式通过', () => {
      const errors = validateApplication({ ...validBase(), is_driving: true, license_plate: '京A12345' });
      expect(errors.license_plate).toBeUndefined();
    });

    it('开车=否，车牌号为空通过', () => {
      const errors = validateApplication({ ...validBase(), is_driving: false, license_plate: '' });
      expect(errors.license_plate).toBeUndefined();
    });
  });

  // Rule 8: 内部对接人
  describe('Rule 8: 内部对接人', () => {
    it('空值报错', () => {
      const errors = validateApplication({ ...validBase(), contact_person: '' });
      expect(errors.contact_person).toBe('请填写内部对接人姓名');
    });

    it('超过20字符报错', () => {
      const errors = validateApplication({ ...validBase(), contact_person: '李'.repeat(21) });
      expect(errors.contact_person).toBe('内部对接人姓名不能超过20个字符');
    });
  });

  // Rule 9: 对接人部门
  describe('Rule 9: 对接人部门', () => {
    it('空值报错', () => {
      const errors = validateApplication({ ...validBase(), department_id: '' });
      expect(errors.department_id).toBe('请选择对接人部门');
    });
  });

  // Rule 10: 拜访起始时间
  describe('Rule 10: 拜访起始时间', () => {
    it('空值报错', () => {
      const errors = validateApplication({ ...validBase(), visit_start_time: '' });
      expect(errors.visit_start_time).toBe('请选择拜访起始时间');
    });
  });

  // Rule 11: 拜访结束时间
  describe('Rule 11: 拜访结束时间', () => {
    it('空值报错', () => {
      const errors = validateApplication({ ...validBase(), visit_end_time: '' });
      expect(errors.visit_end_time).toBe('请选择拜访结束时间');
    });

    it('结束时间等于起始时间报错', () => {
      const errors = validateApplication({
        ...validBase(),
        visit_start_time: '09:00',
        visit_end_time: '09:00',
      });
      expect(errors.visit_end_time).toBe('结束时间不能早于起始时间');
    });

    it('结束时间早于起始时间报错', () => {
      const errors = validateApplication({
        ...validBase(),
        visit_start_time: '14:00',
        visit_end_time: '09:00',
      });
      expect(errors.visit_end_time).toBe('结束时间不能早于起始时间');
    });

    it('结束时间晚于起始时间通过', () => {
      const errors = validateApplication({
        ...validBase(),
        visit_start_time: '09:00',
        visit_end_time: '17:00',
      });
      expect(errors.visit_end_time).toBeUndefined();
    });
  });

  // Rule 12: 到访事宜
  describe('Rule 12: 到访事宜', () => {
    it('空值报错', () => {
      const errors = validateApplication({ ...validBase(), visit_purpose: '' });
      expect(errors.visit_purpose).toBe('请输入到访事宜');
    });

    it('超过200字符报错', () => {
      const errors = validateApplication({ ...validBase(), visit_purpose: '事'.repeat(201) });
      expect(errors.visit_purpose).toBe('到访事宜不能超过200个字符');
    });

    it('恰好200字符通过', () => {
      const errors = validateApplication({ ...validBase(), visit_purpose: '事'.repeat(200) });
      expect(errors.visit_purpose).toBeUndefined();
    });
  });

  // Rule 13: 附件
  describe('Rule 13: 附件', () => {
    it('空值通过（选填）', () => {
      const errors = validateApplication({ ...validBase(), attachment_url: '' });
      expect(errors.attachment_url).toBeUndefined();
    });

    it('超长URL报错', () => {
      const errors = validateApplication({ ...validBase(), attachment_url: 'x'.repeat(501) });
      expect(errors.attachment_url).toBe('附件URL过长');
    });
  });

  // getFirstError
  describe('getFirstError', () => {
    it('空对象返回 null', () => {
      expect(getFirstError({})).toBeNull();
    });

    it('有错误返回第一个', () => {
      expect(getFirstError({ a: 'error-a', b: 'error-b' })).toBe('error-a');
    });
  });

  // 综合场景
  describe('综合场景', () => {
    it('全部有效字段返回空对象', () => {
      const errors = validateApplication(validBase());
      expect(Object.keys(errors)).toHaveLength(0);
    });

    it('多字段同时无效时全部报错', () => {
      const data: Partial<CreateApplicationInput> = {
        visitor_name: '',
        phone: '',
        visitor_count: 0,
        is_driving: undefined,
        contact_person: '',
        department_id: '',
        visit_start_time: '',
        visit_end_time: '',
        visit_purpose: '',
      };
      const errors = validateApplication(data);
      expect(Object.keys(errors).length).toBeGreaterThanOrEqual(8);
    });
  });
});
