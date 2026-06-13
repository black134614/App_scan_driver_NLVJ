"use client";

import { useCallback, useRef } from "react";
import {
  Scanner,
  type IDetectedBarcode,
  type IScannerError,
} from "@yudiel/react-qr-scanner";

interface QrScannerProps {
  onResult: (value: string) => void;
  paused?: boolean;
  /** Khoảng thời gian (ms) chặn quét trùng cùng 1 mã. Mặc định 1200ms. */
  cooldownMs?: number;
}

export default function QrScanner({
  onResult,
  paused = false,
  cooldownMs = 1200,
}: QrScannerProps) {
  const lastValueRef = useRef<string>("");
  const lastTimeRef = useRef<number>(0);

  const handleScan = useCallback(
    (codes: IDetectedBarcode[]) => {
      const value = codes[0]?.rawValue?.trim();
      if (!value) return;

      const now = Date.now();
      if (value === lastValueRef.current && now - lastTimeRef.current < cooldownMs) {
        return;
      }
      lastValueRef.current = value;
      lastTimeRef.current = now;

      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate?.(80);
      }

      onResult(value);
    },
    [onResult, cooldownMs]
  );

  const handleError = useCallback((error: IScannerError) => {
    console.error("Scanner error:", error);
  }, []);

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border-2 border-slate-200 bg-black shadow-inner">
      <Scanner
        onScan={handleScan}
        onError={handleError}
        paused={paused}
        formats={[
          "qr_code",
          "code_128",
          "code_39",
          "ean_13",
          "ean_8",
          "data_matrix",
          "pdf417",
        ]}
        allowMultiple
        scanDelay={300}
        sound
        constraints={{ facingMode: "environment" }}
        styles={{
          container: { width: "100%", aspectRatio: "1 / 1" },
          video: { objectFit: "cover" },
        }}
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-3/5 w-3/5 rounded-2xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />
      </div>
    </div>
  );
}
