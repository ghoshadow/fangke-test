import { getDatabase, generateId } from '../config';
import type { ApprovalRecord, CreateApprovalRecordInput, OperationType } from '../../shared/types';

function rowToApprovalRecord(row: unknown[]): ApprovalRecord {
  const r = row as (string | null)[];
  return {
    id: r[0] as string,
    application_id: r[1] as string,
    operation_type: r[2] as OperationType,
    reason: r[3] as string | null,
    operator_session_id: r[4] as string,
    operated_at: r[5] as string,
  };
}

const ALL_COLUMNS = 'id, application_id, operation_type, reason, operator_session_id, operated_at';

export const ApprovalRecordModel = {
  /** 创建审批记录（只写） */
  create(input: CreateApprovalRecordInput): ApprovalRecord {
    const db = getDatabase();
    const id = generateId();
    const reason = input.reason ?? null;
    db.run(
      `INSERT INTO approval_record (${ALL_COLUMNS}) VALUES (?,?,?,?,?,?)`,
      [id, input.application_id, input.operation_type, reason, input.operator_session_id, input.operated_at]
    );
    return { id, application_id: input.application_id, operation_type: input.operation_type, reason, operator_session_id: input.operator_session_id, operated_at: input.operated_at };
  },

  /** 按申请 ID 查询审批记录 */
  findByApplicationId(applicationId: string): ApprovalRecord[] {
    const db = getDatabase();
    const result = db.exec(
      `SELECT ${ALL_COLUMNS} FROM approval_record WHERE application_id = ? ORDER BY operated_at ASC`,
      [applicationId]
    );
    return result.length ? result[0].values.map(rowToApprovalRecord) : [];
  },

  /** 查询指定申请是否已被指定 session 审批过（防重复） */
  existsByApplicationAndSession(applicationId: string, sessionId: string): boolean {
    const db = getDatabase();
    const result = db.exec(
      'SELECT COUNT(*) FROM approval_record WHERE application_id = ? AND operator_session_id = ?',
      [applicationId, sessionId]
    );
    return ((result[0]?.values[0]?.[0] as number) || 0) > 0;
  },

  /**
   * ⛔ 禁止 UPDATE 和 DELETE
   * 以下方法故意不提供：update(), delete(), deleteByApplicationId()
   * 审批记录表只写不删不改
   */
};
