import { getDb } from "./db";
import {
  AdminOrderInput,
  AdminSessionInput,
  EXPORT_ESTIMATE_MINUTES,
  FilterOptions,
  OrderRow,
  PAGE_SIZE_OPTIONS,
  PageSize,
  PaginatedSessions,
  SessionFilters,
  SessionRow,
  SessionStatus,
  SessionWithOrders,
} from "./types";

function attachOrders(session: SessionRow): SessionWithOrders {
  const db = getDb();
  const orders = db
    .prepare(
      "SELECT * FROM orders WHERE session_id = ? ORDER BY scanned_at ASC, id ASC"
    )
    .all(session.id) as OrderRow[];
  return { ...session, orders, orders_count: orders.length };
}

export function createSession(
  driverName: string,
  vehiclePlate: string,
  gateCode: string
): SessionWithOrders {
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO sessions (driver_name, vehicle_plate, gate_code, status)
       VALUES (?, ?, ?, 'scanning')`
    )
    .run(driverName, vehiclePlate, gateCode);
  return getSession(Number(info.lastInsertRowid))!;
}

export function getSession(id: number): SessionWithOrders | null {
  const db = getDb();
  const session = db
    .prepare("SELECT * FROM sessions WHERE id = ?")
    .get(id) as SessionRow | undefined;
  if (!session) return null;
  return attachOrders(session);
}

export function listSessions(): SessionWithOrders[] {
  const db = getDb();
  const sessions = db
    .prepare("SELECT * FROM sessions ORDER BY created_at DESC, id DESC")
    .all() as SessionRow[];
  return sessions.map(attachOrders);
}

function buildFilterClause(filters: SessionFilters) {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.gate?.trim()) {
    conditions.push("s.gate_code LIKE ?");
    params.push(`%${filters.gate.trim()}%`);
  }
  if (filters.driver?.trim()) {
    conditions.push("s.driver_name LIKE ?");
    params.push(`%${filters.driver.trim()}%`);
  }
  if (filters.orderCode?.trim()) {
    conditions.push(
      "EXISTS (SELECT 1 FROM orders o WHERE o.session_id = s.id AND o.order_code LIKE ?)"
    );
    params.push(`%${filters.orderCode.trim()}%`);
  }
  if (filters.exportDate?.trim()) {
    conditions.push(
      `(strftime('%Y-%m-%d', s.export_finished_at) = ? OR strftime('%Y-%m-%d', s.export_started_at) = ?)`
    );
    params.push(filters.exportDate.trim(), filters.exportDate.trim());
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { where, params };
}

export function searchSessions(
  filters: SessionFilters,
  page: number,
  limit: PageSize
): PaginatedSessions {
  const db = getDb();
  const { where, params } = buildFilterClause(filters);

  const countRow = db
    .prepare(`SELECT COUNT(*) AS total FROM sessions s ${where}`)
    .get(...params) as { total: number };
  const total = countRow.total;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const offset = (safePage - 1) * limit;

  const rows = db
    .prepare(
      `SELECT s.* FROM sessions s
       ${where}
       ORDER BY COALESCE(s.export_finished_at, s.export_started_at, s.created_at) DESC, s.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as SessionRow[];

  return {
    sessions: rows.map(attachOrders),
    total,
    page: safePage,
    limit,
    totalPages,
  };
}

export function listSessionsForExport(filters: SessionFilters): SessionWithOrders[] {
  const db = getDb();
  const { where, params } = buildFilterClause(filters);
  const rows = db
    .prepare(
      `SELECT s.* FROM sessions s
       ${where}
       ORDER BY COALESCE(s.export_finished_at, s.export_started_at, s.created_at) DESC, s.id DESC`
    )
    .all(...params) as SessionRow[];
  return rows.map(attachOrders);
}

export function getFilterOptions(): FilterOptions {
  const db = getDb();
  const gates = db
    .prepare(
      "SELECT DISTINCT gate_code FROM sessions ORDER BY gate_code ASC"
    )
    .all() as { gate_code: string }[];
  const drivers = db
    .prepare(
      "SELECT DISTINCT driver_name FROM sessions ORDER BY driver_name ASC"
    )
    .all() as { driver_name: string }[];
  return {
    gates: gates.map((g) => g.gate_code),
    drivers: drivers.map((d) => d.driver_name),
  };
}

export function parsePageSize(value: string | null): PageSize {
  const n = Number(value);
  if (PAGE_SIZE_OPTIONS.includes(n as PageSize)) return n as PageSize;
  return 10;
}

export type AddOrderResult =
  | { ok: true; order: OrderRow }
  | { ok: false; reason: "duplicate" | "not_found" };

export function addOrder(
  sessionId: number,
  orderCode: string
): AddOrderResult {
  const db = getDb();
  const session = db
    .prepare("SELECT id FROM sessions WHERE id = ?")
    .get(sessionId);
  if (!session) return { ok: false, reason: "not_found" };

  const existing = db
    .prepare(
      "SELECT * FROM orders WHERE session_id = ? AND order_code = ?"
    )
    .get(sessionId, orderCode) as OrderRow | undefined;
  if (existing) return { ok: false, reason: "duplicate" };

  const info = db
    .prepare(
      "INSERT INTO orders (session_id, order_code) VALUES (?, ?)"
    )
    .run(sessionId, orderCode);
  const order = db
    .prepare("SELECT * FROM orders WHERE id = ?")
    .get(Number(info.lastInsertRowid)) as OrderRow;
  return { ok: true, order };
}

export function deleteOrder(sessionId: number, orderId: number): boolean {
  const db = getDb();
  const info = db
    .prepare("DELETE FROM orders WHERE id = ? AND session_id = ?")
    .run(orderId, sessionId);
  return info.changes > 0;
}

export function startExport(sessionId: number): SessionWithOrders | null {
  const db = getDb();
  const session = getSession(sessionId);
  if (!session) return null;

  db.prepare(
    `UPDATE sessions
     SET status = 'exporting',
         export_started_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
         export_estimated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '+${EXPORT_ESTIMATE_MINUTES} minutes')
     WHERE id = ?`
  ).run(sessionId);
  return getSession(sessionId);
}

export function finishExport(sessionId: number): SessionWithOrders | null {
  const db = getDb();
  const session = getSession(sessionId);
  if (!session) return null;

  db.prepare(
    `UPDATE sessions
     SET status = 'done',
         export_finished_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
     WHERE id = ?`
  ).run(sessionId);
  return getSession(sessionId);
}

function normalizeStatus(status?: string): SessionStatus {
  if (status === "exporting" || status === "done") return status;
  return "scanning";
}

function normalizeIso(value: string | null | undefined): string | null {
  if (value === undefined) return null;
  if (value === null || value.trim() === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function adminCreateSession(input: AdminSessionInput): SessionWithOrders {
  const db = getDb();
  const status = normalizeStatus(input.status);
  const createdAt = normalizeIso(input.createdAt) ?? new Date().toISOString();

  const info = db
    .prepare(
      `INSERT INTO sessions (
         driver_name, vehicle_plate, gate_code, status,
         created_at, export_started_at, export_estimated_at, export_finished_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.driverName.trim(),
      input.vehiclePlate.trim().toUpperCase(),
      input.gateCode.trim(),
      status,
      createdAt,
      normalizeIso(input.exportStartedAt),
      normalizeIso(input.exportEstimatedAt),
      normalizeIso(input.exportFinishedAt)
    );

  const sessionId = Number(info.lastInsertRowid);
  const codes = (input.orderCodes ?? [])
    .map((c) => c.trim())
    .filter(Boolean);
  for (const code of codes) {
    db.prepare(
      "INSERT INTO orders (session_id, order_code) VALUES (?, ?)"
    ).run(sessionId, code);
  }
  return getSession(sessionId)!;
}

export function updateSession(
  sessionId: number,
  input: AdminSessionInput
): SessionWithOrders | null {
  const db = getDb();
  const existing = getSession(sessionId);
  if (!existing) return null;

  db.prepare(
    `UPDATE sessions SET
       driver_name = ?,
       vehicle_plate = ?,
       gate_code = ?,
       status = ?,
       created_at = COALESCE(?, created_at),
       export_started_at = ?,
       export_estimated_at = ?,
       export_finished_at = ?
     WHERE id = ?`
  ).run(
    input.driverName.trim(),
    input.vehiclePlate.trim().toUpperCase(),
    input.gateCode.trim(),
    normalizeStatus(input.status),
    normalizeIso(input.createdAt ?? undefined),
    normalizeIso(input.exportStartedAt),
    normalizeIso(input.exportEstimatedAt),
    normalizeIso(input.exportFinishedAt),
    sessionId
  );

  return getSession(sessionId);
}

export function syncSessionOrders(
  sessionId: number,
  orders: AdminOrderInput[]
): SessionWithOrders | null {
  const db = getDb();
  const session = getSession(sessionId);
  if (!session) return null;

  const existingIds = new Set(
    (
      db
        .prepare("SELECT id FROM orders WHERE session_id = ?")
        .all(sessionId) as { id: number }[]
    ).map((r) => r.id)
  );
  const keepIds = new Set<number>();

  for (const item of orders) {
    const code = item.orderCode.trim();
    if (!code) continue;

    if (item.id && existingIds.has(item.id)) {
      db.prepare(
        "UPDATE orders SET order_code = ? WHERE id = ? AND session_id = ?"
      ).run(code, item.id, sessionId);
      keepIds.add(item.id);
    } else if (!item.id) {
      const dup = db
        .prepare(
          "SELECT id FROM orders WHERE session_id = ? AND order_code = ?"
        )
        .get(sessionId, code) as { id: number } | undefined;
      if (dup) {
        keepIds.add(dup.id);
      } else {
        const info = db
          .prepare(
            "INSERT INTO orders (session_id, order_code) VALUES (?, ?)"
          )
          .run(sessionId, code);
        keepIds.add(Number(info.lastInsertRowid));
      }
    }
  }

  for (const id of existingIds) {
    if (!keepIds.has(id)) {
      db.prepare("DELETE FROM orders WHERE id = ? AND session_id = ?").run(
        id,
        sessionId
      );
    }
  }

  return getSession(sessionId);
}

export function deleteSession(sessionId: number): boolean {
  const db = getDb();
  const info = db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  return info.changes > 0;
}
