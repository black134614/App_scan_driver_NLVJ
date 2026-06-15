export interface CarrierColorStyle {
  headerBg: string;
  headerText: string;
  gateBg: string;
  gateText: string;
  border: string;
}

/** Palettes tương phản cao — dễ đọc trên màn hình kho / văn phòng */
const PALETTES: CarrierColorStyle[] = [
  {
    headerBg: "bg-slate-700",
    headerText: "text-white",
    gateBg: "bg-slate-200",
    gateText: "text-slate-900",
    border: "border-slate-500",
  },
  {
    headerBg: "bg-blue-800",
    headerText: "text-white",
    gateBg: "bg-blue-100",
    gateText: "text-blue-950",
    border: "border-blue-500",
  },
  {
    headerBg: "bg-emerald-800",
    headerText: "text-white",
    gateBg: "bg-emerald-100",
    gateText: "text-emerald-950",
    border: "border-emerald-600",
  },
  {
    headerBg: "bg-amber-800",
    headerText: "text-white",
    gateBg: "bg-amber-100",
    gateText: "text-amber-950",
    border: "border-amber-600",
  },
  {
    headerBg: "bg-violet-800",
    headerText: "text-white",
    gateBg: "bg-violet-100",
    gateText: "text-violet-950",
    border: "border-violet-500",
  },
  {
    headerBg: "bg-rose-800",
    headerText: "text-white",
    gateBg: "bg-rose-100",
    gateText: "text-rose-950",
    border: "border-rose-500",
  },
  {
    headerBg: "bg-cyan-800",
    headerText: "text-white",
    gateBg: "bg-cyan-100",
    gateText: "text-cyan-950",
    border: "border-cyan-600",
  },
  {
    headerBg: "bg-orange-800",
    headerText: "text-white",
    gateBg: "bg-orange-100",
    gateText: "text-orange-950",
    border: "border-orange-600",
  },
];

const UNASSIGNED: CarrierColorStyle = {
  headerBg: "bg-slate-500",
  headerText: "text-white",
  gateBg: "bg-slate-100",
  gateText: "text-slate-800",
  border: "border-slate-400",
};

function hashCarrierName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function carrierColorStyle(carrierName: string): CarrierColorStyle {
  const trimmed = carrierName.trim();
  if (!trimmed || trimmed === "Chưa gán VT") return UNASSIGNED;
  return PALETTES[hashCarrierName(trimmed) % PALETTES.length];
}

export const SHIFT_SECTION_STYLE = {
  sang: {
    section: "border-amber-600 shadow-md",
    bar: "border-b-2 border-amber-900 bg-amber-700",
    title: "text-white",
    badge: "bg-amber-950 text-amber-100 ring-1 ring-amber-400",
  },
  chieu: {
    section: "border-indigo-600 shadow-md",
    bar: "border-b-2 border-indigo-900 bg-indigo-700",
    title: "text-white",
    badge: "bg-indigo-950 text-indigo-100 ring-1 ring-indigo-400",
  },
} as const;
