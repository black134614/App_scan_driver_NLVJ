import * as XLSX from "xlsx";
import type { SessionWithOrders } from "./types";
import { formatDateTime } from "./format";

const STATUS_LABELS: Record<string, string> = {
  scanning: "Đang quét",
  exporting: "Đang xuất",
  done: "Hoàn thành",
};

function sessionToRows(session: SessionWithOrders) {
  if (session.orders.length === 0) {
    return [
      {
        "Mã phiên": session.id,
        Cổng: session.gate_code,
        "Biển số": session.vehicle_plate,
        "Tài xế": session.driver_name,
        "Mã đơn": "",
        "Trạng thái": STATUS_LABELS[session.status] ?? session.status,
        "Vào cổng": formatDateTime(session.created_at),
        "Bắt đầu xuất": formatDateTime(session.export_started_at),
        "Dự kiến xong": formatDateTime(session.export_estimated_at),
        "Xuất xong": formatDateTime(session.export_finished_at),
      },
    ];
  }

  return session.orders.map((order, index) => ({
    "Mã phiên": index === 0 ? session.id : "",
    Cổng: index === 0 ? session.gate_code : "",
    "Biển số": index === 0 ? session.vehicle_plate : "",
    "Tài xế": index === 0 ? session.driver_name : "",
    "Mã đơn": order.order_code,
    "Trạng thái": index === 0 ? STATUS_LABELS[session.status] ?? session.status : "",
    "Vào cổng": index === 0 ? formatDateTime(session.created_at) : "",
    "Bắt đầu xuất": index === 0 ? formatDateTime(session.export_started_at) : "",
    "Dự kiến xong": index === 0 ? formatDateTime(session.export_estimated_at) : "",
    "Xuất xong": index === 0 ? formatDateTime(session.export_finished_at) : "",
  }));
}

export function buildSessionsWorkbook(sessions: SessionWithOrders[]): Buffer {
  const rows = sessions.flatMap(sessionToRows);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Xuat hang");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
