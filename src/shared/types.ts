// ============ 枚举常量 ============

/** 审批状态 */
export const ApprovalStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  RETURNED: 'returned',
  REJECTED: 'rejected',
} as const;
export type ApprovalStatus = (typeof ApprovalStatus)[keyof typeof ApprovalStatus];

/** 通行状态 */
export const PassStatus = {
  NOT_VISITED: 'not_visited',
  VISITED: 'visited',
} as const;
export type PassStatus = (typeof PassStatus)[keyof typeof PassStatus];

/** 审批操作类型 */
export const OperationType = {
  APPROVE: 'approve',
  RETURN: 'return',
  REJECT: 'reject',
} as const;
export type OperationType = (typeof OperationType)[keyof typeof OperationType];

// ============ 数据表类型 ============

/** 访客申请 */
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

/** 审批记录 */
export interface ApprovalRecord {
  id: string;
  application_id: string;
  operation_type: OperationType;
  reason: string | null;
  operator_session_id: string;
  operated_at: string;
}

/** 通行证 */
export interface VisitorPass {
  id: string;
  application_id: string;
  pass_status: PassStatus;
  actual_visit_time: string | null;
  created_at: string;
}

/** 部门 */
export interface Department {
  id: string;
  name: string;
  sort_order: number;
}

/** 草稿 */
export interface Draft {
  id: string;
  session_id: string;
  application_id: string | null;
  form_data: string; // JSON string
  saved_at: string;
}

// ============ 创建输入类型 ============

export type CreateApplicationInput = Omit<VisitorApplication, 'id' | 'approval_status' | 'pass_status' | 'created_at' | 'updated_at'>;

export type CreateApprovalRecordInput = Omit<ApprovalRecord, 'id'>;

export type CreateVisitorPassInput = Omit<VisitorPass, 'id' | 'pass_status' | 'actual_visit_time' | 'created_at'>;

export type CreateDraftInput = Omit<Draft, 'id' | 'saved_at'>;

// ============ 分页类型 ============

export interface PaginationResult<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

// ============ 查询筛选类型 ============

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
