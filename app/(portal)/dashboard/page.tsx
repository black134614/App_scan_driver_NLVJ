"use client";

import Button from "@/components/ui/Button";
import PageHeader from "@/components/ui/PageHeader";
import { SkeletonCards, SkeletonTable } from "@/components/ui/Skeleton";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GateCard from "@/components/GateCard";
import { inputCls, tableHeadCls, tableRowHoverCls } from "@/lib/ui";
import type {
  FilterOptions,
  PageSize,
  SessionWithOrders,
} from "@/lib/types";
import { PAGE_SIZE_OPTIONS } from "@/lib/types";
import { formatDateTime, formatTime } from "@/lib/format";

const POLL_INTERVAL_MS = 3000;

interface Filters {
  gate: string;
  driver: string;
  orderCode: string;
  exportDate: string;
}

const EMPTY_FILTERS: Filters = {
  gate: "",
  driver: "",
  orderCode: "",
  exportDate: "",
};

const STATUS_LABELS: Record<string, string> = {
  scanning: "Đang quét",
  exporting: "Đang xuất",
  done: "Hoàn thành",
};

function buildFilterParams(
  applied: Filters,
  page: number,
  limit: number
): URLSearchParams {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (applied.gate) params.set("gate", applied.gate);
  if (applied.driver) params.set("driver", applied.driver);
  if (applied.orderCode) params.set("orderCode", applied.orderCode);
  if (applied.exportDate) params.set("exportDate", applied.exportDate);
  return params;
}

function filtersActive(f: Filters): boolean {
  return Boolean(f.gate || f.driver || f.orderCode || f.exportDate);
}

export default function DashboardPage() {
  const [sessions, setSessions] = useState<SessionWithOrders[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [pollLoading, setPollLoading] = useState(true);

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<PageSize>(10);
  const [history, setHistory] = useState<SessionWithOrders[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    gates: [],
    drivers: [],
  });
  const [historyLoading, setHistoryLoading] = useState(false);
  const [filterApplying, setFilterApplying] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [hasLoadedHistory, setHasLoadedHistory] = useState(false);

  const historySeq = useRef(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/sessions", { cache: "no-store" });
        const data = await res.json();
        if (!active) return;
        if (!res.ok) {
          setPollError(data.error ?? "Không tải được dữ liệu cổng");
          return;
        }
        setSessions(data.sessions ?? []);
        setLastUpdated(Date.now());
        setPollError(null);
      } catch {
        if (active) setPollError("Không kết nối được máy chủ");
      } finally {
        if (active) setPollLoading(false);
      }
    };
    load();
    const poll = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(poll);
    };
  }, []);

  const loadHistory = useCallback(async () => {
    const seq = ++historySeq.current;
    setHistoryLoading(true);
    try {
      const params = buildFilterParams(appliedFilters, page, limit);
      const res = await fetch(`/api/sessions?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (seq !== historySeq.current) return;
      if (!res.ok) {
        setHistoryError(data.error ?? "Không tải được lịch sử");
        return;
      }
      setHistory(data.sessions ?? []);
      setHistoryTotal(data.total ?? 0);
      setHistoryTotalPages(data.totalPages ?? 1);
      const apiPage = data.page ?? 1;
      setHistoryPage(apiPage);
      setPage(apiPage);
      setFilterOptions(data.filterOptions ?? { gates: [], drivers: [] });
      setHistoryError(null);
      setHasLoadedHistory(true);
    } catch {
      if (seq === historySeq.current) {
        setHistoryError("Không tải được lịch sử");
      }
    } finally {
      if (seq === historySeq.current) {
        setHistoryLoading(false);
        setFilterApplying(false);
      }
    }
  }, [page, limit, appliedFilters]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const applyFilters = () => {
    setFilterApplying(true);
    setAppliedFilters({ ...filters });
    setPage(1);
  };

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const exportExcel = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const params = buildFilterParams(appliedFilters, 1, limit);
      params.delete("page");
      params.delete("limit");

      const res = await fetch(`/api/sessions/export?${params.toString()}`);
      if (!res.ok) throw new Error("Xuất file thất bại");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `xuat-hang-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Không xuất được file Excel");
    } finally {
      setExporting(false);
    }
  };

  const { gates, activeSessions, doneToday, totalOrders, uniqueActiveGates } =
    useMemo(() => {
      const todayStr = new Date().toLocaleDateString("vi-VN");
      const active = sessions.filter((s) => s.status !== "done");
      const done = sessions.filter((s) => {
        if (s.status !== "done") return false;
        const d = s.export_finished_at ? new Date(s.export_finished_at) : null;
        return d && d.toLocaleDateString("vi-VN") === todayStr;
      });

      const gateMap = new Map<string, SessionWithOrders | null>();
      for (const s of sessions) {
        if (!gateMap.has(s.gate_code)) gateMap.set(s.gate_code, null);
      }
      for (const s of active) {
        const cur = gateMap.get(s.gate_code);
        if (!cur || new Date(s.created_at) > new Date(cur.created_at)) {
          gateMap.set(s.gate_code, s);
        }
      }

      const gateList = Array.from(gateMap.entries())
        .map(([gateCode, session]) => ({ gateCode, session }))
        .sort((a, b) => a.gateCode.localeCompare(b.gateCode));

      const orders = active.reduce((sum, s) => sum + s.orders_count, 0);
      const uniqueGates = new Set(active.map((s) => s.gate_code)).size;

      return {
        gates: gateList,
        activeSessions: active,
        doneToday: done,
        totalOrders: orders,
        uniqueActiveGates: uniqueGates,
      };
    }, [sessions]);

  const exportingCount = activeSessions.filter(
    (s) => s.status === "exporting"
  ).length;

  const from = historyTotal === 0 ? 0 : (historyPage - 1) * limit + 1;
  const to = Math.min(historyPage * limit, historyTotal);

  const historyEmptyMessage = !hasLoadedHistory
    ? "Đang tải..."
    : filtersActive(appliedFilters)
      ? "Không có dữ liệu phù hợp bộ lọc"
      : "Chưa có phiên xuất hàng nào";

  return (
    <>
      <PageHeader
        title="Bảng theo dõi cổng xuất hàng"
        description={
          lastUpdated
            ? `Cập nhật lúc ${formatTime(new Date(lastUpdated).toISOString())} · tự làm mới mỗi ${POLL_INTERVAL_MS / 1000}s`
            : "Đang tải..."
        }
      />
      {(pollError || historyError || exportError) && (
        <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {[pollError, historyError, exportError].filter(Boolean).join(" · ")}
        </div>
      )}

      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Cổng đang dùng" value={uniqueActiveGates} accent="amber" />
        <Stat label="Đang xuất hàng" value={exportingCount} accent="green" />
        <Stat label="Tổng đơn đang xử lý" value={totalOrders} accent="blue" />
        <Stat label="Hoàn thành hôm nay" value={doneToday.length} accent="slate" />
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
          Cổng & xe
        </h2>
        {pollLoading ? (
          <SkeletonCards count={4} />
        ) : gates.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white py-16 text-center text-slate-400">
            Chưa có cổng nào được quét. Dữ liệu sẽ hiện khi tài xế bắt đầu.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {gates.map(({ gateCode, session }) => (
              <GateCard
                key={gateCode}
                gateCode={gateCode}
                session={session}
                nowMs={nowMs}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            Lịch sử xuất hàng
          </h2>
          <Button
            onClick={exportExcel}
            variant="success"
            disabled={historyTotal === 0}
            loading={exporting}
            loadingText="Đang xuất..."
          >
            Xuất Excel
          </Button>
        </div>

        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FilterField label="Cổng">
              <input
                list="gate-options"
                value={filters.gate}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, gate: e.target.value }))
                }
                placeholder="GATE-01"
                className={inputCls}
              />
              <datalist id="gate-options">
                {filterOptions.gates.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </FilterField>
            <FilterField label="Tài xế">
              <input
                list="driver-options"
                value={filters.driver}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, driver: e.target.value }))
                }
                placeholder="Nguyễn Văn A"
                className={inputCls}
              />
              <datalist id="driver-options">
                {filterOptions.drivers.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </FilterField>
            <FilterField label="Mã đơn">
              <input
                value={filters.orderCode}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, orderCode: e.target.value }))
                }
                placeholder="DH-2026-0001"
                className={inputCls}
              />
            </FilterField>
            <FilterField label="Ngày xuất">
              <input
                type="date"
                value={filters.exportDate}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, exportDate: e.target.value }))
                }
                className={inputCls}
              />
            </FilterField>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              onClick={applyFilters}
              loading={filterApplying}
              loadingText="Đang lọc..."
            >
              Lọc
            </Button>
            <Button onClick={resetFilters} variant="ghost">
              Xóa bộ lọc
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {historyLoading && !hasLoadedHistory ? (
            <SkeletonTable rows={8} cols={7} />
          ) : history.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-400">
              {historyEmptyMessage}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className={tableHeadCls}>
                  <tr>
                    <th className="px-4 py-2">Cổng</th>
                    <th className="px-4 py-2">Biển số</th>
                    <th className="px-4 py-2">Tài xế</th>
                    <th className="px-4 py-2">Đơn hàng</th>
                    <th className="px-4 py-2">Trạng thái</th>
                    <th className="px-4 py-2">Bắt đầu xuất</th>
                    <th className="px-4 py-2">Xuất xong</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {history.map((s) => (
                    <tr key={s.id} className={`text-slate-700 ${tableRowHoverCls}`}>
                      <td className="px-4 py-2 font-semibold">{s.gate_code}</td>
                      <td className="px-4 py-2 font-bold">{s.vehicle_plate}</td>
                      <td className="px-4 py-2">{s.driver_name}</td>
                      <td className="px-4 py-2">
                        {s.orders.length === 0 ? (
                          <span className="text-slate-400">0 đơn</span>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            <span className="font-bold text-blue-700">
                              {s.orders_count} đơn
                            </span>
                            <span className="max-w-[200px] truncate text-xs text-slate-500">
                              {s.orders.map((o) => o.order_code).join(", ")}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <StatusPill status={s.status} />
                      </td>
                      <td className="px-4 py-2">
                        {formatDateTime(s.export_started_at)}
                      </td>
                      <td className="px-4 py-2">
                        {formatDateTime(s.export_finished_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <label className="flex items-center gap-2">
                <span>Hiển thị</span>
                <select
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value) as PageSize);
                    setPage(1);
                  }}
                  className={inputCls}
                  style={{ width: "auto" }}
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <span>
                · {from}–{to} / {historyTotal} phiên
              </span>
            </div>

            <div className="flex items-center gap-1">
              <PageButton
                disabled={historyPage <= 1 || historyLoading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                ariaLabel="Trang trước"
              >
                ‹
              </PageButton>
              <span className="px-2 text-sm text-slate-600">
                Trang {historyPage} / {historyTotalPages}
              </span>
              <PageButton
                disabled={historyPage >= historyTotalPages || historyLoading}
                onClick={() =>
                  setPage((p) => Math.min(historyTotalPages, p + 1))
                }
                ariaLabel="Trang sau"
              >
                ›
              </PageButton>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    scanning: "bg-amber-100 text-amber-700",
    exporting: "bg-green-100 text-green-700",
    done: "bg-slate-100 text-slate-600",
  };
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${styles[status] ?? "bg-slate-100 text-slate-600"}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function PageButton({
  children,
  disabled,
  onClick,
  ariaLabel,
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      className="rounded-lg border border-slate-300 px-3 py-1 text-sm font-semibold text-slate-700 disabled:opacity-40 active:bg-slate-100"
    >
      {children}
    </button>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: "amber" | "green" | "blue" | "slate";
}) {
  const colors: Record<string, string> = {
    amber: "text-amber-600",
    green: "text-green-600",
    blue: "text-blue-600",
    slate: "text-slate-600",
  };
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-extrabold ${colors[accent]}`}>{value}</p>
    </div>
  );
}
