import { getDatabase, generateId, now } from '../config';
import type { Draft, CreateDraftInput } from '../../shared/types';

function rowToDraft(row: unknown[]): Draft {
  const r = row as (string | null)[];
  return {
    id: r[0] as string,
    session_id: r[1] as string,
    application_id: r[2] as string | null,
    form_data: r[3] as string,
    saved_at: r[4] as string,
  };
}

const ALL_COLUMNS = 'id, session_id, application_id, form_data, saved_at';

export const DraftModel = {
  /**
   * 保存草稿（UPSERT：同一 session_id + application_id 只保留最新一条）
   * application_id 为 null 时代表新建场景的暂存
   */
  save(input: CreateDraftInput): Draft {
    const db = getDatabase();
    const timestamp = now();

    if (input.application_id) {
      // 退回重提场景：按 session_id + application_id 做 UPSERT
      const existing = db.exec(
        `SELECT id FROM draft WHERE session_id = ? AND application_id = ?`,
        [input.session_id, input.application_id]
      );

      if (existing.length && existing[0].values.length) {
        const existingId = existing[0].values[0][0] as string;
        db.run(
          'UPDATE draft SET form_data = ?, saved_at = ? WHERE id = ?',
          [input.form_data, timestamp, existingId]
        );
        return this.findById(existingId)!;
      }
    } else {
      // 新建场景：同一 session_id 且 application_id 为 null 只保留一条
      const existing = db.exec(
        `SELECT id FROM draft WHERE session_id = ? AND application_id IS NULL`,
        [input.session_id]
      );

      if (existing.length && existing[0].values.length) {
        const existingId = existing[0].values[0][0] as string;
        db.run(
          'UPDATE draft SET form_data = ?, saved_at = ? WHERE id = ?',
          [input.form_data, timestamp, existingId]
        );
        return this.findById(existingId)!;
      }
    }

    const id = generateId();
    db.run(
      `INSERT INTO draft (${ALL_COLUMNS}) VALUES (?,?,?,?,?)`,
      [id, input.session_id, input.application_id, input.form_data, timestamp]
    );
    return this.findById(id)!;
  },

  /** 按 ID 查找 */
  findById(id: string): Draft | null {
    const db = getDatabase();
    const result = db.exec(`SELECT ${ALL_COLUMNS} FROM draft WHERE id = ?`, [id]);
    if (!result.length || !result[0].values.length) return null;
    return rowToDraft(result[0].values[0]);
  },

  /** 按 session_id 查找新建场景草稿 */
  findBySessionId(sessionId: string): Draft | null {
    const db = getDatabase();
    const result = db.exec(
      `SELECT ${ALL_COLUMNS} FROM draft WHERE session_id = ? AND application_id IS NULL ORDER BY saved_at DESC LIMIT 1`,
      [sessionId]
    );
    if (!result.length || !result[0].values.length) return null;
    return rowToDraft(result[0].values[0]);
  },

  /** 按 session_id + application_id 查找退回重提草稿 */
  findBySessionAndApplication(sessionId: string, applicationId: string): Draft | null {
    const db = getDatabase();
    const result = db.exec(
      `SELECT ${ALL_COLUMNS} FROM draft WHERE session_id = ? AND application_id = ?`,
      [sessionId, applicationId]
    );
    if (!result.length || !result[0].values.length) return null;
    return rowToDraft(result[0].values[0]);
  },

  /** 删除草稿（提交成功后清理） */
  deleteById(id: string): void {
    const db = getDatabase();
    db.run('DELETE FROM draft WHERE id = ?', [id]);
  },

  /** 按 session_id + application_id 删除 */
  deleteBySessionAndApplication(sessionId: string, applicationId: string | null): void {
    const db = getDatabase();
    if (applicationId) {
      db.run('DELETE FROM draft WHERE session_id = ? AND application_id = ?', [sessionId, applicationId]);
    } else {
      db.run('DELETE FROM draft WHERE session_id = ? AND application_id IS NULL', [sessionId]);
    }
  },
};
