export function formatTime(iso: string | null): string {
  if (!iso) return "--:--";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "--";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--";
  return d.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Chênh lệch tới mốc thời gian, dạng mm:ss (âm nếu đã quá hạn). */
export function diffToNow(targetIso: string | null, nowMs: number): number {
  if (!targetIso) return 0;
  const t = new Date(targetIso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.round((t - nowMs) / 1000);
}

export function formatCountdown(seconds: number): string {
  const sign = seconds < 0 ? "-" : "";
  const abs = Math.abs(seconds);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${sign}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
