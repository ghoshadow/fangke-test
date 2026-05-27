import { ApprovalStatus, PassStatus } from '../../shared/types';
import type { ValidationErrors, ApprovalStatusType, PassStatusType } from '../../shared/types';

// ============================================================
// 记录查询筛选校验器 — 查询前输入合法性校验
// 与后端 record 路由的校验规则保持一致
// ============================================================

// 有效审批状态集合
const VALID_APPROVAL_STATUSES = new Set<string>(Object.values(ApprovalStatus));
// 有效通行状态集合
const VALID_PASS_STATUSES = new Set<string>(Object.values(PassStatus));

/**
 * 校验访客姓名（筛选条件）
 * - 选填，≤50 字符
 */
export function validateVisitorName(value: string): string | null {
  if (value && value.length > 50) {
    return '姓名长度不能超过50个字符';
  }
  return null;
}

/**
 * 校验手机号（筛选条件）
 * - 选填，非空时必须为纯数字
 */
export function validatePhone(value: string): string | null {
  if (value && !/^\d+$/.test(value)) {
    return '手机号格式有误，请输入数字';
  }
  return null;
}

/**
 * 校验身份证号（筛选条件）
 * - 选填，非空时必须符合 15 或 18 位格式（末位可为 X）
 */
export function validateIdCard(value: string): string | null {
  if (value && value.trim()) {
    if (!/^(\d{15}|\d{17}[\dXx])$/.test(value.trim())) {
      return '身份证号格式有误';
    }
  }
  return null;
}

/**
 * 校验对接人姓名（筛选条件）
 * - 选填，≤50 字符
 */
export function validateContactPerson(value: string): string | null {
  if (value && value.length > 50) {
    return '对接人姓名长度不能超过50个字符';
  }
  return null;
}

/**
 * 校验车牌号（筛选条件）
 * - 选填，非空时必须符合中国车牌格式
 */
export function validateLicensePlate(value: string): string | null {
  if (value && value.trim()) {
    // 中国车牌：省份简称 + 字母 + 字母数字组合 + 尾缀
    if (!/^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤川青藏琼宁][A-Z][A-HJ-NP-Z0-9]{4,5}[A-HJ-NP-Z0-9挂学警港澳]$/.test(value.trim())) {
      return '车牌号格式不正确';
    }
  }
  return null;
}

/**
 * 校验访客单位（筛选条件）
 * - 选填，≤100 字符
 */
export function validateCompany(value: string): string | null {
  if (value && value.length > 100) {
    return '单位名称长度不能超过100个字符';
  }
  return null;
}

/**
 * 校验时间范围（筛选条件）
 * - 选填，非空时起始时间必须早于结束时间
 * - 同一天视为相同时间，不允许提交
 */
export function validateDateRange(from: string, to: string): string | null {
  if (from && to) {
    // 比较日期字符串（YYYY-MM-DD）
    if (from >= to) {
      return '起始时间必须早于结束时间，请重新选择';
    }
  }
  return null;
}

/**
 * 校验审批状态值（筛选条件）
 * - 选填，非空时必须为合法枚举值
 */
export function validateApprovalStatus(value: string): string | null {
  if (value && !VALID_APPROVAL_STATUSES.has(value)) {
    return '审批状态值无效';
  }
  return null;
}

/**
 * 校验通行状态值（筛选条件）
 * - 选填，非空时必须为合法枚举值
 */
export function validatePassStatus(value: string): string | null {
  if (value && !VALID_PASS_STATUSES.has(value)) {
    return '通行状态值无效';
  }
  return null;
}

// ============================================================
// 筛选表单整体校验
// ============================================================

interface RecordFilterValues {
  visitor_name?: string;
  phone?: string;
  id_card?: string;
  contact_person?: string;
  company?: string;
  license_plate?: string;
  visit_date_from?: string;
  visit_date_to?: string;
  approval_status?: string;
  pass_status?: string;
}

/**
 * 校验记录查询筛选表单全部字段
 * 返回 ValidationErrors 对象，空对象表示全部通过
 */
export function validateRecordFilter(values: RecordFilterValues): ValidationErrors {
  const errors: ValidationErrors = {};

  const nameErr = validateVisitorName(values.visitor_name || '');
  if (nameErr) errors.visitor_name = nameErr;

  const phoneErr = validatePhone(values.phone || '');
  if (phoneErr) errors.phone = phoneErr;

  const idCardErr = validateIdCard(values.id_card || '');
  if (idCardErr) errors.id_card = idCardErr;

  const contactErr = validateContactPerson(values.contact_person || '');
  if (contactErr) errors.contact_person = contactErr;

  const companyErr = validateCompany(values.company || '');
  if (companyErr) errors.company = companyErr;

  const licenseErr = validateLicensePlate(values.license_plate || '');
  if (licenseErr) errors.license_plate = licenseErr;

  const dateErr = validateDateRange(values.visit_date_from || '', values.visit_date_to || '');
  if (dateErr) errors.visit_date = dateErr;

  const approvalErr = validateApprovalStatus(values.approval_status || '');
  if (approvalErr) errors.approval_status = approvalErr;

  const passErr = validatePassStatus(values.pass_status || '');
  if (passErr) errors.pass_status = passErr;

  return errors;
}

/**
 * 获取第一个校验错误信息
 */
export function getFirstFilterError(errors: ValidationErrors): string | null {
  const keys = Object.keys(errors);
  return keys.length > 0 ? errors[keys[0]] : null;
}
