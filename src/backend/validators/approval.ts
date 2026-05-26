import { ApprovalRecordModel } from '../models/approval-record';

export interface ApprovalValidationResult {
  valid: boolean;
  code?: number;
  msg?: string;
}

/**
 * 校验审批操作前置条件
 * 1. 申请必须处于 pending 状态
 * 2. 同一 operator 不可重复审批同一申请
 */
export function validateApprovalOperation(
  applicationId: string,
  operatorSessionId: string,
  currentApprovalStatus: string,
): ApprovalValidationResult {
  // 校验申请状态
  if (currentApprovalStatus !== 'pending') {
    return {
      valid: false,
      code: 40010,
      msg: '该申请已处理，不可重复操作',
    };
  }

  // 校验防重复（同一 session 不可重复审批同一申请）
  const alreadyProcessed = ApprovalRecordModel.existsByApplicationAndSession(
    applicationId,
    operatorSessionId,
  );
  if (alreadyProcessed) {
    return {
      valid: false,
      code: 40011,
      msg: '您已处理过该申请，不可重复操作',
    };
  }

  return { valid: true };
}

/**
 * 校验退回/拒绝操作必须填写原因
 */
export function validateReasonRequired(reason: string | undefined | null, action: 'return' | 'reject'): ApprovalValidationResult {
  if (!reason || !reason.trim()) {
    return {
      valid: false,
      code: 40012,
      msg: action === 'return' ? '退回必须填写原因' : '拒绝必须填写原因',
    };
  }
  if (reason.length > 500) {
    return {
      valid: false,
      code: 40013,
      msg: '原因不能超过500个字符',
    };
  }
  return { valid: true };
}
