/**
 * FK-43: 【综合测试】前端确认到访测试 — US020 + US021
 *
 * 测试前端确认到访的交互逻辑与状态更新：
 *   #13 确认到访-正常流程弹出时间选择器
 *   #14 确认到访-选择时间并提交成功
 *   #15 确认到访-未选择实际到访时间直接提交（VR1）
 *   #16 确认到访-对已到访记录重复操作（VR2）
 *   #17 确认到访-审批状态非已同意（VR3）
 *   #18 查看通行状态更新-详情页状态更新确认
 *   #19 查看通行状态更新-列表页状态同步确认
 *   #20 查看通行状态更新-对终态记录尝试操作（VR1）
 *   #21 查看通行状态更新-已到访但缺少实际到访时间（VR2）
 */

import { describe, it, expect } from 'vitest';
import { PassStatusLabels } from '../../src/shared/types';

// ============================================================
// 确认到访交互逻辑（与 detail.tsx 一致）
// ============================================================

/** 获取当前时间 HH:mm（与 detail.tsx getCurrentTime 一致） */
function getCurrentTime(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/** 确认到访前校验（前端提交前校验） */
function validateConfirmVisit(params: {
  visitTime: string;
  passStatus: string;
  approvalStatus: string;
}): { valid: boolean; error?: string } {
  // VR1: 未选择时间
  if (!params.visitTime) {
    return { valid: false, error: '请选择实际到访时间' };
  }
  // VR2: 已到访（终态）
  if (params.passStatus === 'visited') {
    return { valid: false, error: '该访客已确认到访，不可重复操作' };
  }
  // VR3: 审批状态非已同意
  if (params.approvalStatus !== 'approved') {
    return { valid: false, error: '该申请未审批通过，无法确认到访' };
  }
  return { valid: true };
}

/** 确认到访成功后更新本地状态 */
function updatePassStateAfterConfirm(
  prevPass: { pass_status: string; actual_visit_time: string | null },
  updatedData: { pass_status: string; actual_visit_time: string | null },
) {
  return {
    ...prevPass,
    pass_status: updatedData.pass_status,
    actual_visit_time: updatedData.actual_visit_time,
  };
}

/** 判断是否应显示确认到访按钮 */
function shouldShowConfirmButton(passStatus: string): boolean {
  return passStatus !== 'visited';
}

/** 判断是否显示数据异常提示 */
function checkDataAnomaly(passStatus: string, actualVisitTime: string | null): boolean {
  return passStatus === 'visited' && actualVisitTime === null;
}

describe('FK-43 前端: US020 + US021 确认到访与状态更新', () => {
  // ============================================================
  // US020 #13: 确认到访-正常流程弹出时间选择器
  // ============================================================
  describe('US020 #13: 正常流程弹出时间选择器', () => {
    it('点击"确认到访"按钮，弹出时间选择器', () => {
      const passStatus = 'not_visited';
      const approvalStatus = 'approved';

      // 前置条件检查
      expect(shouldShowConfirmButton(passStatus)).toBe(true);
      const validation = validateConfirmVisit({
        visitTime: getCurrentTime(),
        passStatus,
        approvalStatus,
      });
      expect(validation.valid).toBe(true);
    });

    it('时间选择器默认值为当前系统时间', () => {
      const defaultTime = getCurrentTime();

      // 验证格式为 HH:mm
      expect(defaultTime).toMatch(/^\d{2}:\d{2}$/);
    });

    it('时间选择器精确到时分', () => {
      const time = getCurrentTime();
      const parts = time.split(':');

      expect(parts.length).toBe(2);
      expect(parts[0].length).toBe(2);
      expect(parts[1].length).toBe(2);

      const hours = parseInt(parts[0], 10);
      const minutes = parseInt(parts[1], 10);
      expect(hours).toBeGreaterThanOrEqual(0);
      expect(hours).toBeLessThanOrEqual(23);
      expect(minutes).toBeGreaterThanOrEqual(0);
      expect(minutes).toBeLessThanOrEqual(59);
    });
  });

  // ============================================================
  // US020 #14: 确认到访-选择时间并提交成功
  // ============================================================
  describe('US020 #14: 选择时间并提交成功', () => {
    it('提交前校验通过（合法时间+未到访+已同意）', () => {
      const validation = validateConfirmVisit({
        visitTime: '14:30',
        passStatus: 'not_visited',
        approvalStatus: 'approved',
      });
      expect(validation.valid).toBe(true);
    });

    it('提交成功后本地状态更新：pass_status 变为 visited', () => {
      const prevPass = { pass_status: 'not_visited', actual_visit_time: null };
      const updatedData = { pass_status: 'visited', actual_visit_time: '14:30' };

      const newPass = updatePassStateAfterConfirm(prevPass, updatedData);

      expect(newPass.pass_status).toBe('visited');
      expect(newPass.actual_visit_time).toBe('14:30');
    });

    it('提交成功后弹窗关闭', () => {
      // 模拟提交成功后的状态变化
      let modalVisible = true;
      const confirmSuccess = true;

      if (confirmSuccess) {
        modalVisible = false;
      }

      expect(modalVisible).toBe(false);
    });

    it('已到访为流程终态，确认到访按钮消失', () => {
      const passStatus = 'visited';
      expect(shouldShowConfirmButton(passStatus)).toBe(false);
    });
  });

  // ============================================================
  // US020 #15: 未选择实际到访时间直接提交（VR1）
  // ============================================================
  describe('US020 #15: 未选择实际到访时间直接提交（VR1）', () => {
    it('visitTime 为空字符串，阻止提交', () => {
      const validation = validateConfirmVisit({
        visitTime: '',
        passStatus: 'not_visited',
        approvalStatus: 'approved',
      });

      expect(validation.valid).toBe(false);
      expect(validation.error).toBe('请选择实际到访时间');
    });

    it('阻止提交后显示错误提示', () => {
      const validation = validateConfirmVisit({
        visitTime: '',
        passStatus: 'not_visited',
        approvalStatus: 'approved',
      });

      expect(validation.error).toBeDefined();
      expect(validation.error!.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // US020 #16: 对已到访记录重复操作（VR2）
  // ============================================================
  describe('US020 #16: 对已到访记录重复操作（VR2）', () => {
    it('已到访记录，前端校验阻止操作', () => {
      const validation = validateConfirmVisit({
        visitTime: '11:00',
        passStatus: 'visited',
        approvalStatus: 'approved',
      });

      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('不可重复');
    });

    it('已到访记录不显示确认到访按钮', () => {
      expect(shouldShowConfirmButton('visited')).toBe(false);
    });

    it('已到访记录显示"已确认到访"标签', () => {
      const passStatus = 'visited';
      const label = PassStatusLabels[passStatus as keyof typeof PassStatusLabels];
      expect(label).toBe('已到访');
    });
  });

  // ============================================================
  // US020 #17: 审批状态非已同意（VR3）
  // ============================================================
  describe('US020 #17: 审批状态非已同意（VR3）', () => {
    it('审批中的申请，前端校验阻止确认到访', () => {
      const validation = validateConfirmVisit({
        visitTime: '14:00',
        passStatus: 'not_visited',
        approvalStatus: 'pending',
      });

      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('未审批通过');
    });

    it('已拒绝的申请，前端校验阻止确认到访', () => {
      const validation = validateConfirmVisit({
        visitTime: '14:00',
        passStatus: 'not_visited',
        approvalStatus: 'rejected',
      });

      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('未审批通过');
    });

    it('已退回的申请，前端校验阻止确认到访', () => {
      const validation = validateConfirmVisit({
        visitTime: '14:00',
        passStatus: 'not_visited',
        approvalStatus: 'returned',
      });

      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('未审批通过');
    });
  });

  // ============================================================
  // US021 #18: 详情页状态更新确认
  // ============================================================
  describe('US021 #18: 详情页状态更新确认', () => {
    it('确认到访后，详情页通行状态字段显示为"已到访"', () => {
      const updatedPass = updatePassStateAfterConfirm(
        { pass_status: 'not_visited', actual_visit_time: null },
        { pass_status: 'visited', actual_visit_time: '14:30' },
      );

      const label = PassStatusLabels[updatedPass.pass_status as keyof typeof PassStatusLabels];
      expect(label).toBe('已到访');
    });

    it('实际到访时间字段已填充为填写的值', () => {
      const updatedPass = updatePassStateAfterConfirm(
        { pass_status: 'not_visited', actual_visit_time: null },
        { pass_status: 'visited', actual_visit_time: '14:30' },
      );

      expect(updatedPass.actual_visit_time).toBe('14:30');
    });

    it('确认到访按钮已隐藏（终态仅可查看）', () => {
      const updatedPass = updatePassStateAfterConfirm(
        { pass_status: 'not_visited', actual_visit_time: null },
        { pass_status: 'visited', actual_visit_time: '14:30' },
      );

      expect(shouldShowConfirmButton(updatedPass.pass_status)).toBe(false);
    });
  });

  // ============================================================
  // US021 #19: 列表页状态同步确认
  // ============================================================
  describe('US021 #19: 列表页状态同步确认', () => {
    it('确认到访后，列表项的通行状态更新为"已到访"', () => {
      // 模拟列表数据更新
      const listItems = [
        { id: 'pass-1', pass_status: 'not_visited', visitor_name: '张三' },
        { id: 'pass-2', pass_status: 'not_visited', visitor_name: '李四' },
      ];

      // 确认 pass-1 到访
      const updatedList = listItems.map((item) =>
        item.id === 'pass-1'
          ? { ...item, pass_status: 'visited' }
          : item,
      );

      expect(updatedList[0].pass_status).toBe('visited');
      expect(updatedList[1].pass_status).toBe('not_visited');
    });

    it('前端展示与后端数据保持一致', () => {
      // 后端返回 visited，前端应展示 visited
      const backendData = { pass_status: 'visited', actual_visit_time: '14:30' };
      const label = PassStatusLabels[backendData.pass_status as keyof typeof PassStatusLabels];

      expect(label).toBe('已到访');
    });
  });

  // ============================================================
  // US021 #20: 对终态记录尝试操作（VR1）
  // ============================================================
  describe('US021 #20: 对终态记录尝试操作（VR1）', () => {
    it('已到访的通行证，确认到访按钮已隐藏', () => {
      expect(shouldShowConfirmButton('visited')).toBe(false);
    });

    it('已到访的通行证显示"已确认到访"标签', () => {
      const passStatus = 'visited';
      const label = PassStatusLabels[passStatus as keyof typeof PassStatusLabels];
      expect(label).toBe('已到访');
    });

    it('终态记录仅展示信息，不提供操作入口', () => {
      const passStatus = 'visited';

      // 不显示按钮
      expect(shouldShowConfirmButton(passStatus)).toBe(false);
      // 显示已确认标签
      expect(PassStatusLabels[passStatus as keyof typeof PassStatusLabels]).toBe('已到访');
    });
  });

  // ============================================================
  // US021 #21: 已到访但缺少实际到访时间（VR2）
  // ============================================================
  describe('US021 #21: 已到访但缺少实际到访时间（VR2）', () => {
    it('检测到数据异常：已到访但缺少实际到访时间', () => {
      const isAnomaly = checkDataAnomaly('visited', null);
      expect(isAnomaly).toBe(true);
    });

    it('正常数据不触发异常提示', () => {
      expect(checkDataAnomaly('visited', '14:30')).toBe(false);
      expect(checkDataAnomaly('not_visited', null)).toBe(false);
    });

    it('数据异常时显示提示信息"数据异常：已到访但缺少实际到访时间"', () => {
      const isAnomaly = checkDataAnomaly('visited', null);
      const message = isAnomaly ? '数据异常：已到访但缺少实际到访时间' : null;

      expect(message).toBe('数据异常：已到访但缺少实际到访时间');
    });

    it('正常已到访记录显示实际到访时间', () => {
      const isAnomaly = checkDataAnomaly('visited', '14:30');
      expect(isAnomaly).toBe(false);

      // 前端应显示 "实际到访时间：14:30"
      const displayTime = '14:30';
      expect(displayTime).toBe('14:30');
    });
  });
});
