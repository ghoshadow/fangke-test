// ============================================================
// 校园访客管理系统 — 共享类型定义
// ============================================================

// ---------- 通用 API 响应 ----------

export interface ApiResponse<T = unknown> {
  code: number;
  msg: string;
  data: T;
}

export interface PaginationResult<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export type PaginatedResponse<T> = ApiResponse<PaginationResult<T>>;

// ---------- 枚举常量（字符串字面量类型） ----------

export type ApprovalStatus = 'pending' | 'approved' | 'returned' | 'rejected';

export type PassStatus = 'not_visited' | 'visited';

export type OperationType = 'approve' | 'return' | 'reject';

// ---------- 审批状态显示文本 ----------

export const ApprovalStatusLabels: Record<ApprovalStatus, string> = {
  pending: '待审批',
  approved: '已同意',
  returned: '已退回',
  rejected: '已拒绝',
};

export const PassStatusLabels: Record<PassStatus, string> = {
  not_visited: '未到访',
  visited: '已到访',
};

export const OperationTypeLabels: Record<OperationType, string> = {
  approve: '同意',
  return: '退回',
  reject: '拒绝',
};

// ---------- 访客申请 ----------

export interface VisitorApplication {
  id: string;
  visitor_name: string;
  phone: string;
  id_card: string | null;
  company: string | null;
  visitor_count: number;
  is_driving: boolean;
  license_plate: string | null;
  contact_person: string;
  department_id: string;
  visit_start_time: string;
  visit_end_time: string;
  visit_purpose: string;
  attachment_url: string | null;
  approval_status: ApprovalStatus;
  pass_status: PassStatus | null;
  session_id: string;
  created_at: string;
  updated_at: string;
}

export interface CreateApplicationInput {
  visitor_name: string;
  phone: string;
  id_card?: string | null;
  company?: string | null;
  visitor_count: number;
  is_driving: boolean;
  license_plate?: string | null;
  contact_person: string;
  department_id: string;
  visit_start_time: string;
  visit_end_time: string;
  visit_purpose: string;
  attachment_url?: string | null;
  session_id: string;
}

export interface ApplicationQuery {
  session_id?: string;
  approval_status?: ApprovalStatus;
  phone?: string;
  page?: number;
  page_size?: number;
}

export interface RecordQuery {
  visitor_name?: string;
  phone?: string;
  department_id?: string;
  approval_status?: ApprovalStatus;
  pass_status?: PassStatus;
  visit_start_from?: string;
  visit_start_to?: string;
  created_from?: string;
  created_to?: string;
  contact_person?: string;
  page?: number;
  page_size?: number;
}

// ---------- 审批记录 ----------

export interface ApprovalRecord {
  id: string;
  application_id: string;
  operation_type: OperationType;
  reason: string | null;
  operator_session_id: string;
  operated_at: string;
}

export interface CreateApprovalRecordInput {
  application_id: string;
  operation_type: OperationType;
  reason?: string | null;
  operator_session_id: string;
  operated_at: string;
}

// ---------- 通行证 ----------

export interface VisitorPass {
  id: string;
  application_id: string;
  pass_status: PassStatus;
  actual_visit_time: string | null;
  created_at: string;
}

export interface CreateVisitorPassInput {
  application_id: string;
}

// ---------- 部门 ----------

export interface Department {
  id: string;
  name: string;
  sort_order: number;
}

// ---------- 草稿 ----------

export interface Draft {
  id: string;
  session_id: string;
  application_id: string | null;
  form_data: string;
  saved_at: string;
}

export interface CreateDraftInput {
  session_id: string;
  application_id?: string | null;
  form_data: string;
}

// ---------- 表单校验错误 ----------

export type ValidationErrors = Record<string, string>;
