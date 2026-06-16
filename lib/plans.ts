import { dbAll, dbGet, dbRun } from "./db";
import { getCarrier, getCarrierGates, getGateCarrierNameMap, getGateNameMap, getCarrierColorNameMap } from "./config";
import {
  getAvailableSlotsForCarrier,
  getOccupiedSlotMinutes,
} from "./slots";
import { minutesToShift, parseTimeToMinutes } from "./plan-parse";
import type { PortalSession } from "./types";
import {
  DriverTruckOption,
  PlanDayView,
  PlanGrid,
  PlanGridCell,
  PlanOrderInput,
  PlanOrderRow,
  PlanSource,
  PlanStats,
  SessionWithOrders,
  TruckQueueItem,
  TruckQueueStatus,
} from "./types";
import { listSessions } from "./sessions";

function normalizePlate(plate: string | null | undefined): string | null {
  if (!plate?.trim()) return null;
  return plate.trim().toUpperCase();
}

async function insertPlanOrder(
  input: PlanOrderInput,
  source: PlanSource = "manual"
): Promise<PlanOrderRow> {
  const timeParsed = parseTimeToMinutes(input.expectedTime);
  if (!timeParsed) throw new Error("Giờ dự kiến không hợp lệ");

  const info = await dbRun(
    `INSERT INTO plan_orders (
       plan_date, gate_code, expected_time, expected_minutes, shift,
       order_code, tonnage, vehicle_plate, driver_name, source, carrier_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.planDate,
      input.gateCode.trim(),
      timeParsed.label,
      timeParsed.minutes,
      minutesToShift(timeParsed.minutes),
      input.orderCode.trim(),
      input.tonnage ?? null,
      normalizePlate(input.vehiclePlate),
      input.driverName?.trim() || null,
      source,
      input.carrierId ?? null,
    ]
  );
  return (await getPlanOrder(Number(info.lastInsertRowid)))!;
}

export async function validateCarrierPlanInput(
  session: PortalSession,
  input: PlanOrderInput,
  excludePlate?: string | null
): Promise<void> {
  if (session.role !== "carrier" || !session.carrierId) return;

  const gates = await getCarrierGates(session.carrierId);
  const gate = gates.find((g) => g.code === input.gateCode.trim());
  if (!gate) {
    throw new Error("Cổng không được phép cho nhà vận tải này");
  }

  const { isGateOpenOnDate } = await import("./slots");
  if (!isGateOpenOnDate(gate, input.planDate)) {
    throw new Error("Cổng không mở ngày này");
  }

  const timeParsed = parseTimeToMinutes(input.expectedTime);
  if (!timeParsed) throw new Error("Giờ dự kiến không hợp lệ");

  const available = await getAvailableSlotsForCarrier(
    input.planDate,
    session.carrierId,
    gate,
    excludePlate ?? input.vehiclePlate
  );
  if (!available.some((s) => s.minutes === timeParsed.minutes)) {
    throw new Error("Khung giờ không khả dụng hoặc đã có xe đăng ký");
  }

  if (input.vehiclePlate) {
    const occupied = await getOccupiedSlotMinutes(
      input.planDate,
      input.gateCode.trim(),
      input.vehiclePlate
    );
    if (occupied.has(timeParsed.minutes)) {
      throw new Error("Khung giờ này đã có xe khác đăng ký");
    }
  }
}

export async function createPlanOrderWithAuth(
  session: PortalSession,
  input: PlanOrderInput
): Promise<PlanOrderRow> {
  const enriched: PlanOrderInput = {
    ...input,
    carrierId:
      session.role === "carrier" ? session.carrierId : input.carrierId ?? null,
  };
  await validateCarrierPlanInput(session, enriched);
  return createPlanOrder(enriched);
}

export async function getPlanOrder(id: number): Promise<PlanOrderRow | null> {
  return (
    (await dbGet<PlanOrderRow>("SELECT * FROM plan_orders WHERE id = ?", [
      id,
    ])) ?? null
  );
}

export async function listPlanOrdersByDate(
  date: string,
  carrierId?: number | null
): Promise<PlanOrderRow[]> {
  if (carrierId) {
    const gates = await getCarrierGates(carrierId);
    const codes = gates.map((g) => g.code);
    if (codes.length === 0) return [];
    const placeholders = codes.map(() => "?").join(",");
    return dbAll<PlanOrderRow>(
      `SELECT * FROM plan_orders WHERE plan_date = ? AND gate_code IN (${placeholders})
       ORDER BY expected_minutes ASC, gate_code ASC, id ASC`,
      [date, ...codes]
    );
  }
  return dbAll<PlanOrderRow>(
    `SELECT * FROM plan_orders WHERE plan_date = ?
     ORDER BY expected_minutes ASC, gate_code ASC, id ASC`,
    [date]
  );
}

export async function createPlanOrder(
  input: PlanOrderInput
): Promise<PlanOrderRow> {
  return insertPlanOrder(input, input.source ?? "manual");
}

export async function createPlanOrdersBatch(
  inputs: PlanOrderInput[],
  source: PlanSource = "manual"
): Promise<PlanOrderRow[]> {
  const results: PlanOrderRow[] = [];
  for (const input of inputs) {
    results.push(await insertPlanOrder(input, source));
  }
  return results;
}

export async function updatePlanOrder(
  id: number,
  input: PlanOrderInput
): Promise<PlanOrderRow | null> {
  const existing = await getPlanOrder(id);
  if (!existing) return null;

  const timeParsed = parseTimeToMinutes(input.expectedTime);
  if (!timeParsed) throw new Error("Giờ dự kiến không hợp lệ");

  await dbRun(
    `UPDATE plan_orders SET
       plan_date = ?, gate_code = ?, expected_time = ?, expected_minutes = ?,
       shift = ?, order_code = ?, tonnage = ?, vehicle_plate = ?, driver_name = ?,
       carrier_id = COALESCE(?, carrier_id)
     WHERE id = ?`,
    [
      input.planDate,
      input.gateCode.trim(),
      timeParsed.label,
      timeParsed.minutes,
      minutesToShift(timeParsed.minutes),
      input.orderCode.trim(),
      input.tonnage ?? null,
      normalizePlate(input.vehiclePlate),
      input.driverName?.trim() || null,
      input.carrierId ?? null,
      id,
    ]
  );
  return getPlanOrder(id);
}

export async function deletePlanOrder(id: number): Promise<boolean> {
  const info = await dbRun("DELETE FROM plan_orders WHERE id = ?", [id]);
  return info.changes > 0;
}

export async function setPlanOrderManualPicked(
  id: number,
  manualPicked: -1 | 0 | 1
): Promise<PlanOrderRow | null> {
  const existing = await getPlanOrder(id);
  if (!existing) return null;
  await dbRun("UPDATE plan_orders SET manual_picked = ? WHERE id = ?", [
    manualPicked,
    id,
  ]);
  return getPlanOrder(id);
}

export async function importPlanOrders(
  date: string,
  inputs: PlanOrderInput[],
  replace = false
): Promise<{ imported: number; orders: PlanOrderRow[] }> {
  if (replace) {
    await dbRun("DELETE FROM plan_orders WHERE plan_date = ?", [date]);
  }
  const orders = await createPlanOrdersBatch(
    inputs.map((i) => ({ ...i, planDate: i.planDate || date })),
    "import"
  );
  return { imported: orders.length, orders };
}

function buildGrid(orders: PlanOrderRow[]): PlanGrid {
  const gates = [...new Set(orders.map((o) => o.gate_code))].sort((a, b) =>
    a.localeCompare(b, "vi")
  );
  const timeSet = new Map<string, number>();
  for (const o of orders) {
    timeSet.set(o.expected_time, o.expected_minutes);
  }
  const times = [...timeSet.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([t]) => t);

  const cells: Record<string, Record<string, PlanGridCell[]>> = {};
  for (const gate of gates) {
    cells[gate] = {};
    for (const time of times) {
      cells[gate][time] = [];
    }
  }

  return { gates, times, cells };
}

function sessionsForDate(
  sessions: SessionWithOrders[],
  date: string
): SessionWithOrders[] {
  return sessions.filter((s) => s.created_at.slice(0, 10) === date);
}

function sessionByPlate(
  sessions: SessionWithOrders[],
  plate: string | null
): SessionWithOrders | undefined {
  if (!plate) return undefined;
  const norm = plate.toUpperCase();
  return sessions.find((s) => s.vehicle_plate.toUpperCase() === norm);
}

function orderPickedUp(
  order: PlanOrderRow,
  sessions: SessionWithOrders[],
  scannedCodes: Set<string>
): boolean {
  if ((order.manual_picked ?? 0) === 1) return true;
  if ((order.manual_picked ?? 0) === -1) return false;
  if (scannedCodes.has(order.order_code)) return true;
  if (!order.vehicle_plate) return false;
  const session = sessionByPlate(sessions, order.vehicle_plate);
  return !!session;
}

function computeStats(
  orders: PlanOrderRow[],
  sessions: SessionWithOrders[]
): PlanStats {
  const scannedCodes = new Set<string>();
  for (const s of sessions) {
    for (const o of s.orders) scannedCodes.add(o.order_code);
  }

  const plannedTrucksMorning = new Set<string>();
  const plannedTrucksAfternoon = new Set<string>();
  const pickedTrucksMorning = new Set<string>();
  const pickedTrucksAfternoon = new Set<string>();

  let totalTonnage = 0;
  let pickedTonnage = 0;
  let pickedOrders = 0;

  for (const order of orders) {
    const ton = order.tonnage ?? 0;
    totalTonnage += ton;
    const picked = orderPickedUp(order, sessions, scannedCodes);
    if (picked) {
      pickedTonnage += ton;
      pickedOrders += 1;
    }
    const plate = normalizePlate(order.vehicle_plate);
    if (plate) {
      if (order.shift === "sang") plannedTrucksMorning.add(plate);
      else plannedTrucksAfternoon.add(plate);
      if (orderPickedUp(order, sessions, scannedCodes)) {
        if (order.shift === "sang") pickedTrucksMorning.add(plate);
        else pickedTrucksAfternoon.add(plate);
      }
    }
  }

  const totalOrders = orders.length;
  const totalTrucksMorning = plannedTrucksMorning.size;
  const totalTrucksAfternoon = plannedTrucksAfternoon.size;
  const pickedTrucksMorningCount = pickedTrucksMorning.size;
  const pickedTrucksAfternoonCount = pickedTrucksAfternoon.size;

  return {
    totalTonnage,
    totalOrders,
    totalTrucksMorning,
    totalTrucksAfternoon,
    pickedTonnage,
    pickedOrders,
    pickedTrucksMorning: pickedTrucksMorningCount,
    pickedTrucksAfternoon: pickedTrucksAfternoonCount,
    remainingTonnage: totalTonnage - pickedTonnage,
    remainingOrders: totalOrders - pickedOrders,
    remainingTrucksMorning: totalTrucksMorning - pickedTrucksMorningCount,
    remainingTrucksAfternoon:
      totalTrucksAfternoon - pickedTrucksAfternoonCount,
  };
}

function cellStatus(
  order: PlanOrderRow,
  sessions: SessionWithOrders[]
): PlanGridCell["status"] {
  if ((order.manual_picked ?? 0) === 1) return "done";
  if ((order.manual_picked ?? 0) === -1) return "planned";
  const session = sessionByPlate(sessions, order.vehicle_plate);
  if (!session) return "planned";
  if (session.status === "done") return "done";
  return "in_progress";
}

function buildGridWithStatus(
  orders: PlanOrderRow[],
  sessions: SessionWithOrders[]
): PlanGrid {
  const grid = buildGrid(orders);
  for (const order of orders) {
    const list = grid.cells[order.gate_code]?.[order.expected_time];
    if (list) {
      list.push({
        order,
        status: cellStatus(order, sessions),
      });
    }
  }
  return grid;
}

function truckStatusFromSession(
  session: SessionWithOrders | undefined,
  isWalkIn: boolean,
  inPlan: boolean
): TruckQueueStatus {
  if (isWalkIn && !inPlan) return "phat_sinh";
  if (!session) return "chua_vao";
  if (session.status === "scanning") return "dang_quet";
  if (session.status === "exporting") return "dang_xuat";
  if (session.status === "done") return "xong";
  return "chua_vao";
}

function buildTruckQueue(
  orders: PlanOrderRow[],
  sessions: SessionWithOrders[]
): TruckQueueItem[] {
  const byPlate = new Map<
    string,
    {
      driverName: string | null;
      gateCode: string | null;
      expectedTime: string | null;
      orderCount: number;
      isWalkIn: boolean;
    }
  >();

  for (const o of orders) {
    const plate = normalizePlate(o.vehicle_plate);
    if (!plate) continue;
    const cur = byPlate.get(plate) ?? {
      driverName: o.driver_name,
      gateCode: o.gate_code,
      expectedTime: o.expected_time,
      orderCount: 0,
      isWalkIn: o.source === "walk_in",
    };
    cur.orderCount += 1;
    if (o.source === "walk_in") cur.isWalkIn = true;
    if (!cur.driverName && o.driver_name) cur.driverName = o.driver_name;
    byPlate.set(plate, cur);
  }

  const plannedPlates = new Set(byPlate.keys());
  const items: TruckQueueItem[] = [];

  for (const [plate, info] of byPlate) {
    const session = sessionByPlate(sessions, plate);
    items.push({
      vehiclePlate: plate,
      driverName: info.driverName,
      gateCode: info.gateCode,
      expectedTime: info.expectedTime,
      orderCount: info.orderCount,
      isWalkIn: info.isWalkIn,
      sessionId: session?.id ?? null,
      status: truckStatusFromSession(session, info.isWalkIn, true),
    });
  }

  for (const session of sessions) {
    const plate = session.vehicle_plate.toUpperCase();
    if (plannedPlates.has(plate)) continue;
    items.push({
      vehiclePlate: plate,
      driverName: session.driver_name,
      gateCode: session.gate_code,
      expectedTime: null,
      orderCount: session.orders_count,
      isWalkIn: true,
      sessionId: session.id,
      status: "phat_sinh",
    });
  }

  const orderRank: Record<TruckQueueStatus, number> = {
    dang_xuat: 0,
    dang_quet: 1,
    chua_vao: 2,
    phat_sinh: 3,
    xong: 4,
  };
  return items.sort(
    (a, b) =>
      orderRank[a.status] - orderRank[b.status] ||
      a.vehiclePlate.localeCompare(b.vehiclePlate)
  );
}

export async function getPlanDayView(
  date: string,
  carrierId?: number | null
): Promise<PlanDayView> {
  const orders = await listPlanOrdersByDate(date, carrierId);
  const allSessions = await listSessions();
  const sessions = sessionsForDate(allSessions, date);
  const grid = buildGridWithStatus(orders, sessions);
  const gateCarriers = await getGateCarrierNameMap();
  const gateNames = await getGateNameMap();
  const carrierColors = await getCarrierColorNameMap();

  for (const order of orders) {
    if (order.carrier_id && !gateCarriers[order.gate_code]) {
      const carrier = await getCarrier(order.carrier_id);
      if (carrier) gateCarriers[order.gate_code] = carrier.name;
    }
  }

  if (carrierId) {
    const carrier = await getCarrier(carrierId);
    const label = carrier?.name ?? "—";
    for (const gate of grid.gates) {
      gateCarriers[gate] = label;
    }
  }

  return {
    date,
    orders,
    grid,
    stats: computeStats(orders, sessions),
    queue: buildTruckQueue(orders, sessions),
    gateCarriers,
    gateNames,
    carrierColors,
  };
}

export async function listTrucksForDriver(
  date: string
): Promise<DriverTruckOption[]> {
  const orders = await listPlanOrdersByDate(date);
  const map = new Map<string, DriverTruckOption>();

  for (const o of orders) {
    const plate = normalizePlate(o.vehicle_plate);
    if (!plate) continue;
    const cur = map.get(plate) ?? {
      vehiclePlate: plate,
      driverName: o.driver_name,
      gateCode: o.gate_code,
      expectedTime: o.expected_time,
      orderCount: 0,
      isWalkIn: o.source === "walk_in",
    };
    cur.orderCount += 1;
    if (o.source === "walk_in") cur.isWalkIn = true;
    if (!cur.driverName && o.driver_name) cur.driverName = o.driver_name;
    if (!cur.gateCode) cur.gateCode = o.gate_code;
    if (!cur.expectedTime) cur.expectedTime = o.expected_time;
    map.set(plate, cur);
  }

  return [...map.values()].sort((a, b) =>
    a.vehiclePlate.localeCompare(b.vehiclePlate)
  );
}

export async function registerWalkInTruck(input: {
  planDate: string;
  vehiclePlate: string;
  driverName?: string | null;
  gateCode?: string | null;
  expectedTime?: string | null;
  orderCodes?: string[];
}): Promise<{ truck: DriverTruckOption; orders: PlanOrderRow[] }> {
  const plate = normalizePlate(input.vehiclePlate);
  if (!plate) throw new Error("Thiếu biển số xe");

  const gate = input.gateCode?.trim() || "PHAT-SINH";
  const time = input.expectedTime?.trim() || "0h";
  const codes =
    input.orderCodes && input.orderCodes.length > 0
      ? input.orderCodes
      : [`WALKIN-${plate}-${Date.now()}`];

  const orders = await createPlanOrdersBatch(
    codes.map((code) => ({
      planDate: input.planDate,
      gateCode: gate,
      expectedTime: time,
      orderCode: code,
      vehiclePlate: plate,
      driverName: input.driverName ?? null,
      source: "walk_in" as PlanSource,
    })),
    "walk_in"
  );

  return {
    truck: {
      vehiclePlate: plate,
      driverName: input.driverName ?? null,
      gateCode: gate,
      expectedTime: parseTimeToMinutes(time)?.label ?? time,
      orderCount: orders.length,
      isWalkIn: true,
    },
    orders,
  };
}
