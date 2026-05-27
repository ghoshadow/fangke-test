import { describe, it, expect } from 'vitest';
import {
  validateApplication,
  getFirstError,
} from '../../../src/backend/validators/application';

// ============================================================
// FK-27: 访客信息采集测试（14字段 + 联动规则）
//
// 覆盖测试场景 #1~#8：
// 1. 空白表单渲染 → 必填/选填字段区分（通过校验规则验证）
// 2. 访客姓名超20字符 → 校验失败
// 3. 手机号非11位或非1开头 → 校验失败
// 4. 身份证号15位或18位(末位X) → 校验通过
// 5. 是否开车=是 → 车牌号必填
// 6. 是否开车=否 → 车牌号非必填
// 7. 对接人部门必须从预设列表选择
// 8. 附件最多1个
// ============================================================

/** 构造一个所有必填字段都有效的完整表单数据 */
function buildValidData() {
  return {
    visitor_name: '张三',
    phone: '13800138000',
    id_card: '',
    company: '',
    visitor_count: 1,
    is_driving: false,
    license_plate: null as string | null,
    contact_person: '李四',
    department_id: 'dept-001',
    visit_start_time: '2024-03-01T09:00:00',
    visit_end_time: '2024-03-01T17:00:00',
    visit_purpose: '业务交流',
    attachment_url: null as string | null,
    session_id: 'test-session',
  };
}

// ============================================================
// 场景 1: 表单字段完整性 — 必填/选填区分
// ============================================================
describe('场景1: 必填/选填字段区分', () => {
  it('完整有效数据通过全部校验', () => {
    const errors = validateApplication(buildValidData());
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('空表单返回所有必填字段的校验错误', () => {
    const errors = validateApplication({});
    // 必填字段: visitor_name, phone, visitor_count, is_driving,
    //           contact_person, department_id, visit_start_time,
    //           visit_end_time, visit_purpose
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

  it('选填字段为空时不产生校验错误', () => {
    const data = buildValidData();
    // 选填字段: id_card, company, attachment_url
    data.id_card = '';
    (data as Record<string, unknown>).company = '';
    data.attachment_url = null;

    const errors = validateApplication(data);
    expect(errors.id_card).toBeUndefined();
    expect(errors.company).toBeUndefined();
    expect(errors.attachment_url).toBeUndefined();
  });
});

// ============================================================
// 规则1: 访客姓名 — 必填，≤20字符
// ============================================================
describe('规则1: 访客姓名', () => {
  it('为空时报错', () => {
    const errors = validateApplication({ visitor_name: '' });
    expect(errors.visitor_name).toBeDefined();
  });

  it('仅空白字符时报错', () => {
    const errors = validateApplication({ visitor_name: '   ' });
    expect(errors.visitor_name).toBeDefined();
  });

  it('20字符以内通过', () => {
    const errors = validateApplication({ visitor_name: '恰好二十个字符的姓名一二三' });
    // 恰好二十个字符的姓名一二三 = 15 chars, well within 20
    expect(errors.visitor_name).toBeUndefined();
  });

  // 场景2: 超过20字符
  it('超过20字符时报错', () => {
    const longName = 'a'.repeat(21);
    const errors = validateApplication({ visitor_name: longName });
    expect(errors.visitor_name).toBeDefined();
  });

  it('恰好20字符时通过', () => {
    const name20 = 'a'.repeat(20);
    const errors = validateApplication({ visitor_name: name20 });
    expect(errors.visitor_name).toBeUndefined();
  });
});

// ============================================================
// 规则2: 手机号 — 11位以1开头的数字
// ============================================================
describe('规则2: 手机号', () => {
  // 场景3: 非11位或非1开头
  it('非1开头时报错', () => {
    const errors = validateApplication({ phone: '23800138000' });
    expect(errors.phone).toBe('请输入正确11位手机号');
  });

  it('少于11位时报错', () => {
    const errors = validateApplication({ phone: '1380013800' });
    expect(errors.phone).toBe('请输入正确11位手机号');
  });

  it('多于11位时报错', () => {
    const errors = validateApplication({ phone: '138001380001' });
    expect(errors.phone).toBe('请输入正确11位手机号');
  });

  it('有效手机号通过', () => {
    const errors = validateApplication({ phone: '13800138000' });
    expect(errors.phone).toBeUndefined();
  });

  it('为空时报错', () => {
    const errors = validateApplication({ phone: '' });
    expect(errors.phone).toBeDefined();
  });

  it('包含非数字时报错', () => {
    const errors = validateApplication({ phone: '1380013800a' });
    expect(errors.phone).toBe('请输入正确11位手机号');
  });
});

// ============================================================
// 规则3: 身份证号 — 选填，15或18位(末位可为X)
// ============================================================
describe('规则3: 身份证号', () => {
  // 场景4: 15位或18位（末位X）
  it('15位数字通过', () => {
    const errors = validateApplication({ id_card: '123456789012345' });
    expect(errors.id_card).toBeUndefined();
  });

  it('18位数字通过', () => {
    const errors = validateApplication({ id_card: '110101199001011234' });
    expect(errors.id_card).toBeUndefined();
  });

  it('18位末位大写X通过', () => {
    const errors = validateApplication({ id_card: '11010119900101123X' });
    expect(errors.id_card).toBeUndefined();
  });

  it('18位末位小写x通过', () => {
    const errors = validateApplication({ id_card: '11010119900101123x' });
    expect(errors.id_card).toBeUndefined();
  });

  it('无效格式时报错', () => {
    const errors = validateApplication({ id_card: '12345' });
    expect(errors.id_card).toBe('请输入正确的身份证号格式');
  });

  it('16位时报错', () => {
    const errors = validateApplication({ id_card: '1234567890123456' });
    expect(errors.id_card).toBe('请输入正确的身份证号格式');
  });

  it('17位时报错', () => {
    const errors = validateApplication({ id_card: '12345678901234567' });
    expect(errors.id_card).toBe('请输入正确的身份证号格式');
  });

  it('为空时通过（选填字段）', () => {
    const errors = validateApplication({ id_card: '' });
    expect(errors.id_card).toBeUndefined();
  });

  it('为 undefined 时通过（选填字段）', () => {
    const errors = validateApplication({});
    expect(errors.id_card).toBeUndefined();
  });
});

// ============================================================
// 规则4: 访客单位 — 选填，≤50字符
// ============================================================
describe('规则4: 访客单位', () => {
  it('50字符以内通过', () => {
    const errors = validateApplication({ company: 'a'.repeat(50) });
    expect(errors.company).toBeUndefined();
  });

  it('超过50字符时报错', () => {
    const errors = validateApplication({ company: 'a'.repeat(51) });
    expect(errors.company).toBeDefined();
  });

  it('为空时通过（选填字段）', () => {
    const errors = validateApplication({ company: '' });
    expect(errors.company).toBeUndefined();
  });
});

// ============================================================
// 规则5: 访客人数 — 必填，≥1的整数
// ============================================================
describe('规则5: 访客人数', () => {
  it('为 undefined 时报错', () => {
    const errors = validateApplication({});
    expect(errors.visitor_count).toBeDefined();
  });

  it('为 null 时报错', () => {
    const errors = validateApplication({ visitor_count: null as unknown as undefined });
    expect(errors.visitor_count).toBeDefined();
  });

  it('为 0 时报错', () => {
    const errors = validateApplication({ visitor_count: 0 });
    expect(errors.visitor_count).toBeDefined();
  });

  it('为负数时报错', () => {
    const errors = validateApplication({ visitor_count: -1 });
    expect(errors.visitor_count).toBeDefined();
  });

  it('为小数时报错', () => {
    const errors = validateApplication({ visitor_count: 1.5 });
    expect(errors.visitor_count).toBeDefined();
  });

  it('≥1 的整数通过', () => {
    const errors = validateApplication({ visitor_count: 1 });
    expect(errors.visitor_count).toBeUndefined();
  });

  it('较大人数通过', () => {
    const errors = validateApplication({ visitor_count: 100 });
    expect(errors.visitor_count).toBeUndefined();
  });
});

// ============================================================
// 规则6+7: 是否开车 + 车牌号联动
// ============================================================
describe('规则6+7: 是否开车与车牌号联动', () => {
  // 场景5: 选择"是" → 车牌号必填
  it('开车但未填车牌号时报错', () => {
    const errors = validateApplication({ is_driving: true, license_plate: '' });
    expect(errors.license_plate).toBeDefined();
  });

  it('开车且车牌号有效时通过', () => {
    const errors = validateApplication({
      is_driving: true,
      license_plate: '京A12345',
    });
    expect(errors.license_plate).toBeUndefined();
    expect(errors.is_driving).toBeUndefined();
  });

  // 场景6: 选择"否" → 车牌号非必填
  it('不开车时车牌号为空通过', () => {
    const errors = validateApplication({
      is_driving: false,
      license_plate: '',
    });
    expect(errors.license_plate).toBeUndefined();
  });

  it('不开车时车牌号为 null 通过', () => {
    const errors = validateApplication({
      is_driving: false,
      license_plate: null,
    });
    expect(errors.license_plate).toBeUndefined();
  });

  it('未选择是否开车时报错', () => {
    const errors = validateApplication({});
    expect(errors.is_driving).toBeDefined();
  });

  it('车牌号格式校验（开车时）', () => {
    const errors = validateApplication({
      is_driving: true,
      license_plate: 'abc',
    });
    expect(errors.license_plate).toBeDefined();
  });

  it('各省简称车牌号通过', () => {
    // 测试几个典型省份
    const plates = ['京A12345', '沪B67890', '粤CD1234', '川E5678F'];
    for (const plate of plates) {
      const errors = validateApplication({
        is_driving: true,
        license_plate: plate,
      });
      expect(errors.license_plate).toBeUndefined();
    }
  });
});

// ============================================================
// 规则8: 内部对接人 — 必填，≤20字符
// ============================================================
describe('规则8: 内部对接人', () => {
  it('为空时报错', () => {
    const errors = validateApplication({ contact_person: '' });
    expect(errors.contact_person).toBeDefined();
  });

  it('仅空白字符时报错', () => {
    const errors = validateApplication({ contact_person: '   ' });
    expect(errors.contact_person).toBeDefined();
  });

  it('超过20字符时报错', () => {
    const errors = validateApplication({ contact_person: 'a'.repeat(21) });
    expect(errors.contact_person).toBeDefined();
  });

  it('20字符以内通过', () => {
    const errors = validateApplication({ contact_person: '李四' });
    expect(errors.contact_person).toBeUndefined();
  });
});

// ============================================================
// 规则9: 对接人部门 — 必填，从预设列表选择
// ============================================================
describe('规则9: 对接人部门', () => {
  // 场景7: 部门必须选择（不可自由输入）
  it('为空时报错', () => {
    const errors = validateApplication({ department_id: '' });
    expect(errors.department_id).toBeDefined();
  });

  it('为 undefined 时报错', () => {
    const errors = validateApplication({});
    expect(errors.department_id).toBeDefined();
  });

  it('选择了部门后通过', () => {
    const errors = validateApplication({ department_id: 'dept-001' });
    expect(errors.department_id).toBeUndefined();
  });
});

// ============================================================
// 规则10: 拜访起始时间 — 必填，HH:mm
// ============================================================
describe('规则10: 拜访起始时间', () => {
  it('为空时报错', () => {
    const errors = validateApplication({ visit_start_time: '' });
    expect(errors.visit_start_time).toBeDefined();
  });

  it('为 undefined 时报错', () => {
    const errors = validateApplication({});
    expect(errors.visit_start_time).toBeDefined();
  });

  it('填写后通过', () => {
    const errors = validateApplication({ visit_start_time: '2024-03-01T09:00:00' });
    expect(errors.visit_start_time).toBeUndefined();
  });
});

// ============================================================
// 规则11: 拜访结束时间 — 必填，晚于起始时间
// ============================================================
describe('规则11: 拜访结束时间', () => {
  it('为空时报错', () => {
    const errors = validateApplication({ visit_end_time: '' });
    expect(errors.visit_end_time).toBeDefined();
  });

  it('早于起始时间时报错', () => {
    const errors = validateApplication({
      visit_start_time: '2024-03-01T17:00:00',
      visit_end_time: '2024-03-01T09:00:00',
    });
    expect(errors.visit_end_time).toBeDefined();
  });

  it('等于起始时间时报错', () => {
    const errors = validateApplication({
      visit_start_time: '2024-03-01T09:00:00',
      visit_end_time: '2024-03-01T09:00:00',
    });
    expect(errors.visit_end_time).toBeDefined();
  });

  it('晚于起始时间时通过', () => {
    const errors = validateApplication({
      visit_start_time: '2024-03-01T09:00:00',
      visit_end_time: '2024-03-01T17:00:00',
    });
    expect(errors.visit_end_time).toBeUndefined();
  });
});

// ============================================================
// 规则12: 到访事宜 — 必填，≤200字符
// ============================================================
describe('规则12: 到访事宜', () => {
  it('为空时报错', () => {
    const errors = validateApplication({ visit_purpose: '' });
    expect(errors.visit_purpose).toBeDefined();
  });

  it('仅空白字符时报错', () => {
    const errors = validateApplication({ visit_purpose: '   ' });
    expect(errors.visit_purpose).toBeDefined();
  });

  it('超过200字符时报错', () => {
    const errors = validateApplication({ visit_purpose: 'a'.repeat(201) });
    expect(errors.visit_purpose).toBeDefined();
  });

  it('200字符以内通过', () => {
    const errors = validateApplication({ visit_purpose: '业务交流' });
    expect(errors.visit_purpose).toBeUndefined();
  });

  it('恰好200字符通过', () => {
    const errors = validateApplication({ visit_purpose: 'a'.repeat(200) });
    expect(errors.visit_purpose).toBeUndefined();
  });
});

// ============================================================
// 规则13: 附件 — 选填，最多1个
// ============================================================
describe('规则13: 附件', () => {
  // 场景8: 附件限制（最多1个，由前端 FileUpload 组件控制单文件）
  it('无附件时通过', () => {
    const errors = validateApplication({});
    expect(errors.attachment_url).toBeUndefined();
  });

  it('有效附件URL时通过', () => {
    const errors = validateApplication({
      attachment_url: 'https://example.com/file.pdf',
    });
    expect(errors.attachment_url).toBeUndefined();
  });

  it('附件URL超过500字符时报错', () => {
    const errors = validateApplication({
      attachment_url: 'a'.repeat(501),
    });
    expect(errors.attachment_url).toBeDefined();
  });

  it('空白附件URL时通过', () => {
    const errors = validateApplication({ attachment_url: '' });
    expect(errors.attachment_url).toBeUndefined();
  });
});

// ============================================================
// 联动规则: 完整表单联动验证
// ============================================================
describe('联动规则: 完整表单联动验证', () => {
  it('开车场景：所有字段有效时通过', () => {
    const data = buildValidData();
    data.is_driving = true;
    data.license_plate = '京A12345';
    data.id_card = '110101199001011234';
    data.company = '测试公司';

    const errors = validateApplication(data);
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('不开车场景：所有字段有效时通过', () => {
    const data = buildValidData();
    data.is_driving = false;
    data.license_plate = null;

    const errors = validateApplication(data);
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('开车场景中车牌号无效时只产生车牌号错误', () => {
    const data = buildValidData();
    data.is_driving = true;
    data.license_plate = 'invalid';

    const errors = validateApplication(data);
    expect(errors.license_plate).toBeDefined();
    // 其他字段不应报错
    expect(errors.visitor_name).toBeUndefined();
    expect(errors.phone).toBeUndefined();
    expect(errors.contact_person).toBeUndefined();
    expect(errors.department_id).toBeUndefined();
    expect(errors.visit_purpose).toBeUndefined();
  });

  it('多字段同时无效时返回多个错误', () => {
    const errors = validateApplication({
      visitor_name: '',
      phone: 'abc',
      visitor_count: -1,
    });
    expect(errors.visitor_name).toBeDefined();
    expect(errors.phone).toBeDefined();
    expect(errors.visitor_count).toBeDefined();
  });
});

// ============================================================
// getFirstError 辅助函数
// ============================================================
describe('getFirstError 辅助函数', () => {
  it('有错误时返回第一个错误信息', () => {
    const error = getFirstError({ phone: '请输入正确11位手机号' });
    expect(error).toBe('请输入正确11位手机号');
  });

  it('无错误时返回 null', () => {
    const error = getFirstError({});
    expect(error).toBeNull();
  });

  it('多个错误时返回第一个', () => {
    const error = getFirstError({
      visitor_name: '请填写访客姓名',
      phone: '请输入正确11位手机号',
    });
    expect(error).toBe('请填写访客姓名');
  });
});
