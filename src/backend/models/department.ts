import { getDatabase } from '../config';
import type { Department } from '../../shared/types';

function rowToDepartment(row: unknown[]): Department {
  const r = row as (string | number)[];
  return {
    id: r[0] as string,
    name: r[1] as string,
    sort_order: r[2] as number,
  };
}

const ALL_COLUMNS = 'id, name, sort_order';

export const DepartmentModel = {
  /** 查询所有部门（按 sort_order 排序） */
  findAll(): Department[] {
    const db = getDatabase();
    const result = db.exec(`SELECT ${ALL_COLUMNS} FROM department ORDER BY sort_order ASC`);
    return result.length ? result[0].values.map(rowToDepartment) : [];
  },

  /** 按 ID 查找 */
  findById(id: string): Department | null {
    const db = getDatabase();
    const result = db.exec(`SELECT ${ALL_COLUMNS} FROM department WHERE id = ?`, [id]);
    if (!result.length || !result[0].values.length) return null;
    return rowToDepartment(result[0].values[0]);
  },

  /** 按名称查找 */
  findByName(name: string): Department | null {
    const db = getDatabase();
    const result = db.exec(`SELECT ${ALL_COLUMNS} FROM department WHERE name = ?`, [name]);
    if (!result.length || !result[0].values.length) return null;
    return rowToDepartment(result[0].values[0]);
  },
};
