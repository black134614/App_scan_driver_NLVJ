"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { todayDateString } from "@/lib/plan-parse";
import type { DriverTruckOption, SessionWithOrders } from "@/lib/types";
import { formatCountdown, formatTime } from "@/lib/format";

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
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFlash = useCallback((f: NonNullable<Flash>) => {
    setFlash(f);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 2500);
  }, []);

  const loadTrucks = useCallback(async () => {
    try {
      const date = todayDateString();
      const res = await fetch(`/api/plans/trucks?date=${date}`, {
        cache: "no-store",
      });
      const data = await res.json();
      setTrucks(data.trucks ?? []);
    } catch {
      setTrucks([]);
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
      if (!session) return;
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
      }
    },
    [session, showFlash]
  );

  const deleteOrder = useCallback(
    async (orderId: number) => {
      if (!session) return;
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
      }
    },
    [session, showFlash]
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
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-10 pt-5">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-800">Xuất hàng</h1>
        <Link
          href="/dashboard"
          className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-600 active:bg-slate-300"
        >
          Dashboard
        </Link>
      </header>

      <StepIndicator step={step} />

      {flash && (
        <div
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
          {trucks.length === 0 ? (
            <div className="rounded-xl bg-amber-50 p-4 text-center text-sm text-amber-800">
              Chưa có xe trong kế hoạch hôm nay. Bấm &quot;Đăng ký mới&quot; nếu
              bạn là xe phát sinh.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {trucks.map((t) => (
                <li key={t.vehiclePlate}>
                  <button
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
            <button
              onClick={() => setShowWalkIn(true)}
              className="rounded-xl border-2 border-dashed border-blue-300 py-3 text-sm font-semibold text-blue-700"
            >
              + Đăng ký mới (xe chưa có trong kế hoạch)
            </button>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-3 font-bold text-slate-800">Đăng ký xe mới</h3>
              <div className="flex flex-col gap-2">
                <input
                  value={walkPlate}
                  onChange={(e) => setWalkPlate(e.target.value.toUpperCase())}
                  placeholder="Biển số xe *"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase"
                />
                <input
                  value={walkDriver}
                  onChange={(e) => setWalkDriver(e.target.value)}
                  placeholder="Tên tài xế (tùy chọn)"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={registerWalkIn}
                  disabled={busy}
                  className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white disabled:bg-slate-300"
                >
                  Xác nhận
                </button>
                <button
                  onClick={() => setShowWalkIn(false)}
                  className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold"
                >
                  Hủy
                </button>
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
              {driverName || "Chưa có tài xế"} · Dự kiến {selected.expectedTime}{" "}
              · {selected.gateCode}
            </p>
          </div>
          <p className="text-center text-sm text-slate-600">
            Đưa camera vào mã QR <b>cổng xuất hàng</b>
          </p>
          <QrScanner onResult={handleGateScan} paused={busy} />
          <button
            onClick={() => {
              setStep("select");
              setSelected(null);
            }}
            className="rounded-xl bg-slate-200 py-3 font-semibold text-slate-600"
          >
            Quay lại chọn xe
          </button>
        </section>
      )}

      {step === "orders" && session && (
        <OrdersStep
          session={session}
          onScan={handleOrderScan}
          onDelete={deleteOrder}
          onStart={startExport}
          busy={busy}
        />
      )}

      {step === "exporting" && session && (
        <ExportingStep session={session} onFinish={finishExport} busy={busy} />
      )}

      {step === "done" && session && (
        <DoneStep session={session} onReset={resetAll} />
      )}
    </main>
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
}: {
  session: SessionWithOrders;
  onScan: (code: string) => void;
  onDelete: (id: number) => void;
  onStart: () => void;
  busy: boolean;
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
      <QrScanner onResult={onScan} />

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
                <button
                  onClick={() => onDelete(o.id)}
                  className="ml-3 shrink-0 rounded-lg bg-red-100 px-3 py-1.5 text-sm font-semibold text-red-700 active:bg-red-200"
                >
                  Xóa
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        onClick={onStart}
        disabled={busy || session.orders_count === 0}
        className="rounded-xl bg-green-600 py-4 text-base font-bold text-white shadow active:bg-green-700 disabled:bg-slate-300"
      >
        Bắt đầu xuất hàng (≈30 phút)
      </button>
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

  const target = session.export_estimated_at
    ? new Date(session.export_estimated_at).getTime()
    : now;
  const remaining = Math.round((target - now) / 1000);
  const overdue = remaining < 0;

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
          {overdue ? "Đã quá thời gian dự kiến" : "Dự kiến xong sau"}
        </span>
        <span
          className={`font-mono text-6xl font-bold tabular-nums ${
            overdue ? "text-red-600" : "text-green-600"
          }`}
        >
          {formatCountdown(remaining)}
        </span>
        <span className="text-xs text-slate-400">
          Bắt đầu lúc {formatTime(session.export_started_at)}
        </span>
      </div>

      <button
        onClick={onFinish}
        disabled={busy}
        className="w-full rounded-xl bg-blue-600 py-5 text-lg font-bold text-white shadow active:bg-blue-700 disabled:bg-slate-300"
      >
        Xuất xong
      </button>
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
      <button
        onClick={onReset}
        className="w-full rounded-xl bg-blue-600 py-4 font-bold text-white shadow active:bg-blue-700"
      >
        Phiên mới
      </button>
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
