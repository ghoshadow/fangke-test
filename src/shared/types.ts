// ============================================================
// 校园访客管理系统 — 共享类型定义
// ============================================================

// ---------- 通用 API 响应 ----------

export interface ApiResponse<T = unknown> {
  code: number;
  msg: string;
  data: T;
}

export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export type PaginatedResponse<T> = ApiResponse<PaginatedData<T>>;

// ---------- 枚举常量 ----------

export const ApprovalStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  RETURNED: 'returned',
  REJECTED: 'rejected',
} as const;

export type ApprovalStatusType = (typeof ApprovalStatus)[keyof typeof ApprovalStatus];

export const PassStatus = {
  NOT_VISITED: 'not_visited',
  VISITED: 'visited',
} as const;

export type PassStatusType = (typeof PassStatus)[keyof typeof PassStatus];

export const ApprovalAction = {
  APPROVE: 'approve',
  RETURN: 'return',
  REJECT: 'reject',
} as const;

export type ApprovalActionType = (typeof ApprovalAction)[keyof typeof ApprovalAction];

// ---------- 审批状态显示文本 ----------

export const ApprovalStatusLabels: Record<ApprovalStatusType, string> = {
  [ApprovalStatus.PENDING]: '待审批',
  [ApprovalStatus.APPROVED]: '已同意',
  [ApprovalStatus.RETURNED]: '已退回',
  [ApprovalStatus.REJECTED]: '已拒绝',
};

export const PassStatusLabels: Record<PassStatusType, string> = {
  [PassStatus.NOT_VISITED]: '未到访',
  [PassStatus.VISITED]: '已到访',
};

// ---------- 访客申请 ----------

export interface VisitorApplication {
  id: string;
  session_id: string;
  visitor_name: string;
  phone: string;
  id_card?: string;
  visitor_unit?: string;
  visitor_count: number;
  has_vehicle: boolean;
  vehicle_plate?: string;
  contact_person: string;
  department: string;
  visit_start: string;
  visit_end: string;
  visit_purpose: string;
  attachment_url?: string;
  approval_status: ApprovalStatusType;
  pass_status?: PassStatusType;
  created_at: string;
  updated_at: string;
}

// ---------- 审批记录 ----------

export interface ApprovalRecord {
  id: string;
  application_id: string;
  action: ApprovalActionType;
  reason?: string;
  operator_session_id: string;
  created_at: string;
}

// ---------- 通行证 ----------

export interface VisitorPass {
  id: string;
  application_id: string;
  pass_code: string;
  pass_status: PassStatusType;
  confirmed_at?: string;
  created_at: string;
}

// ---------- 部门 ----------

export interface Department {
  id: string;
  name: string;
}

// ---------- 草稿 ----------

export interface Draft {
  id: string;
  session_id: string;
  data: Partial<VisitorApplication>;
  created_at: string;
  updated_at: string;
}

// ---------- 表单校验错误 ----------

export type ValidationErrors = Record<string, string>;
