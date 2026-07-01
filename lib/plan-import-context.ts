import { getCarrierGates } from "./config";
import {
  generateSlots,
  getHiddenSlotMinutes,
  isGateOpenOnDate,
} from "./slots";
import { minutesToTimeLabel } from "./plan-parse";
import type { GateRow, TimeSlot } from "./types";

export interface CarrierImportContext {
  gates: GateRow[];
  slotsByGateCode: Record<string, TimeSlot[]>;
}

export async function getCarrierImportContext(
  carrierId: number,
  planDate: string
): Promise<CarrierImportContext> {
  const gates = await getCarrierGates(carrierId);
  const openGates = gates.filter((g) => isGateOpenOnDate(g, planDate));
  const slotsByGateCode: Record<string, TimeSlot[]> = {};

  for (const gate of openGates) {
    const all = generateSlots(
      gate.start_minutes,
      gate.end_minutes,
      gate.load_minutes
    );
    const hidden = await getHiddenSlotMinutes(carrierId, gate.id);
    slotsByGateCode[gate.code] = all.filter((s) => !hidden.has(s.minutes));
  }

  return { gates: openGates, slotsByGateCode };
}

export function gateHoursLabel(gate: GateRow): string {
  return `${minutesToTimeLabel(gate.start_minutes)}–${minutesToTimeLabel(gate.end_minutes)}`;
}
