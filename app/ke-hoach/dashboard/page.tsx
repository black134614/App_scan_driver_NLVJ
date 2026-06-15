"use client";

import AppNav from "@/components/AppNav";
import { todayDateString } from "@/lib/plan-parse";
import type {
  PlanDayView,
  PlanGridCell,
  PlanOrderRow,
  SessionWithOrders,
  TruckQueueItem,
  TruckQueueStatus,
} from "@/lib/types";
import { useCallback, useEffect, useState } from "react";

const POLL_MS = 5000;

const STATUS_LABEL: Record<TruckQueueStatus, string> = {
  chua_vao: "Chưa vào",
  dang_quet: "Đang quét",
  dang_xuat: "Đang xuất",
  xong: "Xong",
  phat_sinh: "Phát sinh",
};

const STATUS_COLOR: Record<TruckQueueStatus, string> = {
  chua_vao: "bg-slate-100 text-slate-700 border-slate-300",
  dang_quet: "bg-amber-100 text-amber-800 border-amber-300",
  dang_xuat: "bg-green-100 text-green-800 border-green-300",
  xong: "bg-blue-100 text-blue-800 border-blue-300",
  phat_sinh: "bg-orange-100 text-orange-800 border-orange-400",
};

const CELL_COLOR: Record<PlanGridCell["status"], string> = {
  planned: "bg-white border-slate-200",
  in_progress: "bg-amber-50 border-amber-300",
  done: "bg-green-50 border-green-300",
};

export default function KeHoachDashboardPage() {
  const [date, setDate] = useState(todayDateString());
  const [view, setView] = useState<PlanDayView | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [carrierName, setCarrierName] = useState<string | null>(null);
  const [detailPlate, setDetailPlate] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<{
    plan: PlanOrderRow[];
    session: SessionWithOrders | null;
    carrierName: string | null;
  } | null>(null);

  useEffect(() => {
    fetch("/api/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setCarrierName(d.carrierName ?? null))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/plans?date=${date}`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setView(data);
        setLastUpdated(Date.now());
      }
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    setLoading(true);
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!detailPlate) {
      setDetailData(null);
      return;
    }
    setDetailLoading(true);
    fetch(
      `/api/plans/truck-detail?date=${encodeURIComponent(date)}&plate=${encodeURIComponent(detailPlate)}`,
      { cache: "no-store" }
    )
      .then((r) => r.json())
      .then((d) => {
        if (d.plan) {
          setDetailData({
            plan: d.plan,
            session: d.session ?? null,
            carrierName: d.carrierName ?? null,
          });
        }
      })
      .catch(() => setDetailData(null))
      .finally(() => setDetailLoading(false));
  }, [detailPlate, date]);

  const openDetail = (plate: string) => {
    setDetailPlate(plate.trim().toUpperCase());
  };

  const closeDetail = () => {
    setDetailPlate(null);
    setDetailData(null);
  };

  const stats = view?.stats;
  const grid = view?.grid;
  const queue = view?.queue ?? [];

  const morningTimes =
    grid?.times.filter((t) => {
      const cell = Object.values(grid.cells).find((g) => g[t]?.length);
      return cell?.[t]?.[0]?.order.shift === "sang";
    }) ?? [];
  const afternoonTimes =
    grid?.times.filter((t) => !morningTimes.includes(t)) ?? [];

  return (
    <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-5 sm:px-6">
      <AppNav />
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">
            Dashboard kế hoạch xuất
          </h1>
          <p className="text-sm text-slate-500">
            {carrierName
              ? `Theo dõi cổng & xe — ${carrierName}`
              : "Tổng quan cổng × khung giờ"}
            {" · "}tự làm mới {POLL_MS / 1000}s
            {lastUpdated &&
              ` · cập nhật ${new Date(lastUpdated).toLocaleTimeString("vi-VN")}`}
          </p>
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </header>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_280px]">
        <div className="min-w-0 space-y-4">
          {loading && !view ? (
            <div className="rounded-2xl bg-white py-20 text-center text-slate-400">
              Đang tải...
            </div>
          ) : !grid || grid.gates.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white py-20 text-center text-slate-400">
              Chưa có kế hoạch cho ngày {date}
            </div>
          ) : (
            <>
              <GridSection
                title="Ca sáng"
                times={morningTimes.length ? morningTimes : grid.times.filter((_, i) => i < Math.ceil(grid.times.length / 2))}
                grid={grid}
                onDetail={openDetail}
              />
              <GridSection
                title="Ca chiều"
                times={afternoonTimes.length ? afternoonTimes : grid.times.filter((_, i) => i >= Math.ceil(grid.times.length / 2))}
                grid={grid}
                onDetail={openDetail}
              />
            </>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
              Hàng đợi xe ({queue.length})
            </h2>
            {queue.length === 0 ? (
              <p className="text-sm text-slate-400">Không có xe</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {queue.map((item) => (
                  <QueueCard
                    key={item.vehiclePlate}
                    item={item}
                    onDetail={openDetail}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        {stats && (
          <aside className="space-y-3">
            <StatsPanel stats={stats} />
          </aside>
        )}
      </div>

      {detailPlate && (
        <TruckDetailModal
          plate={detailPlate}
          date={date}
          loading={detailLoading}
          data={detailData}
          onClose={closeDetail}
        />
      )}
    </main>
  );
}

function GridSection({
  title,
  times,
  grid,
  onDetail,
}: {
  title: string;
  times: string[];
  grid: PlanDayView["grid"];
  onDetail: (plate: string) => void;
}) {
  if (times.length === 0) return null;
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-2">
        <h2 className="text-sm font-bold text-slate-700">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px] border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 border border-slate-200 bg-slate-100 px-2 py-2 text-left font-bold">
                Khung TG
              </th>
              {grid.gates.map((gate) => (
                <th
                  key={gate}
                  className="min-w-[100px] border border-slate-200 bg-slate-100 px-2 py-2 text-center font-bold"
                >
                  {gate}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {times.map((time) => (
              <tr key={time}>
                <td className="sticky left-0 z-10 border border-slate-200 bg-slate-50 px-2 py-2 font-semibold whitespace-nowrap">
                  {time}
                </td>
                {grid.gates.map((gate) => {
                  const cells = grid.cells[gate]?.[time] ?? [];
                  return (
                    <td
                      key={`${gate}-${time}`}
                      className="border border-slate-200 p-1 align-top"
                    >
                      <div className="flex min-h-[52px] flex-col gap-0.5">
                        {cells.length === 0 ? (
                          <span className="flex h-full items-center justify-center rounded border border-dashed border-slate-200 text-[10px] text-slate-300">
                            Trống
                          </span>
                        ) : (
                          cells.map(({ order, status }) => (
                            <div
                              key={order.id}
                              className={`rounded-lg border-2 px-1.5 py-1 text-[10px] leading-tight ${CELL_COLOR[status]}`}
                              title={`${order.order_code}${order.vehicle_plate ? ` · ${order.vehicle_plate}` : ""}${order.driver_name ? ` · ${order.driver_name}` : ""}`}
                            >
                              {order.vehicle_plate ? (
                                <div className="flex items-center justify-between gap-1">
                                  <div className="truncate font-bold text-slate-800">
                                    {order.vehicle_plate}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => onDetail(order.vehicle_plate!)}
                                    className="shrink-0 rounded bg-white/80 px-1 py-0.5 text-[9px] font-bold text-blue-700 hover:bg-white"
                                  >
                                    Chi tiết
                                  </button>
                                </div>
                              ) : (
                                <div className="truncate font-semibold text-slate-500">
                                  Chưa gán xe
                                </div>
                              )}
                              <div className="truncate text-slate-600">
                                {order.order_code}
                              </div>
                              {order.driver_name && (
                                <div className="truncate text-slate-400">
                                  {order.driver_name}
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StatsPanel({ stats }: { stats: PlanDayView["stats"] }) {
  const rows = [
    {
      label: "Tổng tấn",
      total: stats.totalTonnage.toFixed(1),
      picked: stats.pickedTonnage.toFixed(1),
      remain: stats.remainingTonnage.toFixed(1),
    },
    {
      label: "Tổng số lệnh",
      total: stats.totalOrders,
      picked: stats.pickedOrders,
      remain: stats.remainingOrders,
    },
    {
      label: "Tổng xe lấy Sáng",
      total: stats.totalTrucksMorning,
      picked: stats.pickedTrucksMorning,
      remain: stats.remainingTrucksMorning,
    },
    {
      label: "Tổng xe lấy Chiều",
      total: stats.totalTrucksAfternoon,
      picked: stats.pickedTrucksAfternoon,
      remain: stats.remainingTrucksAfternoon,
    },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-center text-sm font-bold uppercase text-slate-600">
        Thống kê
      </h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-slate-400">
            <th className="pb-2 text-left"></th>
            <th className="pb-2 text-center">Kế hoạch</th>
            <th className="pb-2 text-center text-green-700">Đã lấy</th>
            <th className="pb-2 text-center text-red-600">Còn lại</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-slate-100">
              <td className="py-2 pr-2 font-medium text-slate-700">{r.label}</td>
              <td className="py-2 text-center font-bold">{r.total}</td>
              <td className="py-2 text-center font-bold text-green-700">
                {r.picked}
              </td>
              <td className="py-2 text-center font-bold text-red-600">
                {r.remain}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QueueCard({
  item,
  onDetail,
}: {
  item: TruckQueueItem;
  onDetail: (plate: string) => void;
}) {
  return (
    <div
      className={`rounded-xl border-2 p-3 ${STATUS_COLOR[item.status]}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-bold">{item.vehiclePlate}</span>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onDetail(item.vehiclePlate)}
            className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold text-blue-700 hover:bg-white"
          >
            Xem chi tiết
          </button>
          <span className="rounded-full bg-white/60 px-2 py-0.5 text-[10px] font-bold">
            {STATUS_LABEL[item.status]}
          </span>
        </div>
      </div>
      {item.driverName && (
        <p className="mt-1 text-xs">{item.driverName}</p>
      )}
      <p className="mt-1 text-xs opacity-80">
        {item.gateCode ?? "-"} · {item.expectedTime ?? "-"} · {item.orderCount}{" "}
        đơn
        {item.isWalkIn && " · Phát sinh"}
      </p>
    </div>
  );
}

const SESSION_STATUS_LABEL: Record<string, string> = {
  scanning: "Đang quét",
  exporting: "Đang xuất",
  done: "Hoàn tất",
};

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("vi-VN");
  } catch {
    return iso;
  }
}

function TruckDetailModal({
  plate,
  date,
  loading,
  data,
  onClose,
}: {
  plate: string;
  date: string;
  loading: boolean;
  data: {
    plan: PlanOrderRow[];
    session: SessionWithOrders | null;
    carrierName: string | null;
  } | null;
  onClose: () => void;
}) {
  const firstPlan = data?.plan[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-800">
              Chi tiết xe {plate}
            </h3>
            <p className="text-sm text-slate-500">Ngày {date}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600"
          >
            Đóng
          </button>
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-slate-400">Đang tải...</p>
        ) : !data ? (
          <p className="py-8 text-center text-sm text-slate-400">
            Không tải được dữ liệu
          </p>
        ) : (
          <div className="space-y-5">
            <section>
              <h4 className="mb-2 text-sm font-bold uppercase text-slate-500">
                Khai báo của nhà vận tải
              </h4>
              {data.plan.length === 0 ? (
                <p className="text-sm text-slate-400">Chưa có khai báo kế hoạch</p>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                  <div className="mb-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <div>
                      <span className="font-semibold">Nhà vận tải:</span>{" "}
                      {data.carrierName ?? "—"}
                    </div>
                    <div>
                      <span className="font-semibold">Cổng:</span>{" "}
                      {firstPlan?.gate_code ?? "—"}
                    </div>
                    <div>
                      <span className="font-semibold">Giờ dự kiến:</span>{" "}
                      {firstPlan?.expected_time ?? "—"}
                    </div>
                    <div>
                      <span className="font-semibold">Tài xế:</span>{" "}
                      {firstPlan?.driver_name ?? "—"}
                    </div>
                    <div>
                      <span className="font-semibold">Nguồn:</span>{" "}
                      {firstPlan?.source ?? "—"}
                    </div>
                  </div>
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-slate-400">
                        <th className="py-1">Đơn/Lệnh</th>
                        <th className="py-1">Tấn</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.plan.map((o) => (
                        <tr key={o.id} className="border-t border-slate-200">
                          <td className="py-1 font-mono">{o.order_code}</td>
                          <td className="py-1">{o.tonnage ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section>
              <h4 className="mb-2 text-sm font-bold uppercase text-slate-500">
                Tài xế thao tác
              </h4>
              {!data.session ? (
                <p className="text-sm text-slate-400">
                  Chưa có phiên quét / xuất hàng
                </p>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                  <div className="mb-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <div>
                      <span className="font-semibold">Trạng thái:</span>{" "}
                      {SESSION_STATUS_LABEL[data.session.status] ??
                        data.session.status}
                    </div>
                    <div>
                      <span className="font-semibold">Cổng:</span>{" "}
                      {data.session.gate_code}
                    </div>
                    <div>
                      <span className="font-semibold">Tạo phiên:</span>{" "}
                      {formatDateTime(data.session.created_at)}
                    </div>
                    <div>
                      <span className="font-semibold">Bắt đầu xuất:</span>{" "}
                      {formatDateTime(data.session.export_started_at)}
                    </div>
                    <div className="col-span-2">
                      <span className="font-semibold">Kết thúc xuất:</span>{" "}
                      {formatDateTime(data.session.export_finished_at)}
                    </div>
                  </div>
                  <p className="mb-1 text-xs font-semibold text-slate-500">
                    Đơn đã scan ({data.session.orders.length})
                  </p>
                  {data.session.orders.length === 0 ? (
                    <p className="text-xs text-slate-400">Chưa scan đơn nào</p>
                  ) : (
                    <ul className="space-y-1 text-xs">
                      {data.session.orders.map((o) => (
                        <li
                          key={o.id}
                          className="flex justify-between gap-2 border-t border-slate-200 pt-1"
                        >
                          <span className="font-mono">{o.order_code}</span>
                          <span className="text-slate-400">
                            {formatDateTime(o.scanned_at)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
