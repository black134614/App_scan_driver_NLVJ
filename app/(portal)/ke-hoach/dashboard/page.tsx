"use client";

import { SkeletonCards, SkeletonGrid } from "@/components/ui/Skeleton";
import Spinner from "@/components/ui/Spinner";
import Modal from "@/components/ui/Modal";
import PageHeader from "@/components/ui/PageHeader";
import { todayDateString } from "@/lib/plan-parse";
import { usePortal } from "@/lib/portal-context";
import { carrierColorStyle, SHIFT_SECTION_STYLE } from "@/lib/carrier-colors";
import { inputCls } from "@/lib/ui";
import type {
  PlanDayView,
  PlanGrid,
  PlanGridCell,
  PlanOrderRow,
  PlanShift,
  SessionWithOrders,
  TruckQueueItem,
  TruckQueueStatus,
} from "@/lib/types";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  planned: "bg-white border-slate-400",
  in_progress: "bg-amber-100 border-amber-500",
  done: "bg-green-100 border-green-600",
};

/** Chiều cao cố định mỗi thẻ xe — các ô cùng hàng đồng đều */
const PLAN_CARD_H = "h-[76px]";

function carrierGroups(
  gates: string[],
  gateCarriers: Record<string, string>
): Array<{ carrierName: string; gates: string[] }> {
  const order: string[] = [];
  const map = new Map<string, string[]>();
  for (const gate of gates) {
    const carrier = gateCarriers[gate]?.trim() || "Chưa gán VT";
    if (!map.has(carrier)) {
      map.set(carrier, []);
      order.push(carrier);
    }
    map.get(carrier)!.push(gate);
  }
  return order.map((carrierName) => ({
    carrierName,
    gates: map.get(carrierName)!,
  }));
}

function timesForShift(grid: PlanGrid, shift: PlanShift): string[] {
  const timeMinutes = new Map<string, number>();
  for (const gate of grid.gates) {
    const row = grid.cells[gate];
    if (!row) continue;
    for (const [time, cells] of Object.entries(row)) {
      const match = cells.find((c) => c.order.shift === shift);
      if (match) {
        timeMinutes.set(time, match.order.expected_minutes);
      }
    }
  }
  return [...timeMinutes.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([t]) => t);
}

export default function KeHoachDashboardPage() {
  const { carrierName } = usePortal();
  const [date, setDate] = useState(todayDateString());
  const [view, setView] = useState<PlanDayView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [detailPlate, setDetailPlate] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [filterCarrier, setFilterCarrier] = useState("");
  const [filterGate, setFilterGate] = useState("");
  const [detailData, setDetailData] = useState<{
    plan: PlanOrderRow[];
    session: SessionWithOrders | null;
    carrierName: string | null;
  } | null>(null);

  useEffect(() => {
    if (!detailPlate) {
      setDetailData(null);
      return;
    }
    const ac = new AbortController();
    setDetailLoading(true);
    setDetailData(null);
    fetch(
      `/api/plans/truck-detail?date=${encodeURIComponent(date)}&plate=${encodeURIComponent(detailPlate)}`,
      { cache: "no-store", signal: ac.signal }
    )
      .then((r) => r.json())
      .then((d) => {
        if (d.plan) {
          setDetailData({
            plan: d.plan,
            session: d.session ?? null,
            carrierName: d.carrierName ?? null,
          });
        } else {
          setDetailData(null);
        }
      })
      .catch((e) => {
        if (e.name !== "AbortError") setDetailData(null);
      })
      .finally(() => setDetailLoading(false));
    return () => ac.abort();
  }, [detailPlate, date]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/plans?date=${date}`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setView(data);
        setLastUpdated(Date.now());
        setLoadError(null);
      } else {
        setLoadError(data.error ?? "Không tải được kế hoạch");
      }
    } catch {
      setLoadError("Lỗi kết nối — thử lại sau");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    setLoading(true);
    setView(null);
    setLoadError(null);
    setFilterCarrier("");
    setFilterGate("");
    load();
  }, [date, load]);

  useEffect(() => {
    const tick = () => {
      if (!document.hidden) load();
    };
    const t = setInterval(tick, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

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
  const gateCarriers = view?.gateCarriers ?? {};
  const gateNames = view?.gateNames ?? {};
  const carrierColors = view?.carrierColors ?? {};
  const gateCount = grid?.gates.length ?? 0;
  const statsOnSide = gateCount > 0 && gateCount <= 5;

  const carrierOptions = useMemo(() => {
    if (!grid) return [];
    const names = new Set<string>();
    for (const gate of grid.gates) {
      const name = gateCarriers[gate]?.trim();
      if (name) names.add(name);
    }
    return [...names].sort((a, b) => a.localeCompare(b, "vi"));
  }, [grid, gateCarriers]);

  const gateOptions = useMemo(() => {
    if (!grid) return [];
    return grid.gates
      .filter((gate) => !filterCarrier || gateCarriers[gate] === filterCarrier)
      .map((gate) => ({
        code: gate,
        label: gateNames[gate] ?? gate,
      }));
  }, [grid, gateCarriers, gateNames, filterCarrier]);

  const filteredGates = useMemo(() => {
    if (!grid) return [];
    let gates = grid.gates;
    if (filterCarrier) {
      gates = gates.filter((g) => gateCarriers[g] === filterCarrier);
    }
    if (filterGate) {
      gates = gates.filter((g) => g === filterGate);
    }
    return gates;
  }, [grid, filterCarrier, filterGate, gateCarriers]);

  const filteredGrid = useMemo((): PlanGrid | null => {
    if (!grid) return null;
    if (filteredGates.length === 0) return { gates: [], cells: {}, times: [] };
    if (
      filteredGates.length === grid.gates.length &&
      filteredGates.every((g, i) => g === grid.gates[i])
    ) {
      return grid;
    }
    const cells: PlanGrid["cells"] = {};
    for (const gate of filteredGates) {
      cells[gate] = grid.cells[gate] ?? {};
    }
    return { gates: filteredGates, cells, times: grid.times };
  }, [grid, filteredGates]);

  const filteredQueue = useMemo(() => {
    return queue.filter((item) => {
      if (filterGate && item.gateCode !== filterGate) return false;
      if (filterCarrier) {
        const gate = item.gateCode;
        if (!gate || gateCarriers[gate] !== filterCarrier) return false;
      }
      return true;
    });
  }, [queue, filterCarrier, filterGate, gateCarriers]);

  const hasActiveFilter = Boolean(filterCarrier || filterGate);

  useEffect(() => {
    if (filterGate && !gateOptions.some((g) => g.code === filterGate)) {
      setFilterGate("");
    }
  }, [gateOptions, filterGate]);

  const morningTimes = filteredGrid ? timesForShift(filteredGrid, "sang") : [];
  const afternoonTimes = filteredGrid ? timesForShift(filteredGrid, "chieu") : [];

  const gridBlocks = (
    <>
      {loading && !view ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <SkeletonGrid rows={5} cols={4} />
        </div>
      ) : !filteredGrid || filteredGrid.gates.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white py-20 text-center text-slate-600">
          {grid && grid.gates.length > 0 && hasActiveFilter
            ? "Không có cổng phù hợp bộ lọc — thử chọn lại nhà vận tải hoặc cổng"
            : `Chưa có kế hoạch cho ngày ${date}`}
        </div>
      ) : (
        <>
          <GridSection
            title="Ca sáng"
            shift="sang"
            times={morningTimes}
            grid={filteredGrid}
            gateCarriers={gateCarriers}
            gateNames={gateNames}
            carrierColors={carrierColors}
            onDetail={openDetail}
          />
          <GridSection
            title="Ca chiều"
            shift="chieu"
            times={afternoonTimes}
            grid={filteredGrid}
            gateCarriers={gateCarriers}
            gateNames={gateNames}
            carrierColors={carrierColors}
            onDetail={openDetail}
          />
        </>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-700">
          Hàng đợi xe ({loading && !view ? "…" : filteredQueue.length})
        </h2>
        {loading && !view ? (
          <SkeletonCards count={3} />
        ) : filteredQueue.length === 0 ? (
          <p className="text-sm text-slate-500">
            {queue.length > 0 && hasActiveFilter
              ? "Không có xe phù hợp bộ lọc"
              : "Không có xe"}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {filteredQueue.map((item) => (
              <QueueCard
                key={item.vehiclePlate}
                item={item}
                onDetail={openDetail}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );

  return (
    <>
      <PageHeader
        title="Dashboard kế hoạch xuất"
        description={
          <>
            {carrierName
              ? `Theo dõi cổng & xe — ${carrierName}`
              : "Tổng quan cổng × khung giờ theo nhà vận tải"}
            {" · "}tự làm mới {POLL_MS / 1000}s
            {lastUpdated &&
              ` · cập nhật ${new Date(lastUpdated).toLocaleTimeString("vi-VN")}`}
          </>
        }
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-[140px] flex-col gap-1 text-sm">
              <span className="font-semibold text-slate-700">Ngày</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="flex min-w-[180px] flex-col gap-1 text-sm">
              <span className="font-semibold text-slate-700">Nhà vận tải</span>
              <select
                value={filterCarrier}
                onChange={(e) => {
                  setFilterCarrier(e.target.value);
                  setFilterGate("");
                }}
                className={inputCls}
                disabled={!grid || carrierOptions.length === 0}
              >
                <option value="">Tất cả</option>
                {carrierOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[160px] flex-col gap-1 text-sm">
              <span className="font-semibold text-slate-700">Cổng xuất</span>
              <select
                value={filterGate}
                onChange={(e) => setFilterGate(e.target.value)}
                className={inputCls}
                disabled={!grid || gateOptions.length === 0}
              >
                <option value="">Tất cả</option>
                {gateOptions.map((g) => (
                  <option key={g.code} value={g.code}>
                    {g.label}
                  </option>
                ))}
              </select>
            </label>
            {hasActiveFilter ? (
              <button
                type="button"
                onClick={() => {
                  setFilterCarrier("");
                  setFilterGate("");
                }}
                className="rounded-lg border border-slate-400 bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
              >
                Xóa lọc
              </button>
            ) : null}
          </div>
        }
      />

      {loadError && (
        <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {statsOnSide ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_280px]">
          <div className="min-w-0 space-y-4">{gridBlocks}</div>
          {stats && (
            <aside className="space-y-3">
              <StatsPanel stats={stats} />
            </aside>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {gridBlocks}
          {stats && <StatsPanel stats={stats} wide />}
        </div>
      )}

      {detailPlate && (
        <TruckDetailModal
          plate={detailPlate}
          date={date}
          loading={detailLoading}
          data={detailData}
          onClose={closeDetail}
        />
      )}
    </>
  );
}

function GridSection({
  title,
  shift,
  times,
  grid,
  gateCarriers,
  gateNames,
  carrierColors,
  onDetail,
}: {
  title: string;
  shift: PlanShift;
  times: string[];
  grid: PlanDayView["grid"];
  gateCarriers: Record<string, string>;
  gateNames: Record<string, string>;
  carrierColors: Record<string, string>;
  onDetail: (plate: string) => void;
}) {
  if (times.length === 0) return null;
  const groups = carrierGroups(grid.gates, gateCarriers);
  const shiftStyle = SHIFT_SECTION_STYLE[shift];
  return (
    <section
      className={`overflow-hidden rounded-2xl border-2 bg-white ${shiftStyle.section}`}
    >
      <div className={`px-4 py-3 ${shiftStyle.bar}`}>
        <div className="flex items-center gap-3">
          <span
            className={`rounded px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${shiftStyle.badge}`}
          >
            {shift === "sang" ? "Sáng" : "Chiều"}
          </span>
          <h2 className={`text-lg font-extrabold ${shiftStyle.title}`}>
            {title}
          </h2>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px] table-fixed border-collapse text-sm">
          <thead>
            <tr>
              <th
                rowSpan={2}
                className="sticky left-0 z-20 w-[72px] border border-slate-400 bg-slate-300 px-2 py-2.5 text-left text-sm font-bold text-slate-900 align-middle"
              >
                Khung TG
              </th>
              {groups.map((g) => {
                const colors = carrierColorStyle(
                  g.carrierName,
                  carrierColors[g.carrierName]
                );
                return (
                  <th
                    key={g.carrierName}
                    colSpan={g.gates.length}
                    className={`border px-2 py-2 text-center text-xs font-extrabold uppercase tracking-wide ${colors.headerBg} ${colors.headerText} ${colors.border}`}
                  >
                    {g.carrierName}
                  </th>
                );
              })}
            </tr>
            <tr>
              {groups.flatMap((g) => {
                const colors = carrierColorStyle(
                  g.carrierName,
                  carrierColors[g.carrierName]
                );
                return g.gates.map((gate) => (
                  <th
                    key={gate}
                    title={gate}
                    className={`w-[120px] border px-2 py-2.5 text-center text-sm font-bold ${colors.gateBg} ${colors.gateText} ${colors.border}`}
                  >
                    {gateNames[gate] ?? gate}
                  </th>
                ));
              })}
            </tr>
          </thead>
          <tbody>
            {times.map((time) => {
              const rowCells = grid.gates.map((gate) =>
                (grid.cells[gate]?.[time] ?? []).filter(
                  (c) => c.order.shift === shift
                )
              );
              const maxCards = Math.max(
                1,
                ...rowCells.map((cells) => cells.length)
              );
              const rowMinH = maxCards * 76 + (maxCards - 1) * 4 + 12;

              return (
              <tr key={time}>
                <td className="sticky left-0 z-10 border border-slate-400 bg-slate-200 px-2 py-2.5 text-sm font-bold text-slate-900 whitespace-nowrap align-middle">
                  {time}
                </td>
                {grid.gates.map((gate, gateIdx) => {
                  const cells = rowCells[gateIdx];
                  return (
                    <td
                      key={`${gate}-${time}`}
                      className="border border-slate-300 p-1.5 align-top bg-slate-50/50"
                      style={{ minHeight: rowMinH }}
                    >
                      <div
                        className="flex h-full flex-col gap-1"
                        style={{ minHeight: rowMinH - 12 }}
                      >
                        {cells.length === 0 ? (
                          <div
                            className="flex w-full flex-1 items-center justify-center rounded border border-dashed border-slate-400 text-xs font-medium text-slate-500"
                          >
                            Trống
                          </div>
                        ) : (
                          cells.map(({ order, status }) => {
                            const clickable = Boolean(order.vehicle_plate);
                            return (
                            <button
                              key={order.id}
                              type="button"
                              disabled={!clickable}
                              onClick={() =>
                                clickable &&
                                onDetail(order.vehicle_plate!)
                              }
                              className={`flex w-full flex-col justify-center rounded-lg border-2 px-2 py-1.5 text-left text-xs leading-snug ${PLAN_CARD_H} ${CELL_COLOR[status]} ${
                                clickable
                                  ? "cursor-pointer transition hover:brightness-[0.97] hover:ring-2 hover:ring-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                                  : "cursor-default"
                              }`}
                              title={
                                clickable
                                  ? "Bấm để xem chi tiết"
                                  : `${order.order_code}${order.driver_name ? ` · ${order.driver_name}` : ""}`
                              }
                            >
                              <div className="truncate text-sm font-extrabold text-slate-900">
                                {order.vehicle_plate ?? "Chưa gán xe"}
                              </div>
                              <div className="truncate font-medium text-slate-800">
                                {order.order_code}
                              </div>
                              <div className="truncate text-slate-600">
                                {order.driver_name || "\u00A0"}
                              </div>
                            </button>
                            );
                          })
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StatsPanel({
  stats,
  wide = false,
}: {
  stats: PlanDayView["stats"];
  wide?: boolean;
}) {
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
    <div
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${
        wide ? "w-full" : ""
      }`}
    >
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
    <Modal open onClose={onClose} maxWidth="max-w-2xl">
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
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <Spinner size="lg" />
            <p className="text-sm text-slate-400">Đang tải chi tiết...</p>
          </div>
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
    </Modal>
  );
}
