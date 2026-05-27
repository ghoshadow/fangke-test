import initSqlJs, { Database } from 'sql.js';
import { v4 as uuidv4 } from 'uuid';

let db: Database | null = null;

const SCHEMA_SQL = `
-- 部门字典表
CREATE TABLE IF NOT EXISTS department (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- 访客申请主表
CREATE TABLE IF NOT EXISTS visitor_application (
  id TEXT PRIMARY KEY,
  visitor_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  id_card TEXT,
  company TEXT,
  visitor_count INTEGER NOT NULL CHECK(visitor_count >= 1),
  is_driving INTEGER NOT NULL DEFAULT 0,
  license_plate TEXT,
  contact_person TEXT NOT NULL,
  department_id TEXT NOT NULL REFERENCES department(id),
  visit_start_time TEXT NOT NULL,
  visit_end_time TEXT NOT NULL,
  visit_purpose TEXT NOT NULL,
  attachment_url TEXT,
  approval_status TEXT NOT NULL DEFAULT 'pending' CHECK(approval_status IN ('pending','approved','returned','rejected')),
  pass_status TEXT CHECK(pass_status IS NULL OR pass_status IN ('not_visited','visited')),
  session_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_application_session_id ON visitor_application(session_id);
CREATE INDEX IF NOT EXISTS idx_application_approval_status ON visitor_application(approval_status);
CREATE INDEX IF NOT EXISTS idx_application_created_at ON visitor_application(created_at);
CREATE INDEX IF NOT EXISTS idx_application_phone ON visitor_application(phone);

-- 审批记录表 (只写不删不改)
CREATE TABLE IF NOT EXISTS approval_record (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES visitor_application(id),
  operation_type TEXT NOT NULL CHECK(operation_type IN ('approve','return','reject')),
  reason TEXT,
  operator_session_id TEXT NOT NULL,
  operated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_approval_record_application_id ON approval_record(application_id);

-- 通行证表
CREATE TABLE IF NOT EXISTS visitor_pass (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL UNIQUE REFERENCES visitor_application(id),
  pass_status TEXT NOT NULL DEFAULT 'not_visited' CHECK(pass_status IN ('not_visited','visited')),
  actual_visit_time TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_visitor_pass_application_id ON visitor_pass(application_id);
CREATE INDEX IF NOT EXISTS idx_visitor_pass_status ON visitor_pass(pass_status);

-- 草稿/暂存表
CREATE TABLE IF NOT EXISTS draft (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  application_id TEXT REFERENCES visitor_application(id),
  form_data TEXT NOT NULL,
  saved_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_draft_session_id ON draft(session_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_draft_session_application ON draft(session_id, application_id);
`;

const SEED_DEPARTMENTS = [
  { name: '教务处', sort_order: 1 },
  { name: '总务处', sort_order: 2 },
  { name: '保卫处', sort_order: 3 },
  { name: '信息技术中心', sort_order: 4 },
  { name: '学生工作处', sort_order: 5 },
  { name: '人事处', sort_order: 6 },
  { name: '财务处', sort_order: 7 },
  { name: '科研处', sort_order: 8 },
  { name: '国际交流处', sort_order: 9 },
  { name: '后勤管理处', sort_order: 10 },
  { name: '党委办公室', sort_order: 11 },
  { name: '校长办公室', sort_order: 12 },
];

export async function initDatabase(): Promise<Database> {
  if (db) return db;

  const SQL = await initSqlJs();
  db = new SQL.Database();

  // Execute schema
  db.run(SCHEMA_SQL);

  // Seed departments if empty
  const result = db.exec('SELECT COUNT(*) as count FROM department');
  const count = result[0]?.values[0]?.[0] as number;
  if (count === 0) {
    const stmt = db.prepare('INSERT INTO department (id, name, sort_order) VALUES (?, ?, ?)');
    for (const dept of SEED_DEPARTMENTS) {
      stmt.run([uuidv4(), dept.name, dept.sort_order]);
    }
    stmt.free();
  }

  return db;
}

export function getDatabase(): Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function generateId(): string {
  return uuidv4();
}

export function now(): string {
  return new Date().toISOString();
}
