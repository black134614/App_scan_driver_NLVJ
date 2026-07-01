import * as XLSX from "xlsx";
import { gateHoursLabel } from "./plan-import-context";
import { todayDateString } from "./plan-parse";
import type { GateRow, PlanOrderRow, TimeSlot } from "./types";

export const CARRIER_IMPORT_HEADERS = [
  "Ngày",
  "Cổng",
  "Giờ",
  "Đơn/Lệnh",
  "Số tấn",
  "Số xe",
  "Tài xế",
] as const;

export interface CarrierTemplateContext {
  gates: GateRow[];
  slotsByGateCode: Record<string, TimeSlot[]>;
}

/** Tiêu đề cột có dấu — dùng cho file mẫu export kho */
export const PLAN_IMPORT_HEADERS = [
  "Ngày",
  "Cổng",
  "Giờ",
  "Đơn/Lệnh",
  "Số tấn",
  "Số xe",
  "Tài xế",
] as const;

function orderToRow(o: PlanOrderRow) {
  return {
    Ngày: o.plan_date,
    Cổng: o.gate_code,
    Giờ: o.expected_time,
    "Đơn/Lệnh": o.order_code,
    "Số tấn": o.tonnage ?? "",
    "Số xe": o.vehicle_plate ?? "",
    "Tài xế": o.driver_name ?? "",
  };
}

function sampleRows(date: string) {
  return [
    {
      Ngày: date,
      Cổng: "Cua 3",
      Giờ: "6h30",
      "Đơn/Lệnh": "HCM1",
      "Số tấn": 1.2,
      "Số xe": "51C-111.11",
      "Tài xế": "Nguyen Van A",
    },
    {
      Ngày: date,
      Cổng: "Cua 3",
      Giờ: "6h30",
      "Đơn/Lệnh": "HCM2",
      "Số tấn": 0.8,
      "Số xe": "51C-111.11",
      "Tài xế": "Nguyen Van A",
    },
    {
      Ngày: date,
      Cổng: "Cua 5",
      Giờ: "7h",
      "Đơn/Lệnh": "TINH-47",
      "Số tấn": 2,
      "Số xe": "51C-222.22",
      "Tài xế": "Tran Thi B",
    },
    {
      Ngày: date,
      Cổng: "TH",
      Giờ: "19h",
      "Đơn/Lệnh": "CHIEU-01",
      "Số tấn": 1.5,
      "Số xe": "",
      "Tài xế": "",
    },
  ];
}

function buildWorkbook(rows: Record<string, unknown>[]) {
  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: [...PLAN_IMPORT_HEADERS],
  });
  worksheet["!cols"] = [
    { wch: 12 },
    { wch: 10 },
    { wch: 8 },
    { wch: 14 },
    { wch: 8 },
    { wch: 14 },
    { wch: 18 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Kế hoạch");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function buildPlanImportTemplate(date?: string): Buffer {
  const planDate = date?.trim() || todayDateString();
  const rows = sampleRows(planDate);

  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: [...PLAN_IMPORT_HEADERS],
  });

  worksheet["!cols"] = [
    { wch: 12 },
    { wch: 10 },
    { wch: 8 },
    { wch: 14 },
    { wch: 8 },
    { wch: 14 },
    { wch: 18 },
  ];

  const guideSheet = XLSX.utils.aoa_to_sheet([
    ["Hướng dẫn import kế hoạch vận tải"],
    [""],
    ["Bắt buộc", "Ngày, Cổng, Giờ, Đơn/Lệnh"],
    ["Tùy chọn", "Số tấn, Số xe, Tài xế"],
    [""],
    ["Ngày", "yyyy-mm-dd hoặc dd/mm/yyyy"],
    ["Cổng", "Mã cổng vào (vd: Cua 3, TH)"],
    ["Giờ", "Giờ dự kiến (vd: 6h30, 7h, 19h)"],
    ["Đơn/Lệnh", "Mã đơn/lệnh — mỗi dòng 1 đơn"],
    ["Số tấn", "Số tấn (để thống kê)"],
    ["Số xe", "Biển số xe — tài xế chọn xe từ kế hoạch"],
    ["Tài xế", "Tên tài xế (có thể để trống)"],
    [""],
    ["Mỗi dòng = 1 đơn. Cùng xe nhiều đơn thì lặp lại Số xe / Tài xế."],
    [""],
    ["Lưu ý", "App vẫn đọc được file cột không dấu (Ngay, Cong, Gio...)"],
  ]);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Mẫu kế hoạch");
  XLSX.utils.book_append_sheet(workbook, guideSheet, "Hướng dẫn");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function buildCarrierImportTemplate(
  date?: string,
  ctx?: CarrierTemplateContext
): Buffer {
  const planDate = date?.trim() || todayDateString();
  const gates = ctx?.gates ?? [];
  const slotsByGateCode = ctx?.slotsByGateCode ?? {};

  const firstGate = gates[0];
  const firstSlots = firstGate ? slotsByGateCode[firstGate.code] ?? [] : [];
  const secondGate = gates[1];
  const secondSlots = secondGate
    ? slotsByGateCode[secondGate.code] ?? []
    : [];

  const sampleGate1 = firstGate?.code ?? "GATE1";
  const sampleTime1 = firstSlots[0]?.label ?? "6h";
  const sampleGate2 = secondGate?.code ?? sampleGate1;
  const sampleTime3 = secondSlots[0]?.label ?? sampleTime1;

  const rows = [
    {
      Ngày: planDate,
      Cổng: sampleGate1,
      Giờ: sampleTime1,
      "Đơn/Lệnh": "HCM1",
      "Số tấn": 1.2,
      "Số xe": "51C-111.11",
      "Tài xế": "Nguyen Van A",
    },
    {
      Ngày: planDate,
      Cổng: sampleGate1,
      Giờ: sampleTime1,
      "Đơn/Lệnh": "HCM2",
      "Số tấn": 0.8,
      "Số xe": "51C-111.11",
      "Tài xế": "Nguyen Van A",
    },
    {
      Ngày: planDate,
      Cổng: sampleGate2,
      Giờ: sampleTime3,
      "Đơn/Lệnh": "TINH-47",
      "Số tấn": 2,
      "Số xe": "51C-222.22",
      "Tài xế": "Tran Thi B",
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: [...CARRIER_IMPORT_HEADERS],
  });
  worksheet["!cols"] = [
    { wch: 12 },
    { wch: 10 },
    { wch: 8 },
    { wch: 14 },
    { wch: 8 },
    { wch: 14 },
    { wch: 18 },
  ];

  const gateRows = gates.map((g) => ({
    "Mã cổng": g.code,
    "Tên cổng": g.name,
    "Khung giờ cổng": gateHoursLabel(g),
  }));

  const slotRows: { "Mã cổng": string; Giờ: string }[] = [];
  for (const g of gates) {
    for (const s of slotsByGateCode[g.code] ?? []) {
      slotRows.push({ "Mã cổng": g.code, Giờ: s.label });
    }
  }

  const guideSheet = XLSX.utils.aoa_to_sheet([
    ["Hướng dẫn import kế hoạch (Nhà vận tải)"],
    [""],
    ["Bắt buộc", "Ngày, Cổng, Giờ, Đơn/Lệnh"],
    ["Tùy chọn", "Số tấn, Số xe, Tài xế"],
    [""],
    ["Ngày", "yyyy-mm-dd hoặc dd/mm/yyyy"],
    ["Cổng", "Mã cổng (xem sheet Cổng được phép)"],
    ["Giờ", "Khung giờ hợp lệ (xem sheet Khung giờ)"],
    ["Đơn/Lệnh", "Mã đơn/lệnh — mỗi dòng 1 đơn"],
    [""],
    ["Mỗi dòng = 1 đơn. Cùng xe nhiều đơn thì lặp lại Số xe / Tài xế / Cổng / Giờ."],
    [""],
    ["Lưu ý", "App chỉ cho Lưu khi tất cả dòng hợp lệ (preview không lỗi)."],
  ]);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Mẫu kế hoạch");
  if (gateRows.length > 0) {
    const gateSheet = XLSX.utils.json_to_sheet(gateRows);
    gateSheet["!cols"] = [{ wch: 12 }, { wch: 20 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(workbook, gateSheet, "Cổng được phép");
  }
  if (slotRows.length > 0) {
    const slotSheet = XLSX.utils.json_to_sheet(slotRows);
    slotSheet["!cols"] = [{ wch: 12 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(workbook, slotSheet, "Khung giờ");
  }
  XLSX.utils.book_append_sheet(workbook, guideSheet, "Hướng dẫn");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function exportPlanDay(orders: PlanOrderRow[]): Buffer {
  const rows = orders.length > 0 ? orders.map(orderToRow) : [];
  return buildWorkbook(rows);
}
