import type { GateRow } from "./types";

export const WEEKDAY_BITS = [
  { day: 1, label: "T2" },
  { day: 2, label: "T3" },
  { day: 3, label: "T4" },
  { day: 4, label: "T5" },
  { day: 5, label: "T6" },
  { day: 6, label: "T7" },
  { day: 0, label: "CN" },
] as const;

export const ALL_DAYS_MASK = 127;

export function isGateOpenOnDate(gate: GateRow, date: string): boolean {
  const mask = gate.days_mask ?? ALL_DAYS_MASK;
  const weekday = new Date(`${date}T12:00:00`).getDay();
  return (mask & (1 << weekday)) !== 0;
}

export function formatDaysMask(mask: number): string {
  const labels = WEEKDAY_BITS.filter(
    ({ day }) => (mask & (1 << day)) !== 0
  ).map((b) => b.label);
  return labels.length > 0 ? labels.join(", ") : "—";
}

export function daysMaskFromWeekdays(days: number[]): number {
  return days.reduce((mask, day) => mask | (1 << day), 0);
}

export function weekdaysFromMask(mask: number): number[] {
  return WEEKDAY_BITS.filter(({ day }) => (mask & (1 << day)) !== 0).map(
    (b) => b.day
  );
}
