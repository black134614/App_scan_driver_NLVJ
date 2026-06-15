import { dbAll, dbGet, dbRun } from "./db";
import { generateSlots } from "./slots";
import {
  isCarrierColorKey,
  pickDefaultCarrierColorKey,
} from "./carrier-colors";
import type {
  CarrierRow,
  GateRow,
  PortalLinkRow,
  TimeSlot,
} from "./types";

function randomToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 24; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

export async function listCarriers(): Promise<CarrierRow[]> {
  return dbAll<CarrierRow>(
    "SELECT * FROM carriers ORDER BY code ASC"
  );
}

export async function getCarrier(id: number): Promise<CarrierRow | null> {
  return (await dbGet<CarrierRow>("SELECT * FROM carriers WHERE id = ?", [
    id,
  ])) ?? null;
}

export async function createCarrier(input: {
  code: string;
  name: string;
}): Promise<CarrierRow> {
  const token = randomToken();
  const existing = await listCarriers();
  const color_key = pickDefaultCarrierColorKey(
    existing.map((c) => c.color_key)
  );
  const info = await dbRun(
    "INSERT INTO carriers (code, name, token, color_key) VALUES (?, ?, ?, ?)",
    [input.code.trim().toUpperCase(), input.name.trim(), token, color_key]
  );
  return (await getCarrier(Number(info.lastInsertRowid)))!;
}

export async function updateCarrier(
  id: number,
  input: { code?: string; name?: string; active?: boolean; color_key?: string }
): Promise<CarrierRow | null> {
  const existing = await getCarrier(id);
  if (!existing) return null;
  let color_key = existing.color_key;
  if (input.color_key !== undefined) {
    if (!isCarrierColorKey(input.color_key)) {
      throw new Error("Màu không hợp lệ");
    }
    color_key = input.color_key;
  }
  await dbRun(
    `UPDATE carriers SET code = ?, name = ?, active = ?, color_key = ? WHERE id = ?`,
    [
      input.code?.trim().toUpperCase() ?? existing.code,
      input.name?.trim() ?? existing.name,
      input.active !== undefined ? (input.active ? 1 : 0) : existing.active,
      color_key,
      id,
    ]
  );
  return getCarrier(id);
}

export async function getCarrierColorNameMap(): Promise<Record<string, string>> {
  const carriers = await listCarriers();
  const map: Record<string, string> = {};
  for (const c of carriers) {
    const name = c.name?.trim();
    if (name && c.color_key && isCarrierColorKey(c.color_key)) {
      map[name] = c.color_key;
    }
  }
  return map;
}

export async function regenerateCarrierToken(
  id: number
): Promise<CarrierRow | null> {
  const token = randomToken();
  await dbRun("UPDATE carriers SET token = ? WHERE id = ?", [token, id]);
  return getCarrier(id);
}

export async function deleteCarrier(id: number): Promise<boolean> {
  const info = await dbRun("DELETE FROM carriers WHERE id = ?", [id]);
  return info.changes > 0;
}

export async function getGateCarrierNameMap(): Promise<Record<string, string>> {
  const rows = await dbAll<{ code: string; names: string }>(
    `SELECT g.code, GROUP_CONCAT(DISTINCT c.name) AS names
     FROM gates g
     INNER JOIN carrier_gates cg ON cg.gate_id = g.id
     INNER JOIN carriers c ON c.id = cg.carrier_id AND c.active = 1
     GROUP BY g.code`
  );
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.code] = row.names;
  }
  return map;
}

export async function getGateNameMap(): Promise<Record<string, string>> {
  const gates = await listGates();
  const map: Record<string, string> = {};
  for (const g of gates) {
    map[g.code] = g.name?.trim() || g.code;
  }
  return map;
}

export async function listGates(): Promise<GateRow[]> {
  return dbAll<GateRow>("SELECT * FROM gates ORDER BY code ASC");
}

export async function getGate(id: number): Promise<GateRow | null> {
  return (await dbGet<GateRow>("SELECT * FROM gates WHERE id = ?", [id])) ?? null;
}

export async function getGateByCode(code: string): Promise<GateRow | null> {
  return (
    (await dbGet<GateRow>("SELECT * FROM gates WHERE code = ?", [
      code.trim(),
    ])) ?? null
  );
}

export async function createGate(input: {
  code: string;
  name: string;
  startMinutes: number;
  endMinutes: number;
  loadMinutes: number;
  daysMask?: number;
}): Promise<GateRow> {
  const info = await dbRun(
    `INSERT INTO gates (code, name, start_minutes, end_minutes, load_minutes, days_mask)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      input.code.trim(),
      input.name.trim(),
      input.startMinutes,
      input.endMinutes,
      input.loadMinutes,
      input.daysMask ?? 127,
    ]
  );
  return (await getGate(Number(info.lastInsertRowid)))!;
}

export async function updateGate(
  id: number,
  input: {
    code?: string;
    name?: string;
    startMinutes?: number;
    endMinutes?: number;
    loadMinutes?: number;
    daysMask?: number;
    active?: boolean;
  }
): Promise<GateRow | null> {
  const existing = await getGate(id);
  if (!existing) return null;
  await dbRun(
    `UPDATE gates SET code = ?, name = ?, start_minutes = ?, end_minutes = ?,
     load_minutes = ?, days_mask = ?, active = ? WHERE id = ?`,
    [
      input.code?.trim() ?? existing.code,
      input.name?.trim() ?? existing.name,
      input.startMinutes ?? existing.start_minutes,
      input.endMinutes ?? existing.end_minutes,
      input.loadMinutes ?? existing.load_minutes,
      input.daysMask ?? existing.days_mask ?? 127,
      input.active !== undefined ? (input.active ? 1 : 0) : existing.active,
      id,
    ]
  );
  return getGate(id);
}

export async function deleteGate(id: number): Promise<boolean> {
  const info = await dbRun("DELETE FROM gates WHERE id = ?", [id]);
  return info.changes > 0;
}

export async function getCarrierGateIds(carrierId: number): Promise<number[]> {
  const rows = await dbAll<{ gate_id: number }>(
    "SELECT gate_id FROM carrier_gates WHERE carrier_id = ?",
    [carrierId]
  );
  return rows.map((r) => r.gate_id);
}

export async function getCarrierGates(
  carrierId: number
): Promise<GateRow[]> {
  return dbAll<GateRow>(
    `SELECT g.* FROM gates g
     INNER JOIN carrier_gates cg ON cg.gate_id = g.id
     WHERE cg.carrier_id = ? AND g.active = 1
     ORDER BY g.code ASC`,
    [carrierId]
  );
}

export async function setCarrierGates(
  carrierId: number,
  gateIds: number[]
): Promise<void> {
  await dbRun("DELETE FROM carrier_gates WHERE carrier_id = ?", [carrierId]);
  for (const gateId of gateIds) {
    await dbRun(
      "INSERT INTO carrier_gates (carrier_id, gate_id) VALUES (?, ?)",
      [carrierId, gateId]
    );
  }
}

export async function toggleHiddenSlot(
  carrierId: number,
  gateId: number,
  slotMinutes: number,
  hidden: boolean
): Promise<void> {
  if (hidden) {
    await dbRun(
      `INSERT OR IGNORE INTO carrier_hidden_slots (carrier_id, gate_id, slot_minutes)
       VALUES (?, ?, ?)`,
      [carrierId, gateId, slotMinutes]
    );
  } else {
    await dbRun(
      `DELETE FROM carrier_hidden_slots
       WHERE carrier_id = ? AND gate_id = ? AND slot_minutes = ?`,
      [carrierId, gateId, slotMinutes]
    );
  }
}

export async function getCarrierSlotConfig(
  carrierId: number,
  gateId: number
): Promise<{ slots: TimeSlot[]; hidden: number[] }> {
  const gate = await getGate(gateId);
  if (!gate) return { slots: [], hidden: [] };
  const slots = generateSlots(
    gate.start_minutes,
    gate.end_minutes,
    gate.load_minutes
  );
  const hiddenRows = await dbAll<{ slot_minutes: number }>(
    `SELECT slot_minutes FROM carrier_hidden_slots
     WHERE carrier_id = ? AND gate_id = ?`,
    [carrierId, gateId]
  );
  return {
    slots,
    hidden: hiddenRows.map((r) => r.slot_minutes),
  };
}

export async function listPortalLinks(): Promise<PortalLinkRow[]> {
  return dbAll<PortalLinkRow>("SELECT * FROM portal_links ORDER BY kind");
}

export async function regeneratePortalLink(
  kind: string
): Promise<PortalLinkRow | null> {
  const token = randomToken();
  await dbRun("UPDATE portal_links SET token = ? WHERE kind = ?", [
    token,
    kind,
  ]);
  return (
    (await dbGet<PortalLinkRow>(
      "SELECT * FROM portal_links WHERE kind = ?",
      [kind]
    )) ?? null
  );
}
