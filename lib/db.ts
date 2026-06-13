import { createClient, type Client } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";

let client: Client | null = null;
let schemaReady: Promise<void> | null = null;

function createDbClient(): Client {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (url) {
    return createClient({ url, authToken });
  }

  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return createClient({ url: `file:${path.join(dataDir, "tracking.db")}` });
}

export function getDb(): Client {
  if (!client) client = createDbClient();
  return client;
}

async function initSchema() {
  const db = getDb();
  await db.batch([
    `CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      driver_name TEXT NOT NULL,
      vehicle_plate TEXT NOT NULL,
      gate_code TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'scanning',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      export_started_at TEXT,
      export_estimated_at TEXT,
      export_finished_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      order_code TEXT NOT NULL,
      scanned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      UNIQUE (session_id, order_code)
    )`,
    "CREATE INDEX IF NOT EXISTS idx_orders_session ON orders(session_id)",
    "CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status)",
    `CREATE TABLE IF NOT EXISTS plan_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_date TEXT NOT NULL,
      gate_code TEXT NOT NULL,
      expected_time TEXT NOT NULL,
      expected_minutes INTEGER NOT NULL,
      shift TEXT NOT NULL,
      order_code TEXT NOT NULL,
      tonnage REAL,
      vehicle_plate TEXT,
      driver_name TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    )`,
    "CREATE INDEX IF NOT EXISTS idx_plan_orders_date ON plan_orders(plan_date)",
    "CREATE INDEX IF NOT EXISTS idx_plan_orders_plate ON plan_orders(vehicle_plate)",
  ]);
}

export async function ensureDb() {
  getDb();
  if (!schemaReady) schemaReady = initSchema();
  await schemaReady;
}

export async function dbAll<T>(
  sql: string,
  args: (string | number | null)[] = []
): Promise<T[]> {
  await ensureDb();
  const result = await getDb().execute({ sql, args });
  return result.rows as T[];
}

export async function dbGet<T>(
  sql: string,
  args: (string | number | null)[] = []
): Promise<T | undefined> {
  const rows = await dbAll<T>(sql, args);
  return rows[0];
}

export async function dbRun(
  sql: string,
  args: (string | number | null)[] = []
): Promise<{ lastInsertRowid: number; changes: number }> {
  await ensureDb();
  const result = await getDb().execute({ sql, args });
  return {
    lastInsertRowid: Number(result.lastInsertRowid ?? 0),
    changes: result.rowsAffected ?? 0,
  };
}
