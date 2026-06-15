import { dbAll } from "./db";
import { isGateOpenOnDate } from "./gate-weekdays";
import { formatTimeLabel } from "./plan-parse";
import type { GateRow, TimeSlot } from "./types";

export {
  ALL_DAYS_MASK,
  WEEKDAY_BITS,
  daysMaskFromWeekdays,
  formatDaysMask,
  isGateOpenOnDate,
  weekdaysFromMask,
} from "./gate-weekdays";

export function generateSlots(
  startMinutes: number,
  endMinutes: number,
  loadMinutes: number
): TimeSlot[] {
  if (loadMinutes <= 0 || startMinutes >= endMinutes) return [];
  const slots: TimeSlot[] = [];
  for (let m = startMinutes; m < endMinutes; m += loadMinutes) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    slots.push({ minutes: m, label: formatTimeLabel(h, min) });
  }
  return slots;
}

export async function getHiddenSlotMinutes(
  carrierId: number,
  gateId: number
): Promise<Set<number>> {
  const rows = await dbAll<{ slot_minutes: number }>(
    `SELECT slot_minutes FROM carrier_hidden_slots
     WHERE carrier_id = ? AND gate_id = ?`,
    [carrierId, gateId]
  );
  return new Set(rows.map((r) => r.slot_minutes));
}

export async function getOccupiedSlotMinutes(
  planDate: string,
  gateCode: string,
  excludePlate?: string | null
): Promise<Set<number>> {
  const rows = await dbAll<{
    expected_minutes: number;
    vehicle_plate: string | null;
  }>(
    `SELECT DISTINCT expected_minutes, vehicle_plate FROM plan_orders
     WHERE plan_date = ? AND gate_code = ? AND vehicle_plate IS NOT NULL AND vehicle_plate != ''`,
    [planDate, gateCode]
  );
  const norm = excludePlate?.trim().toUpperCase() ?? null;
  const occupied = new Set<number>();
  for (const r of rows) {
    const plate = r.vehicle_plate?.toUpperCase() ?? "";
    if (norm && plate === norm) continue;
    occupied.add(r.expected_minutes);
  }
  return occupied;
}

export async function getAvailableSlotsForCarrier(
  planDate: string,
  carrierId: number,
  gate: GateRow,
  excludePlate?: string | null
): Promise<TimeSlot[]> {
  if (!isGateOpenOnDate(gate, planDate)) return [];
  const all = generateSlots(
    gate.start_minutes,
    gate.end_minutes,
    gate.load_minutes
  );
  const hidden = await getHiddenSlotMinutes(carrierId, gate.id);
  const occupied = await getOccupiedSlotMinutes(
    planDate,
    gate.code,
    excludePlate
  );
  return all.filter(
    (s) => !hidden.has(s.minutes) && !occupied.has(s.minutes)
  );
}

export async function getAllSlotsForGate(
  gate: GateRow,
  planDate?: string
): Promise<TimeSlot[]> {
  if (planDate && !isGateOpenOnDate(gate, planDate)) return [];
  return generateSlots(
    gate.start_minutes,
    gate.end_minutes,
    gate.load_minutes
  );
}
