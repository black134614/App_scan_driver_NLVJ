import { isGateOpenOnDate } from "./gate-weekdays";
import { parseTimeToMinutes } from "./plan-parse";
import type { GateRow, TimeSlot } from "./types";

export interface CarrierImportPreviewRow {
  rowNumber: number;
  planDate: string;
  gateCode: string;
  expectedTime: string;
  orderCode: string;
  tonnage: number | null;
  vehiclePlate: string | null;
  driverName: string | null;
  errors: string[];
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

function resolveGate(
  gateCode: string,
  allowedGates: GateRow[]
): GateRow | null {
  const raw = gateCode.trim();
  if (!raw) return null;
  const norm = normalizeCode(raw);
  return (
    allowedGates.find((g) => normalizeCode(g.code) === norm) ??
    allowedGates.find((g) => normalizeCode(g.name) === norm) ??
    null
  );
}

export function validateCarrierImportRows(
  rows: CarrierImportPreviewRow[],
  allowedGates: GateRow[],
  slotsByGateCode: Record<string, TimeSlot[]>
): CarrierImportPreviewRow[] {
  const gateByCode = new Map<string, GateRow>();
  for (const g of allowedGates) {
    gateByCode.set(g.code, g);
  }

  const slotKeys = new Map<string, Set<number>>();
  for (const [code, slots] of Object.entries(slotsByGateCode)) {
    slotKeys.set(code, new Set(slots.map((s) => s.minutes)));
  }

  const validated = rows.map((row) => {
    const errors = [...row.errors];
    let gateCode = row.gateCode.trim();
    let expectedTime = row.expectedTime;

    if (errors.some((e) => e.startsWith("Thiếu cột"))) {
      return row;
    }

    const gate = resolveGate(gateCode, allowedGates);
    if (!gateCode) {
      if (!errors.includes("Thiếu cổng")) errors.push("Thiếu cổng");
    } else if (!gate) {
      errors.push("Cổng không được phép hoặc không tồn tại");
    } else {
      gateCode = gate.code;
      if (!isGateOpenOnDate(gate, row.planDate)) {
        errors.push("Cổng không mở ngày này");
      }

      const timeParsed = parseTimeToMinutes(row.expectedTime);
      if (!timeParsed) {
        errors.push("Giờ không hợp lệ");
      } else {
        const allowedMinutes = slotKeys.get(gate.code);
        if (!allowedMinutes || !allowedMinutes.has(timeParsed.minutes)) {
          errors.push("Khung giờ không hợp lệ cho cổng này");
        } else {
          expectedTime = timeParsed.label;
        }
      }
    }

    return {
      ...row,
      gateCode,
      expectedTime,
      errors,
    };
  });

  const slotUsage = new Map<string, string | null>();
  return validated.map((row) => {
    if (row.errors.length > 0) return row;

    const timeParsed = parseTimeToMinutes(row.expectedTime);
    if (!timeParsed || !row.gateCode) return row;

    const key = `${row.planDate}|${row.gateCode}|${timeParsed.minutes}`;
    const plate = row.vehiclePlate?.trim().toUpperCase() ?? null;
    const existing = slotUsage.get(key);

    if (existing !== undefined && existing !== plate) {
      return {
        ...row,
        errors: [...row.errors, "Khung giờ đã có xe khác trong file"],
      };
    }
    slotUsage.set(key, plate);
    return row;
  });
}
