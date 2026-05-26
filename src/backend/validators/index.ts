import type { ValidationErrors } from '@shared/types';

// ============================================================
// 后端请求校验器
// ============================================================

type Rule = (value: unknown, body: Record<string, unknown>) => string | null;
type Rules = Record<string, Rule[]>;

/**
 * 通用校验执行器
 * 返回 null 表示通过，否则返回 ValidationErrors
 */
export function validate(body: Record<string, unknown>, rules: Rules): ValidationErrors | null {
  const errors: ValidationErrors = {};

  for (const [field, fieldRules] of Object.entries(rules)) {
    for (const rule of fieldRules) {
      const err = rule(body[field], body);
      if (err) {
        errors[field] = err;
        break;
      }
    }
  }

  return Object.keys(errors).length ? errors : null;
}

// ============================================================
// 通用规则工厂
// ============================================================

export function required(label: string): Rule {
  return (v) => {
    if (v === undefined || v === null || String(v).trim() === '') {
      return `${label}不能为空`;
    }
    return null;
  };
}

export function isString(label: string, max?: number): Rule {
  return (v) => {
    if (v !== undefined && v !== null && typeof v !== 'string') {
      return `${label}类型不正确`;
    }
    if (max && typeof v === 'string' && v.length > max) {
      return `${label}不能超过${max}个字符`;
    }
    return null;
  };
}

export function isNumber(label: string, opts?: { min?: number; max?: number }): Rule {
  return (v) => {
    if (v !== undefined && v !== null) {
      const n = Number(v);
      if (isNaN(n)) return `${label}必须为数字`;
      if (opts?.min !== undefined && n < opts.min) return `${label}不能小于${opts.min}`;
      if (opts?.max !== undefined && n > opts.max) return `${label}不能大于${opts.max}`;
    }
    return null;
  };
}

export function isBoolean(label: string): Rule {
  return (v) => {
    if (v !== undefined && v !== null && typeof v !== 'boolean') {
      return `${label}类型不正确`;
    }
    return null;
  };
}

export function isOneOf(label: string, allowed: readonly string[]): Rule {
  return (v) => {
    if (v !== undefined && v !== null && !allowed.includes(String(v))) {
      return `${label}取值不合法`;
    }
    return null;
  };
}

export function isPhone(): Rule {
  return (v) => {
    if (v && !/^1[3-9]\d{9}$/.test(String(v))) {
      return '手机号格式不正确';
    }
    return null;
  };
}

export function isIdCard(): Rule {
  return (v) => {
    if (v && !/^\d{17}[\dXx]$/.test(String(v))) {
      return '身份证号格式不正确';
    }
    return null;
  };
}

export function isISODate(label: string): Rule {
  return (v) => {
    if (v && isNaN(Date.parse(String(v)))) {
      return `${label}日期格式不正确`;
    }
    return null;
  };
}

// ============================================================
// 业务校验规则集
// ============================================================

export const applicationRules: Rules = {
  visitor_name: [required('访客姓名'), isString('访客姓名', 50)],
  phone: [required('联系电话'), isPhone()],
  id_card: [isIdCard()],
  company: [isString('来访单位', 100)],
  visitor_count: [required('来访人数'), isNumber('来访人数', { min: 1, max: 999 })],
  is_driving: [required('是否驾车'), isBoolean('是否驾车')],
  license_plate: [isString('车牌号', 20)],
  contact_person: [required('被访人'), isString('被访人', 50)],
  department_id: [required('被访部门'), isString('被访部门')],
  visit_start_time: [required('访问开始时间'), isISODate('访问开始时间')],
  visit_end_time: [required('访问结束时间'), isISODate('访问结束时间')],
  visit_purpose: [required('来访事由'), isString('来访事由', 500)],
};

export const approvalRules: Rules = {
  reason: [isString('原因', 500)],
};

export const recordQueryRules: Rules = {
  visitor_name: [isString('访客姓名', 50)],
  phone: [isPhone()],
  approval_status: [isOneOf('审批状态', ['pending', 'approved', 'returned', 'rejected'])],
  pass_status: [isOneOf('通行状态', ['not_visited', 'visited'])],
};
