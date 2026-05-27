import { describe, it, expect } from 'vitest';
import { validateApplication, getFirstError } from '../../../src/frontend/validators/application';
import type { CreateApplicationInput } from '../../../src/shared/types';

/**
 * FK-28: 前端校验器测试 — 13 条校验规则
 *
 * 测试场景覆盖：
 * - 每条必填字段的空值校验
 * - 字段格式校验（手机号、身份证、车牌号等）
 * - 字段长度校验（姓名、单位、到访事宜等）
 * - 条件必填校验（开车→车牌号）
 * - 数值范围校验（访客人数）
 * - 时间逻辑校验（结束时间晚于起始时间）
 */

// 构造一个全部字段有效的基准数据
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

describe('FK-28: 前端校验器 — validateApplication', () => {
  // ============================================================
  // Rule 1: 访客姓名 — 必填，≤20字符
  // ============================================================
  describe('Rule 1: 访客姓名', () => {
    it('空字符串时报错', () => {
      const data = { ...validBase(), visitor_name: '' };
      const errors = validateApplication(data);
      expect(errors.visitor_name).toBe('请填写访客姓名');
    });

    it('纯空格时报错', () => {
      const data = { ...validBase(), visitor_name: '   ' };
      const errors = validateApplication(data);
      expect(errors.visitor_name).toBe('请填写访客姓名');
    });

    it('undefined 时报错', () => {
      const data = { ...validBase(), visitor_name: undefined };
      const errors = validateApplication(data);
      expect(errors.visitor_name).toBe('请填写访客姓名');
    });

    it('超过20字符时报错', () => {
      const data = { ...validBase(), visitor_name: '张'.repeat(21) };
      const errors = validateApplication(data);
      expect(errors.visitor_name).toBe('访客姓名不能超过20个字符');
    });

    it('恰好20字符时通过', () => {
      const data = { ...validBase(), visitor_name: '张'.repeat(20) };
      const errors = validateApplication(data);
      expect(errors.visitor_name).toBeUndefined();
    });

    it('正常值通过', () => {
      const data = { ...validBase(), visitor_name: '张三' };
      const errors = validateApplication(data);
      expect(errors.visitor_name).toBeUndefined();
    });
  });

  // ============================================================
  // Rule 2: 手机号 — 11位以1开头的数字
  // ============================================================
  describe('Rule 2: 手机号', () => {
    it('空值时报错', () => {
      const data = { ...validBase(), phone: '' };
      const errors = validateApplication(data);
      expect(errors.phone).toBe('请输入手机号');
    });

    it('不足11位时报错', () => {
      const data = { ...validBase(), phone: '1380013800' };
      const errors = validateApplication(data);
      expect(errors.phone).toBe('请输入正确11位手机号');
    });

    it('超过11位时报错', () => {
      const data = { ...validBase(), phone: '138001380001' };
      const errors = validateApplication(data);
      expect(errors.phone).toBe('请输入正确11位手机号');
    });

    it('不以1开头时报错', () => {
      const data = { ...validBase(), phone: '23800138000' };
      const errors = validateApplication(data);
      expect(errors.phone).toBe('请输入正确11位手机号');
    });

    it('包含字母时报错', () => {
      const data = { ...validBase(), phone: '1380013800a' };
      const errors = validateApplication(data);
      expect(errors.phone).toBe('请输入正确11位手机号');
    });

    it('正确格式通过', () => {
      const data = { ...validBase(), phone: '13800138000' };
      const errors = validateApplication(data);
      expect(errors.phone).toBeUndefined();
    });
  });

  // ============================================================
  // Rule 3: 身份证号 — 选填，15或18位(末位可为X)
  // ============================================================
  describe('Rule 3: 身份证号', () => {
    it('空值时通过（选填）', () => {
      const data = { ...validBase(), id_card: '' };
      const errors = validateApplication(data);
      expect(errors.id_card).toBeUndefined();
    });

    it('undefined 时通过（选填）', () => {
      const data = { ...validBase(), id_card: undefined };
      const errors = validateApplication(data);
      expect(errors.id_card).toBeUndefined();
    });

    it('15位纯数字通过', () => {
      const data = { ...validBase(), id_card: '110101900101123' };
      const errors = validateApplication(data);
      expect(errors.id_card).toBeUndefined();
    });

    it('18位纯数字通过', () => {
      const data = { ...validBase(), id_card: '110101199001011234' };
      const errors = validateApplication(data);
      expect(errors.id_card).toBeUndefined();
    });

    it('18位末位X通过', () => {
      const data = { ...validBase(), id_card: '11010119900101123X' };
      const errors = validateApplication(data);
      expect(errors.id_card).toBeUndefined();
    });

    it('18位末位小写x通过', () => {
      const data = { ...validBase(), id_card: '11010119900101123x' };
      const errors = validateApplication(data);
      expect(errors.id_card).toBeUndefined();
    });

    it('16位时报错', () => {
      const data = { ...validBase(), id_card: '1101011990010112' };
      const errors = validateApplication(data);
      expect(errors.id_card).toBe('请输入正确的身份证号格式');
    });

    it('17位时报错', () => {
      const data = { ...validBase(), id_card: '11010119900101123' };
      const errors = validateApplication(data);
      expect(errors.id_card).toBe('请输入正确的身份证号格式');
    });

    it('19位时报错', () => {
      const data = { ...validBase(), id_card: '1101011990010112345' };
      const errors = validateApplication(data);
      expect(errors.id_card).toBe('请输入正确的身份证号格式');
    });
  });

  // ============================================================
  // Rule 4: 访客单位 — 选填，≤50字符
  // ============================================================
  describe('Rule 4: 访客单位', () => {
    it('空值时通过（选填）', () => {
      const data = { ...validBase(), company: '' };
      const errors = validateApplication(data);
      expect(errors.company).toBeUndefined();
    });

    it('正常值通过', () => {
      const data = { ...validBase(), company: '测试公司' };
      const errors = validateApplication(data);
      expect(errors.company).toBeUndefined();
    });

    it('恰好50字符通过', () => {
      const data = { ...validBase(), company: '测'.repeat(50) };
      const errors = validateApplication(data);
      expect(errors.company).toBeUndefined();
    });

    it('超过50字符时报错', () => {
      const data = { ...validBase(), company: '测'.repeat(51) };
      const errors = validateApplication(data);
      expect(errors.company).toBe('访客单位不能超过50个字符');
    });
  });

  // ============================================================
  // Rule 5: 访客人数 — 必填，≥1的整数
  // ============================================================
  describe('Rule 5: 访客人数', () => {
    it('undefined 时报错', () => {
      const data = { ...validBase(), visitor_count: undefined };
      const errors = validateApplication(data);
      expect(errors.visitor_count).toBe('访客人数至少为1人');
    });

    it('null 时报错', () => {
      const data = { ...validBase(), visitor_count: null as unknown as number };
      const errors = validateApplication(data);
      expect(errors.visitor_count).toBe('访客人数至少为1人');
    });

    it('0时报错', () => {
      const data = { ...validBase(), visitor_count: 0 };
      const errors = validateApplication(data);
      expect(errors.visitor_count).toBe('访客人数至少为1人');
    });

    it('负数时报错', () => {
      const data = { ...validBase(), visitor_count: -1 };
      const errors = validateApplication(data);
      expect(errors.visitor_count).toBe('访客人数至少为1人');
    });

    it('小数时报错', () => {
      const data = { ...validBase(), visitor_count: 1.5 };
      const errors = validateApplication(data);
      expect(errors.visitor_count).toBe('访客人数至少为1人');
    });

    it('1人时通过', () => {
      const data = { ...validBase(), visitor_count: 1 };
      const errors = validateApplication(data);
      expect(errors.visitor_count).toBeUndefined();
    });

    it('大于1的整数通过', () => {
      const data = { ...validBase(), visitor_count: 10 };
      const errors = validateApplication(data);
      expect(errors.visitor_count).toBeUndefined();
    });
  });

  // ============================================================
  // Rule 6: 是否开车 — 必填，是/否
  // ============================================================
  describe('Rule 6: 是否开车', () => {
    it('undefined 时报错', () => {
      const data = { ...validBase(), is_driving: undefined };
      const errors = validateApplication(data);
      expect(errors.is_driving).toBe('请选择是否开车');
    });

    it('null 时报错', () => {
      const data = { ...validBase(), is_driving: null as unknown as boolean };
      const errors = validateApplication(data);
      expect(errors.is_driving).toBe('请选择是否开车');
    });

    it('false 时通过', () => {
      const data = { ...validBase(), is_driving: false };
      const errors = validateApplication(data);
      expect(errors.is_driving).toBeUndefined();
    });

    it('true 时通过', () => {
      const data = { ...validBase(), is_driving: true, license_plate: '京A12345' };
      const errors = validateApplication(data);
      expect(errors.is_driving).toBeUndefined();
    });
  });

  // ============================================================
  // Rule 7: 车牌号 — 开车时必填+格式校验
  // ============================================================
  describe('Rule 7: 车牌号（开车时必填）', () => {
    it('开车=是，车牌号为空时报错', () => {
      const data = { ...validBase(), is_driving: true, license_plate: '' };
      const errors = validateApplication(data);
      expect(errors.license_plate).toBe('开车必须填写车牌号');
    });

    it('开车=是，车牌号格式错误时报错', () => {
      const data = { ...validBase(), is_driving: true, license_plate: 'ABC' };
      const errors = validateApplication(data);
      expect(errors.license_plate).toBe('请输入正确的车牌号格式');
    });

    it('开车=是，正确车牌号通过', () => {
      const data = { ...validBase(), is_driving: true, license_plate: '京A12345' };
      const errors = validateApplication(data);
      expect(errors.license_plate).toBeUndefined();
    });

    it('开车=否，车牌号为空时通过', () => {
      const data = { ...validBase(), is_driving: false, license_plate: '' };
      const errors = validateApplication(data);
      expect(errors.license_plate).toBeUndefined();
    });

    it('开车=否，车牌号有值时不校验', () => {
      const data = { ...validBase(), is_driving: false, license_plate: '随便填' };
      const errors = validateApplication(data);
      expect(errors.license_plate).toBeUndefined();
    });
  });

  // ============================================================
  // Rule 8: 内部对接人 — 必填，≤20字符
  // ============================================================
  describe('Rule 8: 内部对接人', () => {
    it('空值时报错', () => {
      const data = { ...validBase(), contact_person: '' };
      const errors = validateApplication(data);
      expect(errors.contact_person).toBe('请填写内部对接人姓名');
    });

    it('纯空格时报错', () => {
      const data = { ...validBase(), contact_person: '   ' };
      const errors = validateApplication(data);
      expect(errors.contact_person).toBe('请填写内部对接人姓名');
    });

    it('超过20字符时报错', () => {
      const data = { ...validBase(), contact_person: '李'.repeat(21) };
      const errors = validateApplication(data);
      expect(errors.contact_person).toBe('内部对接人姓名不能超过20个字符');
    });

    it('正常值通过', () => {
      const data = { ...validBase(), contact_person: '李四' };
      const errors = validateApplication(data);
      expect(errors.contact_person).toBeUndefined();
    });
  });

  // ============================================================
  // Rule 9: 对接人部门 — 必填
  // ============================================================
  describe('Rule 9: 对接人部门', () => {
    it('空值时报错', () => {
      const data = { ...validBase(), department_id: '' };
      const errors = validateApplication(data);
      expect(errors.department_id).toBe('请选择对接人部门');
    });

    it('undefined 时报错', () => {
      const data = { ...validBase(), department_id: undefined };
      const errors = validateApplication(data);
      expect(errors.department_id).toBe('请选择对接人部门');
    });

    it('正常值通过', () => {
      const data = { ...validBase(), department_id: 'dept-001' };
      const errors = validateApplication(data);
      expect(errors.department_id).toBeUndefined();
    });
  });

  // ============================================================
  // Rule 10: 拜访起始时间 — 必填，HH:mm
  // ============================================================
  describe('Rule 10: 拜访起始时间', () => {
    it('空值时报错', () => {
      const data = { ...validBase(), visit_start_time: '' };
      const errors = validateApplication(data);
      expect(errors.visit_start_time).toBe('请选择拜访起始时间');
    });

    it('undefined 时报错', () => {
      const data = { ...validBase(), visit_start_time: undefined };
      const errors = validateApplication(data);
      expect(errors.visit_start_time).toBe('请选择拜访起始时间');
    });

    it('正常值通过', () => {
      const data = { ...validBase(), visit_start_time: '09:00' };
      const errors = validateApplication(data);
      expect(errors.visit_start_time).toBeUndefined();
    });
  });

  // ============================================================
  // Rule 11: 拜访结束时间 — 必填，晚于起始时间
  // ============================================================
  describe('Rule 11: 拜访结束时间', () => {
    it('空值时报错', () => {
      const data = { ...validBase(), visit_end_time: '' };
      const errors = validateApplication(data);
      expect(errors.visit_end_time).toBe('请选择拜访结束时间');
    });

    it('结束时间等于起始时间时报错', () => {
      const data = {
        ...validBase(),
        visit_start_time: '09:00',
        visit_end_time: '09:00',
      };
      const errors = validateApplication(data);
      expect(errors.visit_end_time).toBe('结束时间不能早于起始时间');
    });

    it('结束时间早于起始时间时报错', () => {
      const data = {
        ...validBase(),
        visit_start_time: '14:00',
        visit_end_time: '09:00',
      };
      const errors = validateApplication(data);
      expect(errors.visit_end_time).toBe('结束时间不能早于起始时间');
    });

    it('结束时间晚于起始时间时通过', () => {
      const data = {
        ...validBase(),
        visit_start_time: '09:00',
        visit_end_time: '17:00',
      };
      const errors = validateApplication(data);
      expect(errors.visit_end_time).toBeUndefined();
    });
  });

  // ============================================================
  // Rule 12: 到访事宜 — 必填，≤200字符
  // ============================================================
  describe('Rule 12: 到访事宜', () => {
    it('空值时报错', () => {
      const data = { ...validBase(), visit_purpose: '' };
      const errors = validateApplication(data);
      expect(errors.visit_purpose).toBe('请输入到访事宜');
    });

    it('纯空格时报错', () => {
      const data = { ...validBase(), visit_purpose: '   ' };
      const errors = validateApplication(data);
      expect(errors.visit_purpose).toBe('请输入到访事宜');
    });

    it('超过200字符时报错', () => {
      const data = { ...validBase(), visit_purpose: '事'.repeat(201) };
      const errors = validateApplication(data);
      expect(errors.visit_purpose).toBe('到访事宜不能超过200个字符');
    });

    it('恰好200字符时通过', () => {
      const data = { ...validBase(), visit_purpose: '事'.repeat(200) };
      const errors = validateApplication(data);
      expect(errors.visit_purpose).toBeUndefined();
    });

    it('正常值通过', () => {
      const data = { ...validBase(), visit_purpose: '业务交流' };
      const errors = validateApplication(data);
      expect(errors.visit_purpose).toBeUndefined();
    });
  });

  // ============================================================
  // Rule 13: 附件 — 选填，最多1个（前端控制，后端仅校验 URL 格式）
  // ============================================================
  describe('Rule 13: 附件', () => {
    it('空值时通过（选填）', () => {
      const data = { ...validBase(), attachment_url: '' };
      const errors = validateApplication(data);
      expect(errors.attachment_url).toBeUndefined();
    });

    it('正常 URL 通过', () => {
      const data = { ...validBase(), attachment_url: 'https://example.com/file.pdf' };
      const errors = validateApplication(data);
      expect(errors.attachment_url).toBeUndefined();
    });

    it('超长 URL 时报错', () => {
      const data = { ...validBase(), attachment_url: 'x'.repeat(501) };
      const errors = validateApplication(data);
      expect(errors.attachment_url).toBe('附件URL过长');
    });
  });

  // ============================================================
  // getFirstError 辅助函数
  // ============================================================
  describe('getFirstError', () => {
    it('空错误对象返回 null', () => {
      expect(getFirstError({})).toBeNull();
    });

    it('有错误时返回第一个错误信息', () => {
      const errors = { visitor_name: '请填写访客姓名', phone: '请输入手机号' };
      expect(getFirstError(errors)).toBe('请填写访客姓名');
    });
  });

  // ============================================================
  // 综合场景：全部字段有效时返回空对象
  // ============================================================
  describe('综合场景', () => {
    it('全部字段有效时返回空错误对象', () => {
      const errors = validateApplication(validBase());
      expect(Object.keys(errors)).toHaveLength(0);
    });

    it('多个字段同时无效时返回多个错误', () => {
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
      expect(Object.keys(errors).length).toBeGreaterThan(1);
    });
  });
});
