"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionWithOrders } from "@/lib/types";
import { formatCountdown, formatTime } from "@/lib/format";

const QrScanner = dynamic(() => import("@/components/QrScanner"), {
  ssr: false,
  loading: () => (
    <div className="flex aspect-square w-full items-center justify-center rounded-2xl bg-slate-200 text-slate-500">
      Đang khởi động camera...
    </div>
  ),
});

type Step = "info" | "gate" | "orders" | "exporting" | "done";
type Flash = { type: "success" | "error" | "info"; text: string } | null;

export default function DriverPage() {
  const [step, setStep] = useState<Step>("info");
  const [driverName, setDriverName] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [session, setSession] = useState<SessionWithOrders | null>(null);
  const [flash, setFlash] = useState<Flash>(null);
  const [busy, setBusy] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFlash = useCallback((f: NonNullable<Flash>) => {
    setFlash(f);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 2500);
  }, []);

  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  const handleGateScan = useCallback(
    async (gateCode: string) => {
      if (busy || session) return;
      setBusy(true);
      try {
        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ driverName, vehiclePlate, gateCode }),
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
    setDriverName("");
    setVehiclePlate("");
    setStep("info");
    setFlash(null);
  }, []);

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

      {step === "info" && (
        <InfoStep
          driverName={driverName}
          vehiclePlate={vehiclePlate}
          setDriverName={setDriverName}
          setVehiclePlate={setVehiclePlate}
          onNext={() => setStep("gate")}
        />
      )}

      {step === "gate" && (
        <section className="flex flex-col gap-4">
          <p className="text-center text-sm text-slate-600">
            Đưa camera vào mã QR của <b>cổng xuất hàng</b>
          </p>
          <QrScanner onResult={handleGateScan} paused={busy} />
          <button
            onClick={() => setStep("info")}
            className="rounded-xl bg-slate-200 py-3 font-semibold text-slate-600 active:bg-slate-300"
          >
            Quay lại
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
  const order: Step[] = ["info", "gate", "orders", "exporting", "done"];
  const labels: Record<Step, string> = {
    info: "Thông tin",
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

function InfoStep({
  driverName,
  vehiclePlate,
  setDriverName,
  setVehiclePlate,
  onNext,
}: {
  driverName: string;
  vehiclePlate: string;
  setDriverName: (v: string) => void;
  setVehiclePlate: (v: string) => void;
  onNext: () => void;
}) {
  const valid = driverName.trim() && vehiclePlate.trim();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onNext();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-semibold text-slate-700">
          Tên tài xế
        </label>
        <input
          value={driverName}
          onChange={(e) => setDriverName(e.target.value)}
          placeholder="Nguyễn Văn A"
          className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-blue-500"
          autoComplete="name"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-semibold text-slate-700">
          Biển số xe
        </label>
        <input
          value={vehiclePlate}
          onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
          placeholder="51C-123.45"
          className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-base uppercase outline-none focus:border-blue-500"
        />
      </div>
      <button
        type="submit"
        disabled={!valid}
        className="mt-2 rounded-xl bg-blue-600 py-4 text-base font-bold text-white shadow active:bg-blue-700 disabled:bg-slate-300"
      >
        Tiếp tục → Quét cổng
      </button>
    </form>
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
        Quét mã QR <b>đơn hàng xuất</b> (có thể quét nhiều đơn ghép)
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
