import { getDatabase, generateId, now } from '../config';
import type {
  VisitorApplication,
  CreateApplicationInput,
  ApprovalStatus,
  PassStatus,
  PaginationResult,
  ApplicationQuery,
  RecordQuery,
} from '../../shared/types';

function rowToApplication(row: unknown[]): VisitorApplication {
  const r = row as (string | number | null)[];
  return {
    id: r[0] as string,
    visitor_name: r[1] as string,
    phone: r[2] as string,
    id_card: r[3] as string | null,
    company: r[4] as string | null,
    visitor_count: r[5] as number,
    is_driving: (r[6] as number) === 1,
    license_plate: r[7] as string | null,
    contact_person: r[8] as string,
    department_id: r[9] as string,
    visit_start_time: r[10] as string,
    visit_end_time: r[11] as string,
    visit_purpose: r[12] as string,
    attachment_url: r[13] as string | null,
    approval_status: r[14] as ApprovalStatus,
    pass_status: r[15] as PassStatus | null,
    session_id: r[16] as string,
    version: r[17] as number,
    created_at: r[18] as string,
    updated_at: r[19] as string,
  };
}

const ALL_COLUMNS = `id, visitor_name, phone, id_card, company, visitor_count, is_driving, license_plate, contact_person, department_id, visit_start_time, visit_end_time, visit_purpose, attachment_url, approval_status, pass_status, session_id, version, created_at, updated_at`;

export const ApplicationModel = {
  /** 创建申请 */
  create(input: CreateApplicationInput): VisitorApplication {
    const db = getDatabase();
    const id = generateId();
    const timestamp = now();
    db.run(
      `INSERT INTO visitor_application (${ALL_COLUMNS}) VALUES (?,?,?,?,?,?,?, ?,?,?,?,?, ?,?,?, ?,?,?,?,?)`,
      [
        id, input.visitor_name, input.phone, input.id_card ?? null, input.company ?? null,
        input.visitor_count, input.is_driving ? 1 : 0, input.license_plate ?? null,
        input.contact_person, input.department_id,
        input.visit_start_time, input.visit_end_time, input.visit_purpose,
        input.attachment_url ?? null, 'pending', null,
        input.session_id, 1, timestamp, timestamp,
      ]
    );
    return this.findById(id)!;
  },

  /** 按 ID 查找 */
  findById(id: string): VisitorApplication | null {
    const db = getDatabase();
    const result = db.exec(`SELECT ${ALL_COLUMNS} FROM visitor_application WHERE id = ?`, [id]);
    if (!result.length || !result[0].values.length) return null;
    return rowToApplication(result[0].values[0]);
  },

  /** 按条件查询（分页） */
  query(q: ApplicationQuery): PaginationResult<VisitorApplication> {
    const db = getDatabase();
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (q.session_id) { conditions.push('session_id = ?'); params.push(q.session_id); }
    if (q.approval_status) { conditions.push('approval_status = ?'); params.push(q.approval_status); }
    if (q.phone) { conditions.push('phone = ?'); params.push(q.phone); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const page = q.page || 1;
    const pageSize = q.page_size || 20;
    const offset = (page - 1) * pageSize;

    const countResult = db.exec(`SELECT COUNT(*) FROM visitor_application ${where}`, params);
    const total = (countResult[0]?.values[0]?.[0] as number) || 0;

    const result = db.exec(
      `SELECT ${ALL_COLUMNS} FROM visitor_application ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    const items = result.length ? result[0].values.map(rowToApplication) : [];

    return { items, total, page, page_size: pageSize };
  },

  /** 多维度筛选查询（记录查询） */
  recordQuery(q: RecordQuery): PaginationResult<VisitorApplication> {
    const db = getDatabase();
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (q.visitor_name) { conditions.push('visitor_name LIKE ?'); params.push(`%${q.visitor_name}%`); }
    if (q.phone) { conditions.push('phone = ?'); params.push(q.phone); }
    if (q.id_card) { conditions.push('id_card = ?'); params.push(q.id_card); }
    if (q.department_id) { conditions.push('department_id = ?'); params.push(q.department_id); }
    if (q.approval_status) { conditions.push('approval_status = ?'); params.push(q.approval_status); }
    if (q.pass_status) { conditions.push('pass_status = ?'); params.push(q.pass_status); }
    if (q.visit_start_from) { conditions.push("REPLACE(visit_start_time, 'T', ' ') >= ?"); params.push(q.visit_start_from.replace('T', ' ')); }
    if (q.visit_start_to) { conditions.push("REPLACE(visit_start_time, 'T', ' ') <= ?"); params.push(q.visit_start_to.replace('T', ' ')); }
    if (q.created_from) { conditions.push('created_at >= ?'); params.push(q.created_from); }
    if (q.created_to) { conditions.push('created_at <= ?'); params.push(q.created_to); }
    if (q.contact_person) { conditions.push('contact_person LIKE ?'); params.push(`%${q.contact_person}%`); }
    if (q.company) { conditions.push('company LIKE ?'); params.push(`%${q.company}%`); }
    if (q.license_plate) { conditions.push('license_plate LIKE ?'); params.push(`%${q.license_plate}%`); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const page = q.page || 1;
    const pageSize = q.page_size || 20;
    const offset = (page - 1) * pageSize;

    const countResult = db.exec(`SELECT COUNT(*) FROM visitor_application ${where}`, params);
    const total = (countResult[0]?.values[0]?.[0] as number) || 0;

    const result = db.exec(
      `SELECT ${ALL_COLUMNS} FROM visitor_application ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    const items = result.length ? result[0].values.map(rowToApplication) : [];

    return { items, total, page, page_size: pageSize };
  },

  /** 更新审批状态（乐观锁：仅当 version 匹配时才更新） */
  updateApprovalStatus(id: string, status: ApprovalStatus, expectedVersion: number): boolean {
    const db = getDatabase();
    db.run(
      'UPDATE visitor_application SET approval_status = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?',
      [status, now(), id, expectedVersion],
    );
    // 验证更新是否生效（version 不匹配则 affected rows = 0）
    const result = db.exec('SELECT version FROM visitor_application WHERE id = ?', [id]);
    const newVersion = result[0]?.values[0]?.[0] as number | undefined;
    return newVersion === expectedVersion + 1;
  },

  /** 更新通行状态 */
  updatePassStatus(id: string, status: PassStatus): void {
    const db = getDatabase();
    db.run('UPDATE visitor_application SET pass_status = ?, version = version + 1, updated_at = ? WHERE id = ?', [status, now(), id]);
  },

  /** 更新申请字段（退回重提场景） */
  updateFields(id: string, fields: Partial<CreateApplicationInput>): void {
    const db = getDatabase();
    const sets: string[] = [];
    const params: (string | number | null)[] = [];

    const allowedFields: (keyof CreateApplicationInput)[] = [
      'visitor_name', 'phone', 'id_card', 'company', 'visitor_count',
      'is_driving', 'license_plate', 'contact_person', 'department_id',
      'visit_start_time', 'visit_end_time', 'visit_purpose', 'attachment_url',
    ];

    for (const key of allowedFields) {
      if (key in fields) {
        sets.push(`${key} = ?`);
        const val = fields[key];
        if (key === 'is_driving') {
          params.push(val ? 1 : 0);
        } else {
          params.push(val as string | number | null);
        }
      }
    }

    if (!sets.length) return;
    sets.push('approval_status = ?');
    params.push('pending');
    sets.push('version = version + 1');
    sets.push('updated_at = ?');
    params.push(now());
    params.push(id);

    db.run(`UPDATE visitor_application SET ${sets.join(', ')} WHERE id = ?`, params);
  },

  /** 按 session_id 查询我创建的申请 */
  findBySessionId(sessionId: string): VisitorApplication[] {
    const db = getDatabase();
    const result = db.exec(
      `SELECT ${ALL_COLUMNS} FROM visitor_application WHERE session_id = ? ORDER BY created_at DESC`,
      [sessionId]
    );
    return result.length ? result[0].values.map(rowToApplication) : [];
  },
};
