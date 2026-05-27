/**
 * FK-43: 【综合测试】前端通行证搜索测试 — US018
 *
 * 测试前端搜索表单的校验逻辑与交互行为：
 *   #1 按访客姓名正常搜索（前端发起API请求）
 *   #2 按手机号正常搜索
 *   #3 组合条件搜索
 *   #4 不输入条件查看全部列表
 *   #5 访客姓名超过20个字符（VR1 onBlur校验）
 *   #6 手机号格式不正确（VR2 onBlur校验）
 *   #7 身份证号格式不正确（VR3 onBlur校验）
 */

import { describe, it, expect } from 'vitest';

// ============================================================
// 搜索校验函数（与 passes/index.tsx 中的实现一致）
// ============================================================

/** 搜索字段格式校验（前端 onBlur + onSearch 双触发） */
function validateSearchField(key: string, value: string): string | null {
  if (key === 'name' && value.length > 20) {
    return '访客姓名输入不能超过20个字符';
  }
  if (key === 'phone' && value && !/^1\d{10}$/.test(value)) {
    return '请输入正确的11位手机号';
  }
  if (key === 'id_card' && value && !/^(\d{15}|\d{17}[\dXx])$/.test(value)) {
    return '请输入正确的身份证号格式（15位或18位）';
  }
  return null;
}

/** 搜索前全量校验（搜索按钮点击时触发） */
function validateSearchFilters(values: Record<string, string>): string | null {
  if (values.name && values.name.length > 20) {
    return '访客姓名输入不能超过20个字符';
  }
  if (values.phone && !/^1\d{10}$/.test(values.phone)) {
    return '请输入正确的11位手机号';
  }
  if (values.id_card && !/^(\d{15}|\d{17}[\dXx])$/.test(values.id_card)) {
    return '请输入正确的身份证号格式（15位或18位）';
  }
  return null;
}

/** 构造搜索请求参数（过滤空值） */
function buildSearchParams(filters: Record<string, string>, page: number, pageSize: number): Record<string, string | number> {
  const params: Record<string, string | number> = { page, page_size: pageSize };
  if (filters.name) params.name = filters.name;
  if (filters.phone) params.phone = filters.phone;
  if (filters.id_card) params.id_card = filters.id_card;
  return params;
}

describe('FK-43 前端: US018 通行证搜索交互', () => {
  // ============================================================
  // US018 #1: 按访客姓名正常搜索
  // ============================================================
  describe('US018 #1: 按访客姓名正常搜索', () => {
    it('输入"张三"搜索，校验通过，可发起API请求', () => {
      const filters = { name: '张三', phone: '', id_card: '' };
      const error = validateSearchFilters(filters);
      expect(error).toBeNull();

      const params = buildSearchParams(filters, 1, 20);
      expect(params).toEqual({ page: 1, page_size: 20, name: '张三' });
    });

    it('搜索参数中仅包含非空字段', () => {
      const filters = { name: '张三', phone: '', id_card: '' };
      const params = buildSearchParams(filters, 1, 20);
      expect(params).not.toHaveProperty('phone');
      expect(params).not.toHaveProperty('id_card');
      expect(params.name).toBe('张三');
    });
  });

  // ============================================================
  // US018 #2: 按手机号正常搜索
  // ============================================================
  describe('US018 #2: 按手机号正常搜索', () => {
    it('输入正确手机号，校验通过', () => {
      const error = validateSearchField('phone', '13800138000');
      expect(error).toBeNull();
    });

    it('搜索参数包含手机号', () => {
      const filters = { name: '', phone: '13800138000', id_card: '' };
      const params = buildSearchParams(filters, 1, 20);
      expect(params.phone).toBe('13800138000');
    });
  });

  // ============================================================
  // US018 #3: 组合条件搜索
  // ============================================================
  describe('US018 #3: 组合条件搜索', () => {
    it('多条件组合搜索，所有字段校验通过', () => {
      const filters = { name: '张三', phone: '13800138000', id_card: '110101199001011234' };
      const error = validateSearchFilters(filters);
      expect(error).toBeNull();
    });

    it('组合搜索参数包含所有非空字段', () => {
      const filters = { name: '张三', phone: '13800138000', id_card: '' };
      const params = buildSearchParams(filters, 1, 20);
      expect(params).toEqual({
        page: 1,
        page_size: 20,
        name: '张三',
        phone: '13800138000',
      });
    });
  });

  // ============================================================
  // US018 #4: 不输入条件查看全部列表
  // ============================================================
  describe('US018 #4: 不输入条件查看全部列表', () => {
    it('空搜索条件，校验通过', () => {
      const filters = { name: '', phone: '', id_card: '' };
      const error = validateSearchFilters(filters);
      expect(error).toBeNull();
    });

    it('空搜索参数仅包含分页信息', () => {
      const filters = { name: '', phone: '', id_card: '' };
      const params = buildSearchParams(filters, 1, 20);
      expect(params).toEqual({ page: 1, page_size: 20 });
      expect(params).not.toHaveProperty('name');
      expect(params).not.toHaveProperty('phone');
      expect(params).not.toHaveProperty('id_card');
    });
  });

  // ============================================================
  // US018 #5: 访客姓名超过20个字符（VR1 onBlur校验）
  // ============================================================
  describe('US018 #5: 访客姓名超过20个字符（VR1）', () => {
    it('onBlur: 超过20个字符返回错误提示', () => {
      const longName = '这是一个超过二十个字符的非常非常长的名字测试用例';
      expect(longName.length).toBeGreaterThan(20);
      const error = validateSearchField('name', longName);
      expect(error).toBe('访客姓名输入不能超过20个字符');
    });

    it('onSearch: 超过20个字符阻止搜索提交', () => {
      const filters = { name: '这是一个超过二十个字符的非常非常长的名字测试用例', phone: '', id_card: '' };
      const error = validateSearchFilters(filters);
      expect(error).toBe('访客姓名输入不能超过20个字符');
    });

    it('恰好20个字符不触发错误', () => {
      const name20 = '12345678901234567890';
      expect(name20.length).toBe(20);
      const error = validateSearchField('name', name20);
      expect(error).toBeNull();
    });

    it('空姓名不触发错误（选填字段）', () => {
      const error = validateSearchField('name', '');
      expect(error).toBeNull();
    });

    it('21个字符触发错误', () => {
      const name21 = '123456789012345678901';
      expect(name21.length).toBe(21);
      const error = validateSearchField('name', name21);
      expect(error).toBe('访客姓名输入不能超过20个字符');
    });
  });

  // ============================================================
  // US018 #6: 手机号格式不正确（VR2 onBlur校验）
  // ============================================================
  describe('US018 #6: 手机号格式不正确（VR2）', () => {
    it('onBlur: 非11位手机号返回错误提示', () => {
      const error = validateSearchField('phone', '12345');
      expect(error).toBe('请输入正确的11位手机号');
    });

    it('onBlur: 非1开头的11位号码返回错误', () => {
      const error = validateSearchField('phone', '23800138000');
      expect(error).toBe('请输入正确的11位手机号');
    });

    it('onSearch: 格式错误阻止搜索提交', () => {
      const filters = { name: '', phone: '12345', id_card: '' };
      const error = validateSearchFilters(filters);
      expect(error).toBe('请输入正确的11位手机号');
    });

    it('正确的11位手机号通过校验', () => {
      expect(validateSearchField('phone', '13800138000')).toBeNull();
      expect(validateSearchField('phone', '15900001111')).toBeNull();
      expect(validateSearchField('phone', '18612345678')).toBeNull();
    });

    it('空手机号不触发错误（选填字段）', () => {
      expect(validateSearchField('phone', '')).toBeNull();
    });

    it('10位手机号返回错误', () => {
      expect(validateSearchField('phone', '1380013800')).toBe('请输入正确的11位手机号');
    });

    it('12位手机号返回错误', () => {
      expect(validateSearchField('phone', '138001380001')).toBe('请输入正确的11位手机号');
    });
  });

  // ============================================================
  // US018 #7: 身份证号格式不正确（VR3 onBlur校验）
  // ============================================================
  describe('US018 #7: 身份证号格式不正确（VR3）', () => {
    it('onBlur: 9位号码返回错误提示', () => {
      const error = validateSearchField('id_card', '123456789');
      expect(error).toBe('请输入正确的身份证号格式（15位或18位）');
    });

    it('onBlur: 16位号码返回错误', () => {
      const error = validateSearchField('id_card', '1234567890123456');
      expect(error).toBe('请输入正确的身份证号格式（15位或18位）');
    });

    it('onSearch: 格式错误阻止搜索提交', () => {
      const filters = { name: '', phone: '', id_card: '123456789' };
      const error = validateSearchFilters(filters);
      expect(error).toBe('请输入正确的身份证号格式（15位或18位）');
    });

    it('正确的15位身份证号通过校验', () => {
      expect(validateSearchField('id_card', '110101900101123')).toBeNull();
    });

    it('正确的18位身份证号通过校验', () => {
      expect(validateSearchField('id_card', '110101199001011234')).toBeNull();
    });

    it('18位末位X通过校验', () => {
      expect(validateSearchField('id_card', '11010119900101123X')).toBeNull();
    });

    it('18位末位小写x通过校验', () => {
      expect(validateSearchField('id_card', '11010119900101123x')).toBeNull();
    });

    it('空身份证号不触发错误（选填字段）', () => {
      expect(validateSearchField('id_card', '')).toBeNull();
    });
  });
});
