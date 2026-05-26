import { getDatabase, generateId, now } from '../config';
import type { VisitorPass, CreateVisitorPassInput, PassStatus } from '../../shared/types';

function rowToVisitorPass(row: unknown[]): VisitorPass {
  const r = row as (string | null)[];
  return {
    id: r[0] as string,
    application_id: r[1] as string,
    pass_status: r[2] as PassStatus,
    actual_visit_time: r[3] as string | null,
    created_at: r[4] as string,
  };
}

const ALL_COLUMNS = 'id, application_id, pass_status, actual_visit_time, created_at';

export const VisitorPassModel = {
  /** 创建通行证（审批通过时自动生成） */
  create(input: CreateVisitorPassInput): VisitorPass {
    const db = getDatabase();
    const id = generateId();
    const timestamp = now();
    db.run(
      `INSERT INTO visitor_pass (${ALL_COLUMNS}) VALUES (?,?,?,?,?)`,
      [id, input.application_id, 'not_visited', null, timestamp]
    );
    return this.findById(id)!;
  },

  /** 按 ID 查找 */
  findById(id: string): VisitorPass | null {
    const db = getDatabase();
    const result = db.exec(`SELECT ${ALL_COLUMNS} FROM visitor_pass WHERE id = ?`, [id]);
    if (!result.length || !result[0].values.length) return null;
    return rowToVisitorPass(result[0].values[0]);
  },

  /** 按申请 ID 查找（一对一） */
  findByApplicationId(applicationId: string): VisitorPass | null {
    const db = getDatabase();
    const result = db.exec(`SELECT ${ALL_COLUMNS} FROM visitor_pass WHERE application_id = ?`, [applicationId]);
    if (!result.length || !result[0].values.length) return null;
    return rowToVisitorPass(result[0].values[0]);
  },

  /** 查询通行证列表（分页） */
  query(params: { pass_status?: PassStatus; page?: number; page_size?: number }): {
    items: VisitorPass[];
    total: number;
    page: number;
    page_size: number;
  } {
    const db = getDatabase();
    const conditions: string[] = [];
    const queryParams: (string | number)[] = [];

    if (params.pass_status) {
      conditions.push('pass_status = ?');
      queryParams.push(params.pass_status);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const page = params.page || 1;
    const pageSize = params.page_size || 20;
    const offset = (page - 1) * pageSize;

    const countResult = db.exec(`SELECT COUNT(*) FROM visitor_pass ${where}`, queryParams);
    const total = (countResult[0]?.values[0]?.[0] as number) || 0;

    const result = db.exec(
      `SELECT ${ALL_COLUMNS} FROM visitor_pass ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...queryParams, pageSize, offset]
    );
    const items = result.length ? result[0].values.map(rowToVisitorPass) : [];

    return { items, total, page, page_size: pageSize };
  },

  /** 确认到访（终态操作，不可回滚） */
  confirmVisit(id: string): void {
    const db = getDatabase();
    const pass = this.findById(id);
    if (!pass) throw new Error('通行证不存在');
    if (pass.pass_status === 'visited') throw new Error('已确认到访，不可重复操作');

    db.run(
      'UPDATE visitor_pass SET pass_status = ?, actual_visit_time = ? WHERE id = ?',
      ['visited', now(), id]
    );
  },

  /** 按关键词搜索通行证（关联申请表获取访客信息） */
  search(keyword: string, page = 1, pageSize = 20): {
    items: (VisitorPass & { visitor_name: string; phone: string })[];
    total: number;
    page: number;
    page_size: number;
  } {
    const db = getDatabase();
    const offset = (page - 1) * pageSize;
    const likeKeyword = `%${keyword}%`;

    const sql = `
      SELECT vp.id, vp.application_id, vp.pass_status, vp.actual_visit_time, vp.created_at,
             va.visitor_name, va.phone
      FROM visitor_pass vp
      JOIN visitor_application va ON vp.application_id = va.id
      WHERE va.visitor_name LIKE ? OR va.phone LIKE ?
      ORDER BY vp.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const countResult = db.exec(
      `SELECT COUNT(*) FROM visitor_pass vp JOIN visitor_application va ON vp.application_id = va.id
       WHERE va.visitor_name LIKE ? OR va.phone LIKE ?`,
      [likeKeyword, likeKeyword]
    );
    const total = (countResult[0]?.values[0]?.[0] as number) || 0;

    const result = db.exec(sql, [likeKeyword, likeKeyword, pageSize, offset]);
    const items = result.length
      ? result[0].values.map((row: unknown[]) => {
          const pass = rowToVisitorPass(row);
          return { ...pass, visitor_name: row[5] as string, phone: row[6] as string };
        })
      : [];

    return { items, total, page, page_size: pageSize };
  },
};
