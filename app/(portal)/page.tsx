"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import PageHeader from "@/components/ui/PageHeader";
import { SkeletonList } from "@/components/ui/Skeleton";
import { todayDateString } from "@/lib/plan-parse";
import { inputCls } from "@/lib/ui";
import type { DriverTruckOption, SessionWithOrders } from "@/lib/types";
import { diffToNow, formatCountdown, formatTime } from "@/lib/format";

const QrScanner = dynamic(() => import("@/components/QrScanner"), {
  ssr: false,
  loading: () => (
    <div className="flex aspect-square w-full items-center justify-center rounded-2xl bg-slate-200 text-slate-500">
      Đang khởi động camera...
    </div>
  ),
});

type Step = "select" | "gate" | "orders" | "exporting" | "done";
type Flash = { type: "success" | "error" | "info"; text: string } | null;

export default function DriverPage() {
  const [step, setStep] = useState<Step>("select");
  const [trucks, setTrucks] = useState<DriverTruckOption[]>([]);
  const [selected, setSelected] = useState<DriverTruckOption | null>(null);
  const [driverName, setDriverName] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [session, setSession] = useState<SessionWithOrders | null>(null);
  const [flash, setFlash] = useState<Flash>(null);
  const [busy, setBusy] = useState(false);
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [walkPlate, setWalkPlate] = useState("");
  const [walkDriver, setWalkDriver] = useState("");
  const [trucksLoading, setTrucksLoading] = useState(true);
  const [trucksError, setTrucksError] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFlash = useCallback((f: NonNullable<Flash>) => {
    setFlash(f);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 2500);
  }, []);

  const loadTrucks = useCallback(async () => {
    setTrucksLoading(true);
    setTrucksError(null);
    try {
      const date = todayDateString();
      const res = await fetch(`/api/plans/trucks?date=${date}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        setTrucks([]);
        setTrucksError(data.error ?? "Không tải được danh sách xe");
        return;
      }
      setTrucks(data.trucks ?? []);
    } catch {
      setTrucks([]);
      setTrucksError("Lỗi kết nối — thử lại sau");
    } finally {
      setTrucksLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTrucks();
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, [loadTrucks]);

  const selectTruck = (truck: DriverTruckOption) => {
    setSelected(truck);
    setVehiclePlate(truck.vehiclePlate);
    setDriverName(truck.driverName ?? "");
    setStep("gate");
  };

  const registerWalkIn = async () => {
    if (!walkPlate.trim()) {
      showFlash({ type: "error", text: "Nhập biển số xe" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/plans/walk-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planDate: todayDateString(),
          vehiclePlate: walkPlate.trim(),
          driverName: walkDriver.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lỗi đăng ký");
      setShowWalkIn(false);
      setWalkPlate("");
      setWalkDriver("");
      await loadTrucks();
      selectTruck(data.truck);
      showFlash({ type: "success", text: "Đã đăng ký xe mới" });
    } catch (e) {
      showFlash({ type: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const handleGateScan = useCallback(
    async (gateCode: string) => {
      if (busy || session || !vehiclePlate) return;
      setBusy(true);
      try {
        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            driverName: driverName || "Chưa xác định",
            vehiclePlate,
            gateCode,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Lỗi tạo phiên");
        setSession(data.session);
        setStep("orders");
        showFlash({ type: "success", text: `Đã vào ${data.session.gate_code}` });
      } catch (e) {
        showFlash({ type: "error", text: (e as Error).message });
      } finally {
        setBusy(false);
      }
    },
    [busy, session, driverName, vehiclePlate, showFlash]
  );

  const handleOrderScan = useCallback(
    async (orderCode: string) => {
      if (!session || busy) return;
      setBusy(true);
      try {
        const res = await fetch(`/api/sessions/${session.id}/orders`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderCode }),
        });
        const data = await res.json();
        if (res.status === 409) {
          showFlash({ type: "error", text: `Đơn ${orderCode} đã quét rồi` });
          return;
        }
        if (!res.ok) throw new Error(data.error ?? "Lỗi thêm đơn");
        setSession(data.session);
        showFlash({ type: "success", text: `+ ${orderCode}` });
      } catch (e) {
        showFlash({ type: "error", text: (e as Error).message });
      } finally {
        setBusy(false);
      }
    },
    [session, busy, showFlash]
  );

  const [deletingOrderId, setDeletingOrderId] = useState<number | null>(null);

  const deleteOrder = useCallback(
    async (orderId: number) => {
      if (!session || deletingOrderId != null) return;
      setDeletingOrderId(orderId);
      try {
        const res = await fetch(
          `/api/sessions/${session.id}/orders/${orderId}`,
          { method: "DELETE" }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Lỗi xóa đơn");
        setSession(data.session);
        showFlash({ type: "info", text: "Đã xóa đơn" });
      } catch (e) {
        showFlash({ type: "error", text: (e as Error).message });
      } finally {
        setDeletingOrderId(null);
      }
    },
    [session, deletingOrderId, showFlash]
  );

  const startExport = useCallback(async () => {
    if (!session || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}/start-export`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lỗi bắt đầu xuất");
      setSession(data.session);
      setStep("exporting");
    } catch (e) {
      showFlash({ type: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }, [session, busy, showFlash]);

  const finishExport = useCallback(async () => {
    if (!session || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}/finish`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lỗi kết thúc");
      setSession(data.session);
      setStep("done");
    } catch (e) {
      showFlash({ type: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }, [session, busy, showFlash]);

  const resetAll = useCallback(() => {
    setSession(null);
    setSelected(null);
    setDriverName("");
    setVehiclePlate("");
    setStep("select");
    setFlash(null);
    loadTrucks();
  }, [loadTrucks]);

  return (
    <div className="flex flex-col pb-6">
      <PageHeader title="Xuất hàng" description="Quét QR cổng và đơn hàng xuất" />

      <StepIndicator step={step} />

      {flash && (
        <div
          role="alert"
          aria-live="polite"
          className={`mb-3 rounded-xl px-4 py-3 text-sm font-semibold ${
            flash.type === "success"
              ? "bg-green-100 text-green-800"
              : flash.type === "error"
                ? "bg-red-100 text-red-800"
                : "bg-slate-200 text-slate-700"
          }`}
        >
          {flash.text}
        </div>
      )}

      {step === "select" && (
        <section className="flex flex-col gap-3">
          <p className="text-center text-sm text-slate-600">
            Chọn xe từ <b>kế hoạch vận tải hôm nay</b>
          </p>
          {trucksLoading ? (
            <SkeletonList count={3} />
          ) : trucksError ? (
            <div className="rounded-xl bg-red-50 p-4 text-center text-sm text-red-700">
              {trucksError}
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={loadTrucks}
              >
                Thử lại
              </Button>
            </div>
          ) : trucks.length === 0 ? (
            <div className="rounded-xl bg-amber-50 p-4 text-center text-sm text-amber-800">
              Chưa có xe trong kế hoạch hôm nay. Bấm &quot;Đăng ký mới&quot; nếu
              bạn là xe phát sinh.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {trucks.map((t) => (
                <li key={t.vehiclePlate}>
                  <button
                    type="button"
                    onClick={() => selectTruck(t)}
                    className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm active:bg-slate-50"
                  >
                    <p className="text-lg font-bold text-slate-900">
                      {t.vehiclePlate}
                    </p>
                    <p className="text-sm text-slate-500">
                      {t.driverName ?? "Chưa có tài xế"} · {t.gateCode ?? "-"}{" "}
                      · {t.expectedTime ?? "-"} · {t.orderCount} đơn KH
                      {t.isWalkIn && (
                        <span className="ml-1 text-orange-600">· Phát sinh</span>
                      )}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!showWalkIn ? (
            <Button
              variant="secondary"
              className="w-full border-2 border-dashed border-blue-300 bg-transparent text-blue-700 hover:bg-blue-50"
              onClick={() => setShowWalkIn(true)}
            >
              + Đăng ký mới (xe chưa có trong kế hoạch)
            </Button>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-3 font-bold text-slate-800">Đăng ký xe mới</h3>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-600">
                  Biển số xe *
                  <input
                    value={walkPlate}
                    onChange={(e) => setWalkPlate(e.target.value.toUpperCase())}
                    className={`mt-1 ${inputCls} uppercase`}
                  />
                </label>
                <label className="text-sm font-semibold text-slate-600">
                  Tên tài xế (tùy chọn)
                  <input
                    value={walkDriver}
                    onChange={(e) => setWalkDriver(e.target.value)}
                    className={`mt-1 ${inputCls}`}
                  />
                </label>
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  onClick={registerWalkIn}
                  loading={busy}
                  loadingText="Đang đăng ký..."
                  className="flex-1"
                >
                  Xác nhận
                </Button>
                <Button
                  onClick={() => setShowWalkIn(false)}
                  variant="ghost"
                  disabled={busy}
                >
                  Hủy
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      {step === "gate" && selected && (
        <section className="flex flex-col gap-4">
          <div className="rounded-xl bg-white p-3 shadow-sm text-sm">
            <p className="font-bold text-slate-800">{vehiclePlate}</p>
            <p className="text-slate-500">
              {driverName || "Chưa có tài xế"} · Dự kiến{" "}
              {selected.expectedTime ?? "—"} · {selected.gateCode ?? "—"}
            </p>
          </div>
          <p className="text-center text-sm text-slate-600">
            Đưa camera vào mã QR <b>cổng xuất hàng</b>
          </p>
          <QrScanner onResult={handleGateScan} paused={busy} />
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              setStep("select");
              setSelected(null);
            }}
          >
            Quay lại chọn xe
          </Button>
        </section>
      )}

      {step === "orders" && session && (
        <OrdersStep
          session={session}
          onScan={handleOrderScan}
          onDelete={deleteOrder}
          onStart={startExport}
          busy={busy}
          deletingOrderId={deletingOrderId}
        />
      )}

      {step === "exporting" && session && (
        <ExportingStep session={session} onFinish={finishExport} busy={busy} />
      )}

      {step === "done" && session && (
        <DoneStep session={session} onReset={resetAll} />
      )}
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const order: Step[] = ["select", "gate", "orders", "exporting", "done"];
  const labels: Record<Step, string> = {
    select: "Chọn xe",
    gate: "Cổng",
    orders: "Đơn hàng",
    exporting: "Xuất",
    done: "Xong",
  };
  const current = order.indexOf(step);
  return (
    <div className="mb-4 flex items-center gap-1">
      {order.map((s, i) => (
        <div key={s} className="flex flex-1 flex-col items-center gap-1">
          <div
            className={`h-1.5 w-full rounded-full ${
              i <= current ? "bg-blue-600" : "bg-slate-300"
            }`}
          />
          <span
            className={`text-[10px] ${
              i <= current ? "font-semibold text-blue-700" : "text-slate-400"
            }`}
          >
            {labels[s]}
          </span>
        </div>
      ))}
    </div>
  );
}

function OrdersStep({
  session,
  onScan,
  onDelete,
  onStart,
  busy,
  deletingOrderId,
}: {
  session: SessionWithOrders;
  onScan: (code: string) => void;
  onDelete: (id: number) => void;
  onStart: () => void;
  busy: boolean;
  deletingOrderId: number | null;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-xl bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Cổng</span>
          <span className="font-bold text-slate-800">{session.gate_code}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Xe</span>
          <span className="font-semibold text-slate-700">
            {session.vehicle_plate} · {session.driver_name}
          </span>
        </div>
      </div>

      <p className="text-center text-sm text-slate-600">
        Quét mã QR <b>đơn hàng xuất thực tế</b> (kho)
      </p>
      <QrScanner onResult={onScan} paused={busy} />

      <div className="rounded-xl bg-white p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-bold text-slate-800">Đơn đã quét</h2>
          <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-sm font-bold text-blue-700">
            {session.orders_count}
          </span>
        </div>
        {session.orders.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">
            Chưa có đơn nào
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {session.orders.map((o) => (
              <li
                key={o.id}
                className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono font-semibold text-slate-800">
                    {o.order_code}
                  </p>
                  <p className="text-xs text-slate-400">
                    {formatTime(o.scanned_at)}
                  </p>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => onDelete(o.id)}
                  loading={deletingOrderId === o.id}
                  disabled={deletingOrderId != null}
                >
                  Xóa
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Button
        onClick={onStart}
        loading={busy}
        loadingText="Đang xử lý..."
        variant="success"
        size="lg"
        disabled={session.orders_count === 0}
        className="w-full py-4 text-base shadow"
      >
        Bắt đầu xuất hàng (≈30 phút)
      </Button>
    </section>
  );
}

function ExportingStep({
  session,
  onFinish,
  busy,
}: {
  session: SessionWithOrders;
  onFinish: () => void;
  busy: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remaining = session.export_estimated_at
    ? diffToNow(session.export_estimated_at, now)
    : null;
  const overdue = remaining != null && remaining < 0;

  return (
    <section className="flex flex-col items-center gap-5">
      <div className="rounded-xl bg-white p-3 text-center shadow-sm w-full">
        <p className="text-sm text-slate-500">
          {session.gate_code} · {session.vehicle_plate}
        </p>
        <p className="text-sm text-slate-500">
          {session.orders_count} đơn đang xuất
        </p>
      </div>

      <div className="flex flex-col items-center gap-1">
        <span className="text-sm font-medium text-slate-500">
          {remaining == null
            ? "Chưa có thời gian dự kiến"
            : overdue
              ? "Đã quá thời gian dự kiến"
              : "Dự kiến xong sau"}
        </span>
        <span
          className={`font-mono text-5xl font-bold tabular-nums sm:text-6xl ${
            remaining == null
              ? "text-slate-400"
              : overdue
                ? "text-red-600"
                : "text-green-600"
          }`}
        >
          {remaining == null ? "—" : formatCountdown(remaining)}
        </span>
        <span className="text-xs text-slate-400">
          Bắt đầu lúc {formatTime(session.export_started_at)}
        </span>
      </div>

      <Button
        onClick={onFinish}
        loading={busy}
        loadingText="Đang xử lý..."
        size="lg"
        className="w-full py-5 text-lg shadow"
      >
        Xuất xong
      </Button>
    </section>
  );
}

function DoneStep({
  session,
  onReset,
}: {
  session: SessionWithOrders;
  onReset: () => void;
}) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-5 py-8 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-4xl">
        ✓
      </div>
      <div>
        <h2 className="text-xl font-bold text-slate-800">Hoàn thành!</h2>
        <p className="mt-1 text-sm text-slate-500">
          {session.gate_code} · {session.vehicle_plate} · {session.orders_count}{" "}
          đơn
        </p>
      </div>
      <div className="w-full rounded-xl bg-white p-4 text-left text-sm shadow-sm">
        <Row label="Tài xế" value={session.driver_name} />
        <Row label="Bắt đầu xuất" value={formatTime(session.export_started_at)} />
        <Row label="Xuất xong" value={formatTime(session.export_finished_at)} />
      </div>
      <Button onClick={onReset} size="lg" className="w-full py-4 text-lg shadow">
        Phiên mới
      </Button>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-800">{value}</span>
    </div>
  );
}
