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
export type ApprovalStatus = ApprovalStatusType;

export const PassStatus = {
  NOT_VISITED: 'not_visited',
  VISITED: 'visited',
} as const;

export type PassStatusType = (typeof PassStatus)[keyof typeof PassStatus];
export type PassStatus = PassStatusType;

export const ApprovalAction = {
  APPROVE: 'approve',
  RETURN: 'return',
  REJECT: 'reject',
} as const;

export type ApprovalActionType = (typeof ApprovalAction)[keyof typeof ApprovalAction];

export type OperationType = ApprovalActionType;

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
  approval_status: ApprovalStatusType;
  pass_status: PassStatusType | null;
  session_id: string;
  created_at: string;
  updated_at: string;
}

/** 创建申请的输入（不含 id、状态、时间戳等服务端字段） */
export type CreateApplicationInput = Omit<
  VisitorApplication,
  'id' | 'approval_status' | 'pass_status' | 'created_at' | 'updated_at'
>;

/** 申请列表查询参数 */
export interface ApplicationQuery {
  session_id?: string;
  approval_status?: ApprovalStatusType;
  phone?: string;
  page?: number;
  page_size?: number;
}

/** 记录多维度查询参数 */
export interface RecordQuery {
  visitor_name?: string;
  phone?: string;
  id_card?: string;
  department_id?: string;
  approval_status?: ApprovalStatusType;
  pass_status?: PassStatusType;
  visit_start_from?: string;
  visit_start_to?: string;
  created_from?: string;
  created_to?: string;
  contact_person?: string;
  company?: string;
  license_plate?: string;
  page?: number;
  page_size?: number;
}

/** 通用分页结果 */
export interface PaginationResult<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
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

export type CreateApprovalRecordInput = Omit<ApprovalRecord, 'id'>;

// ---------- 通行证 ----------

export interface VisitorPass {
  id: string;
  application_id: string;
  pass_status: PassStatusType;
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
  application_id: string | null;
  form_data: string;
}

// ---------- 表单校验错误 ----------

export type ValidationErrors = Record<string, string>;
