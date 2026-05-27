import type { CreateApplicationInput, ValidationErrors } from '../../shared/types';

/**
 * 校验申请表单（13 条规则，前后端一致）
 * 返回空对象表示全部通过
 */
export function validateApplication(data: Partial<CreateApplicationInput>): ValidationErrors {
  const errors: ValidationErrors = {};

  // 1. 访客姓名：必填，≤20字符
  if (!data.visitor_name || !data.visitor_name.trim()) {
    errors.visitor_name = '请填写访客姓名';
  } else if (data.visitor_name.length > 20) {
    errors.visitor_name = '访客姓名不能超过20个字符';
  }

  // 2. 手机号：11位以1开头的数字
  if (!data.phone || !data.phone.trim()) {
    errors.phone = '请输入手机号';
  } else if (!/^1\d{10}$/.test(data.phone)) {
    errors.phone = '请输入正确11位手机号';
  }

  // 3. 身份证号：选填，15或18位(末位可为X)
  if (data.id_card && data.id_card.trim()) {
    if (!/^(\d{15}|\d{17}[\dXx])$/.test(data.id_card)) {
      errors.id_card = '请输入正确的身份证号格式';
    }
  }

  // 4. 访客单位：选填，≤50字符
  if (data.company && data.company.length > 50) {
    errors.company = '访客单位不能超过50个字符';
  }

  // 5. 访客人数：必填，≥1的整数
  if (data.visitor_count === undefined || data.visitor_count === null) {
    errors.visitor_count = '访客人数至少为1人';
  } else if (!Number.isInteger(data.visitor_count) || data.visitor_count < 1) {
    errors.visitor_count = '访客人数至少为1人';
  }

  // 6. 是否开车：必填，是/否
  if (data.is_driving === undefined || data.is_driving === null) {
    errors.is_driving = '请选择是否开车';
  }

  // 7. 车牌号：开车时必填+格式校验
  if (data.is_driving) {
    if (!data.license_plate || !data.license_plate.trim()) {
      errors.license_plate = '开车必须填写车牌号';
    } else if (!/^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤川青藏琼宁][A-Z][A-HJ-NP-Z0-9]{4,5}[A-HJ-NP-Z0-9挂学警港澳]$/.test(data.license_plate)) {
      errors.license_plate = '请输入正确的车牌号格式';
    }
  }

  // 8. 内部对接人：必填，≤20字符
  if (!data.contact_person || !data.contact_person.trim()) {
    errors.contact_person = '请填写内部对接人姓名';
  } else if (data.contact_person.length > 20) {
    errors.contact_person = '内部对接人姓名不能超过20个字符';
  }

  // 9. 对接人部门：必填，从预设列表选择
  if (!data.department_id || !data.department_id.trim()) {
    errors.department_id = '请选择对接人部门';
  }

  // 10. 拜访起始时间：必填，HH:mm
  if (!data.visit_start_time || !data.visit_start_time.trim()) {
    errors.visit_start_time = '请选择拜访起始时间';
  }

  // 11. 拜访结束时间：必填，晚于起始时间
  if (!data.visit_end_time || !data.visit_end_time.trim()) {
    errors.visit_end_time = '请选择拜访结束时间';
  } else if (data.visit_start_time && data.visit_end_time <= data.visit_start_time) {
    errors.visit_end_time = '结束时间不能早于起始时间';
  }

  // 12. 到访事宜：必填，≤200字符
  if (!data.visit_purpose || !data.visit_purpose.trim()) {
    errors.visit_purpose = '请输入到访事宜';
  } else if (data.visit_purpose.length > 200) {
    errors.visit_purpose = '到访事宜不能超过200个字符';
  }

  // 13. 附件：选填，最多1个（由前端控制，后端仅校验 URL 格式）
  if (data.attachment_url && data.attachment_url.trim() && data.attachment_url.length > 500) {
    errors.attachment_url = '附件URL过长';
  }

  return errors;
}

/**
 * 校验失败时返回第一个错误信息
 */
export function getFirstError(errors: ValidationErrors): string | null {
  const keys = Object.keys(errors);
  return keys.length > 0 ? errors[keys[0]] : null;
}
