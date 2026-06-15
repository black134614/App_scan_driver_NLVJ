"use client";

import type { SessionWithOrders } from "@/lib/types";
import { diffToNow, formatCountdown, formatTime } from "@/lib/format";

interface GateCardProps {
  gateCode: string;
  session: SessionWithOrders | null;
  nowMs: number;
}

export default function GateCard({ gateCode, session, nowMs }: GateCardProps) {
  const isExporting = session?.status === "exporting";
  const isScanning = session?.status === "scanning";

  const hasEstimate = Boolean(session?.export_estimated_at);
  const remaining =
    isExporting && hasEstimate
      ? diffToNow(session!.export_estimated_at, nowMs)
      : null;
  const overdue = remaining != null && remaining < 0;

  const borderColor = !session
    ? "border-slate-200"
    : overdue
      ? "border-red-400"
      : isExporting
        ? "border-green-400"
        : "border-amber-400";

  return (
    <div
      className={`flex flex-col rounded-2xl border-2 bg-white p-4 shadow-sm ${borderColor}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-lg font-extrabold tracking-tight text-slate-800">
          {gateCode}
        </span>
        {session ? (
          <StatusBadge status={session.status} overdue={overdue} />
        ) : (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-400">
            Trống
          </span>
        )}
      </div>

      {!session ? (
        <div className="flex flex-1 items-center justify-center py-8 text-sm text-slate-300">
          Không có xe
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-3">
          <div>
            <p className="text-2xl font-bold leading-tight text-slate-900">
              {session.vehicle_plate}
            </p>
            <p className="text-sm text-slate-500">{session.driver_name}</p>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
            <span className="text-sm text-slate-500">Số đơn</span>
            <span className="text-lg font-bold text-blue-700">
              {session.orders_count}
            </span>
          </div>

          {isExporting && (
            <div
              className={`rounded-xl px-3 py-2 text-center ${
                !hasEstimate
                  ? "bg-slate-50"
                  : overdue
                    ? "bg-red-50"
                    : "bg-green-50"
              }`}
            >
              <p className="text-xs text-slate-500">
                {!hasEstimate
                  ? "Chưa có TG dự kiến"
                  : overdue
                    ? "Quá giờ"
                    : "Còn lại"}
              </p>
              <p
                className={`font-mono text-3xl font-bold tabular-nums ${
                  !hasEstimate
                    ? "text-slate-400"
                    : overdue
                      ? "text-red-600"
                      : "text-green-600"
                }`}
              >
                {remaining == null ? "—" : formatCountdown(remaining)}
              </p>
            </div>
          )}

          {isScanning && (
            <div className="rounded-xl bg-amber-50 px-3 py-2 text-center text-sm font-semibold text-amber-700">
              Đang quét đơn...
            </div>
          )}

          <p className="mt-auto text-xs text-slate-400">
            Vào cổng {formatTime(session.created_at)}
            {session.export_started_at &&
              ` · Bắt đầu xuất ${formatTime(session.export_started_at)}`}
          </p>
        </div>
      )}
    </div>
  );
}

function StatusBadge({
  status,
  overdue,
}: {
  status: string;
  overdue: boolean;
}) {
  if (status === "exporting") {
    return (
      <span
        className={`animate-pulse-ring rounded-full px-2.5 py-1 text-xs font-bold ${
          overdue ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
        }`}
      >
        {overdue ? "Quá giờ" : "Đang xuất"}
      </span>
    );
  }
  if (status === "scanning") {
    return (
      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">
        Đang quét
      </span>
    );
  }
  return (
    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500">
      Xong
    </span>
  );
}
