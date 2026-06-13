import { dbAll, dbGet, dbRun } from "./db";
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

async function fetchOrders(sessionId: number): Promise<OrderRow[]> {
  return dbAll<OrderRow>(
    "SELECT * FROM orders WHERE session_id = ? ORDER BY scanned_at ASC, id ASC",
    [sessionId]
  );
}

async function attachOrders(session: SessionRow): Promise<SessionWithOrders> {
  const orders = await fetchOrders(session.id);
  return { ...session, orders, orders_count: orders.length };
}

async function attachOrdersMany(
  sessions: SessionRow[]
): Promise<SessionWithOrders[]> {
  return Promise.all(sessions.map(attachOrders));
}

export async function createSession(
  driverName: string,
  vehiclePlate: string,
  gateCode: string
): Promise<SessionWithOrders> {
  const info = await dbRun(
    `INSERT INTO sessions (driver_name, vehicle_plate, gate_code, status)
     VALUES (?, ?, ?, 'scanning')`,
    [driverName, vehiclePlate, gateCode]
  );
  return (await getSession(Number(info.lastInsertRowid)))!;
}

export async function getSession(
  id: number
): Promise<SessionWithOrders | null> {
  const session = await dbGet<SessionRow>(
    "SELECT * FROM sessions WHERE id = ?",
    [id]
  );
  if (!session) return null;
  return attachOrders(session);
}

export async function listSessions(): Promise<SessionWithOrders[]> {
  const sessions = await dbAll<SessionRow>(
    "SELECT * FROM sessions ORDER BY created_at DESC, id DESC"
  );
  return attachOrdersMany(sessions);
}

function buildFilterClause(filters: SessionFilters) {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

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

export async function searchSessions(
  filters: SessionFilters,
  page: number,
  limit: PageSize
): Promise<PaginatedSessions> {
  const { where, params } = buildFilterClause(filters);

  const countRow = await dbGet<{ total: number }>(
    `SELECT COUNT(*) AS total FROM sessions s ${where}`,
    params
  );
  const total = countRow?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const offset = (safePage - 1) * limit;

  const rows = await dbAll<SessionRow>(
    `SELECT s.* FROM sessions s
     ${where}
     ORDER BY COALESCE(s.export_finished_at, s.export_started_at, s.created_at) DESC, s.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    sessions: await attachOrdersMany(rows),
    total,
    page: safePage,
    limit,
    totalPages,
  };
}

export async function listSessionsForExport(
  filters: SessionFilters
): Promise<SessionWithOrders[]> {
  const { where, params } = buildFilterClause(filters);
  const rows = await dbAll<SessionRow>(
    `SELECT s.* FROM sessions s
     ${where}
     ORDER BY COALESCE(s.export_finished_at, s.export_started_at, s.created_at) DESC, s.id DESC`,
    params
  );
  return attachOrdersMany(rows);
}

export async function getFilterOptions(): Promise<FilterOptions> {
  const gates = await dbAll<{ gate_code: string }>(
    "SELECT DISTINCT gate_code FROM sessions ORDER BY gate_code ASC"
  );
  const drivers = await dbAll<{ driver_name: string }>(
    "SELECT DISTINCT driver_name FROM sessions ORDER BY driver_name ASC"
  );
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

export async function addOrder(
  sessionId: number,
  orderCode: string
): Promise<AddOrderResult> {
  const session = await dbGet<{ id: number }>(
    "SELECT id FROM sessions WHERE id = ?",
    [sessionId]
  );
  if (!session) return { ok: false, reason: "not_found" };

  const existing = await dbGet<OrderRow>(
    "SELECT * FROM orders WHERE session_id = ? AND order_code = ?",
    [sessionId, orderCode]
  );
  if (existing) return { ok: false, reason: "duplicate" };

  const info = await dbRun(
    "INSERT INTO orders (session_id, order_code) VALUES (?, ?)",
    [sessionId, orderCode]
  );
  const order = await dbGet<OrderRow>("SELECT * FROM orders WHERE id = ?", [
    Number(info.lastInsertRowid),
  ]);
  return { ok: true, order: order! };
}

export async function deleteOrder(
  sessionId: number,
  orderId: number
): Promise<boolean> {
  const info = await dbRun(
    "DELETE FROM orders WHERE id = ? AND session_id = ?",
    [orderId, sessionId]
  );
  return info.changes > 0;
}

export async function startExport(
  sessionId: number
): Promise<SessionWithOrders | null> {
  const session = await getSession(sessionId);
  if (!session) return null;

  await dbRun(
    `UPDATE sessions
     SET status = 'exporting',
         export_started_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
         export_estimated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '+${EXPORT_ESTIMATE_MINUTES} minutes')
     WHERE id = ?`,
    [sessionId]
  );
  return getSession(sessionId);
}

export async function finishExport(
  sessionId: number
): Promise<SessionWithOrders | null> {
  const session = await getSession(sessionId);
  if (!session) return null;

  await dbRun(
    `UPDATE sessions
     SET status = 'done',
         export_finished_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
     WHERE id = ?`,
    [sessionId]
  );
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

export async function adminCreateSession(
  input: AdminSessionInput
): Promise<SessionWithOrders> {
  const status = normalizeStatus(input.status);
  const createdAt = normalizeIso(input.createdAt) ?? new Date().toISOString();

  const info = await dbRun(
    `INSERT INTO sessions (
       driver_name, vehicle_plate, gate_code, status,
       created_at, export_started_at, export_estimated_at, export_finished_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.driverName.trim(),
      input.vehiclePlate.trim().toUpperCase(),
      input.gateCode.trim(),
      status,
      createdAt,
      normalizeIso(input.exportStartedAt),
      normalizeIso(input.exportEstimatedAt),
      normalizeIso(input.exportFinishedAt),
    ]
  );

  const sessionId = Number(info.lastInsertRowid);
  const codes = (input.orderCodes ?? [])
    .map((c) => c.trim())
    .filter(Boolean);
  for (const code of codes) {
    await dbRun(
      "INSERT INTO orders (session_id, order_code) VALUES (?, ?)",
      [sessionId, code]
    );
  }
  return (await getSession(sessionId))!;
}

export async function updateSession(
  sessionId: number,
  input: AdminSessionInput
): Promise<SessionWithOrders | null> {
  const existing = await getSession(sessionId);
  if (!existing) return null;

  await dbRun(
    `UPDATE sessions SET
       driver_name = ?,
       vehicle_plate = ?,
       gate_code = ?,
       status = ?,
       created_at = COALESCE(?, created_at),
       export_started_at = ?,
       export_estimated_at = ?,
       export_finished_at = ?
     WHERE id = ?`,
    [
      input.driverName.trim(),
      input.vehiclePlate.trim().toUpperCase(),
      input.gateCode.trim(),
      normalizeStatus(input.status),
      normalizeIso(input.createdAt ?? undefined),
      normalizeIso(input.exportStartedAt),
      normalizeIso(input.exportEstimatedAt),
      normalizeIso(input.exportFinishedAt),
      sessionId,
    ]
  );

  return getSession(sessionId);
}

export async function syncSessionOrders(
  sessionId: number,
  orders: AdminOrderInput[]
): Promise<SessionWithOrders | null> {
  const session = await getSession(sessionId);
  if (!session) return null;

  const existingRows = await dbAll<{ id: number }>(
    "SELECT id FROM orders WHERE session_id = ?",
    [sessionId]
  );
  const existingIds = new Set(existingRows.map((r) => r.id));
  const keepIds = new Set<number>();

  for (const item of orders) {
    const code = item.orderCode.trim();
    if (!code) continue;

    if (item.id && existingIds.has(item.id)) {
      await dbRun(
        "UPDATE orders SET order_code = ? WHERE id = ? AND session_id = ?",
        [code, item.id, sessionId]
      );
      keepIds.add(item.id);
    } else if (!item.id) {
      const dup = await dbGet<{ id: number }>(
        "SELECT id FROM orders WHERE session_id = ? AND order_code = ?",
        [sessionId, code]
      );
      if (dup) {
        keepIds.add(dup.id);
      } else {
        const info = await dbRun(
          "INSERT INTO orders (session_id, order_code) VALUES (?, ?)",
          [sessionId, code]
        );
        keepIds.add(Number(info.lastInsertRowid));
      }
    }
  }

  for (const id of existingIds) {
    if (!keepIds.has(id)) {
      await dbRun("DELETE FROM orders WHERE id = ? AND session_id = ?", [
        id,
        sessionId,
      ]);
    }
  }

  return getSession(sessionId);
}

export async function deleteSession(sessionId: number): Promise<boolean> {
  const info = await dbRun("DELETE FROM sessions WHERE id = ?", [sessionId]);
  return info.changes > 0;
}
