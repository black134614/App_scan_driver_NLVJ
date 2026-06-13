"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import GateCard from "@/components/GateCard";
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

export default function DashboardPage() {
  const [sessions, setSessions] = useState<SessionWithOrders[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/sessions", { cache: "no-store" });
        const data = await res.json();
        if (!active) return;
        setSessions(data.sessions ?? []);
        setLastUpdated(Date.now());
        setError(null);
      } catch {
        if (active) setError("Không kết nối được máy chủ");
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
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (appliedFilters.gate) params.set("gate", appliedFilters.gate);
      if (appliedFilters.driver) params.set("driver", appliedFilters.driver);
      if (appliedFilters.orderCode)
        params.set("orderCode", appliedFilters.orderCode);
      if (appliedFilters.exportDate)
        params.set("exportDate", appliedFilters.exportDate);

      const res = await fetch(`/api/sessions?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      setHistory(data.sessions ?? []);
      setHistoryTotal(data.total ?? 0);
      setHistoryTotalPages(data.totalPages ?? 1);
      setHistoryPage(data.page ?? 1);
      setFilterOptions(data.filterOptions ?? { gates: [], drivers: [] });
    } catch {
      setError("Không tải được lịch sử");
    } finally {
      setHistoryLoading(false);
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
    try {
      const params = new URLSearchParams();
      if (appliedFilters.gate) params.set("gate", appliedFilters.gate);
      if (appliedFilters.driver) params.set("driver", appliedFilters.driver);
      if (appliedFilters.orderCode)
        params.set("orderCode", appliedFilters.orderCode);
      if (appliedFilters.exportDate)
        params.set("exportDate", appliedFilters.exportDate);

      const res = await fetch(`/api/sessions/export?${params.toString()}`);
      if (!res.ok) throw new Error("Xuất file thất bại");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `xuat-hang-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Không xuất được file Excel");
    } finally {
      setExporting(false);
    }
  };

  const { gates, activeSessions, doneToday, totalOrders } = useMemo(() => {
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

    return {
      gates: gateList,
      activeSessions: active,
      doneToday: done,
      totalOrders: orders,
    };
  }, [sessions]);

  const exportingCount = activeSessions.filter(
    (s) => s.status === "exporting"
  ).length;

  const from = historyTotal === 0 ? 0 : (historyPage - 1) * limit + 1;
  const to = Math.min(historyPage * limit, historyTotal);

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">
            Bảng theo dõi cổng xuất hàng
          </h1>
          <p className="text-sm text-slate-500">
            {lastUpdated
              ? `Cập nhật lúc ${formatTime(new Date(lastUpdated).toISOString())} · tự làm mới mỗi ${POLL_INTERVAL_MS / 1000}s`
              : "Đang tải..."}
            {error && <span className="ml-2 text-red-600">· {error}</span>}
          </p>
        </div>
        <Link
          href="/"
          className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow active:bg-blue-700"
        >
          Trang tài xế
        </Link>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Cổng đang dùng" value={activeSessions.length} accent="amber" />
        <Stat label="Đang xuất hàng" value={exportingCount} accent="green" />
        <Stat label="Tổng đơn đang xử lý" value={totalOrders} accent="blue" />
        <Stat label="Hoàn thành hôm nay" value={doneToday.length} accent="slate" />
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
          Cổng & xe
        </h2>
        {gates.length === 0 ? (
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
          <button
            onClick={exportExcel}
            disabled={exporting || historyTotal === 0}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow active:bg-emerald-700 disabled:bg-slate-300"
          >
            {exporting ? "Đang xuất..." : "Xuất Excel"}
          </button>
        </div>

        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FilterField label="Cổng">
              <input
                list="gate-options"
                value={filters.gate}
                onChange={(e) => setFilters((f) => ({ ...f, gate: e.target.value }))}
                placeholder="GATE-01"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
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
                onChange={(e) => setFilters((f) => ({ ...f, driver: e.target.value }))}
                placeholder="Nguyễn Văn A"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
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
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </FilterField>
            <FilterField label="Ngày xuất">
              <input
                type="date"
                value={filters.exportDate}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, exportDate: e.target.value }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </FilterField>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={applyFilters}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white active:bg-blue-700"
            >
              Lọc
            </button>
            <button
              onClick={resetFilters}
              className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 active:bg-slate-300"
            >
              Xóa bộ lọc
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {historyLoading ? (
            <div className="py-16 text-center text-sm text-slate-400">
              Đang tải...
            </div>
          ) : history.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-400">
              Không có dữ liệu phù hợp bộ lọc
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-400">
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
                    <tr key={s.id} className="text-slate-700">
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
              <span>Hiển thị</span>
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value) as PageSize);
                  setPage(1);
                }}
                className="rounded-lg border border-slate-300 px-2 py-1 text-sm outline-none focus:border-blue-500"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
              <span>
                · {from}–{to} / {historyTotal} phiên
              </span>
            </div>

            <div className="flex items-center gap-1">
              <PageButton
                disabled={historyPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ‹
              </PageButton>
              <span className="px-2 text-sm text-slate-600">
                Trang {historyPage} / {historyTotalPages}
              </span>
              <PageButton
                disabled={historyPage >= historyTotalPages}
                onClick={() =>
                  setPage((p) => Math.min(historyTotalPages, p + 1))
                }
              >
                ›
              </PageButton>
            </div>
          </div>
        </div>
      </section>
    </main>
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
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
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
