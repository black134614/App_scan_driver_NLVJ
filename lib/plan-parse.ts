import { MORNING_CUTOFF_MINUTES, type PlanShift } from "./types";

const HEADER_MAP: Record<string, string> = {
  ngay: "planDate",
  ngày: "planDate",
  "ngay ke hoach": "planDate",
  "ngày kế hoạch": "planDate",
  cong: "gateCode",
  cổng: "gateCode",
  "cong vao": "gateCode",
  "cổng vào": "gateCode",
  gio: "expectedTime",
  giờ: "expectedTime",
  "gio du kien": "expectedTime",
  "giờ dự kiến": "expectedTime",
  "thoi gian vao lay hang du kien": "expectedTime",
  madon: "orderCode",
  "ma don": "orderCode",
  "mã đơn": "orderCode",
  "mã đơn hàng": "orderCode",
  "don/lenh": "orderCode",
  "don lenh": "orderCode",
  "đơn/lệnh": "orderCode",
  "đơn lệnh": "orderCode",
  sotan: "tonnage",
  "số tấn": "tonnage",
  "so tan": "tonnage",
  soxe: "vehiclePlate",
  "số xe": "vehiclePlate",
  "so xe": "vehiclePlate",
  "bien so": "vehiclePlate",
  "biển số": "vehiclePlate",
  taixe: "driverName",
  "tài xế": "driverName",
  "tai xe": "driverName",
  "ten tai xe": "driverName",
  "tên tài xế": "driverName",
};

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/g, "d") // đ
    .replace(/\u0110/g, "d") // Đ
    .replace(/\s+/g, " ");
}

export function mapHeaderToField(header: string): string | null {
  const key = normalizeHeader(header);
  return HEADER_MAP[key] ?? null;
}

export function parsePlanDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(excelEpoch.getTime() + value * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmY = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmY) {
    const [, d, m, y] = dmY;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

export function parseTimeToMinutes(value: unknown): {
  label: string;
  minutes: number;
} | null {
  if (value == null || value === "") return null;

  if (typeof value === "number") {
    const totalMinutes = Math.round(value * 24 * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return { label: formatTimeLabel(h, m), minutes: totalMinutes };
  }

  const s = String(value).trim().toLowerCase().replace(/\s/g, "");
  const match = s.match(/^(\d{1,2})(?:h|:)?(\d{0,2})?$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = match[2] ? Number(match[2]) : 0;
  if (h > 23 || m > 59) return null;
  return { label: formatTimeLabel(h, m), minutes: h * 60 + m };
}

export function formatTimeLabel(h: number, m: number): string {
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

export function minutesToTimeLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return formatTimeLabel(h, m);
}

export function minutesToShift(minutes: number): PlanShift {
  return minutes < MORNING_CUTOFF_MINUTES ? "sang" : "chieu";
}

export function todayDateString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface RawSheetRow {
  [key: string]: unknown;
}

export interface ParseSheetOptions {
  requireGateTime?: boolean;
}

export function parseSheetRows(
  headers: string[],
  rows: RawSheetRow[],
  defaultDate?: string,
  opts?: ParseSheetOptions
) {
  const requireGateTime = opts?.requireGateTime !== false;
  const headerByField: Record<string, string> = {};
  headers.forEach((h) => {
    const field = mapHeaderToField(h);
    if (field && headerByField[field] === undefined) headerByField[field] = h;
  });

  const required = requireGateTime
    ? ["gateCode", "expectedTime", "orderCode"]
    : ["orderCode"];
  const missing = required.filter((f) => headerByField[f] === undefined);

  return rows.map((row, index) => {
    const get = (field: string) => {
      const header = headerByField[field];
      return header === undefined ? undefined : row[header];
    };

    const errors: string[] = [];
    if (missing.length > 0) {
      errors.push(`Thiếu cột: ${missing.join(", ")}`);
    }

    const planDate =
      parsePlanDate(get("planDate")) ?? defaultDate ?? todayDateString();
    const gateCode = String(get("gateCode") ?? "").trim();
    const timeParsed = parseTimeToMinutes(get("expectedTime"));
    const orderCode = String(get("orderCode") ?? "").trim();
    const tonnageRaw = get("tonnage");
    const tonnage =
      tonnageRaw == null || tonnageRaw === ""
        ? null
        : Number(String(tonnageRaw).replace(",", "."));
    const vehiclePlate = String(get("vehiclePlate") ?? "").trim() || null;
    const driverName = String(get("driverName") ?? "").trim() || null;

    if (requireGateTime) {
      if (!gateCode) errors.push("Thiếu cổng");
      if (!timeParsed) errors.push("Giờ không hợp lệ");
    }
    if (!orderCode) errors.push("Thiếu đơn/lệnh");
    if (tonnage != null && Number.isNaN(tonnage)) errors.push("Số tấn không hợp lệ");

    return {
      rowNumber: index + 2,
      planDate,
      gateCode,
      expectedTime: timeParsed?.label ?? String(get("expectedTime") ?? ""),
      orderCode,
      tonnage: tonnage != null && !Number.isNaN(tonnage) ? tonnage : null,
      vehiclePlate: vehiclePlate?.toUpperCase() ?? null,
      driverName,
      errors,
    };
  });
}
