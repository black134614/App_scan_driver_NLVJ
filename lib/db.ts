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

function randomToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 24; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
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
    `CREATE TABLE IF NOT EXISTS carriers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    )`,
    `CREATE TABLE IF NOT EXISTS gates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      start_minutes INTEGER NOT NULL DEFAULT 300,
      end_minutes INTEGER NOT NULL DEFAULT 720,
      load_minutes INTEGER NOT NULL DEFAULT 30,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    )`,
    `CREATE TABLE IF NOT EXISTS carrier_gates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      carrier_id INTEGER NOT NULL,
      gate_id INTEGER NOT NULL,
      FOREIGN KEY (carrier_id) REFERENCES carriers(id) ON DELETE CASCADE,
      FOREIGN KEY (gate_id) REFERENCES gates(id) ON DELETE CASCADE,
      UNIQUE (carrier_id, gate_id)
    )`,
    `CREATE TABLE IF NOT EXISTS carrier_hidden_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      carrier_id INTEGER NOT NULL,
      gate_id INTEGER NOT NULL,
      slot_minutes INTEGER NOT NULL,
      FOREIGN KEY (carrier_id) REFERENCES carriers(id) ON DELETE CASCADE,
      FOREIGN KEY (gate_id) REFERENCES gates(id) ON DELETE CASCADE,
      UNIQUE (carrier_id, gate_id, slot_minutes)
    )`,
    `CREATE TABLE IF NOT EXISTS portal_links (
      kind TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE
    )`,
  ]);

  // Migration: add carrier_id to plan_orders if missing
  const colResult = await db.execute("PRAGMA table_info(plan_orders)");
  const colNames = (colResult.rows as unknown as { name: string }[]).map(
    (c) => c.name
  );
  if (!colNames.includes("carrier_id")) {
    await db.execute(
      "ALTER TABLE plan_orders ADD COLUMN carrier_id INTEGER REFERENCES carriers(id)"
    );
  }
  if (!colNames.includes("manual_picked")) {
    await db.execute(
      "ALTER TABLE plan_orders ADD COLUMN manual_picked INTEGER NOT NULL DEFAULT 0"
    );
  }

  const gateColResult = await db.execute("PRAGMA table_info(gates)");
  const gateColNames = (gateColResult.rows as unknown as { name: string }[]).map(
    (c) => c.name
  );
  if (!gateColNames.includes("days_mask")) {
    await db.execute(
      "ALTER TABLE gates ADD COLUMN days_mask INTEGER NOT NULL DEFAULT 127"
    );
  }

  const carrierColResult = await db.execute("PRAGMA table_info(carriers)");
  const carrierColNames = (
    carrierColResult.rows as unknown as { name: string }[]
  ).map((c) => c.name);
  if (!carrierColNames.includes("color_key")) {
    await db.execute("ALTER TABLE carriers ADD COLUMN color_key TEXT");
    const colorKeys = [
      "slate",
      "blue",
      "emerald",
      "amber",
      "violet",
      "rose",
      "cyan",
      "orange",
    ];
    const carrierRows = await db.execute(
      "SELECT id FROM carriers ORDER BY id ASC"
    );
    const ids = (carrierRows.rows as unknown as { id: number }[]).map(
      (r) => r.id
    );
    for (let i = 0; i < ids.length; i++) {
      await db.execute("UPDATE carriers SET color_key = ? WHERE id = ?", [
        colorKeys[i % colorKeys.length],
        ids[i],
      ]);
    }
  }

  await seedPortalLinks(db);
}

async function seedPortalLinks(db: Client) {
  const warehouseSecret =
    process.env.ADMIN_SECRET ?? "gate-admin-2026";
  const existing = await db.execute("SELECT kind FROM portal_links");
  const kinds = new Set(
    (existing.rows as unknown as { kind: string }[]).map((r) => r.kind)
  );
  if (!kinds.has("warehouse")) {
    await db.execute({
      sql: "INSERT INTO portal_links (kind, token) VALUES (?, ?)",
      args: ["warehouse", warehouseSecret],
    });
  }
  if (!kinds.has("driver")) {
    await db.execute({
      sql: "INSERT INTO portal_links (kind, token) VALUES (?, ?)",
      args: ["driver", randomToken()],
    });
  }
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
