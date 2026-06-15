export type SessionStatus = "scanning" | "exporting" | "done";

export interface OrderRow {
  id: number;
  session_id: number;
  order_code: string;
  scanned_at: string;
}

export interface SessionRow {
  id: number;
  driver_name: string;
  vehicle_plate: string;
  gate_code: string;
  status: SessionStatus;
  created_at: string;
  export_started_at: string | null;
  export_estimated_at: string | null;
  export_finished_at: string | null;
}

export interface SessionWithOrders extends SessionRow {
  orders: OrderRow[];
  orders_count: number;
}

export const EXPORT_ESTIMATE_MINUTES = 30;

export const PAGE_SIZE_OPTIONS = [10, 50, 100, 500] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export interface SessionFilters {
  gate?: string;
  driver?: string;
  orderCode?: string;
  exportDate?: string;
}

export interface PaginatedSessions {
  sessions: SessionWithOrders[];
  total: number;
  page: number;
  limit: PageSize;
  totalPages: number;
}

export interface FilterOptions {
  gates: string[];
  drivers: string[];
}

export interface AdminSessionInput {
  driverName: string;
  vehiclePlate: string;
  gateCode: string;
  status?: SessionStatus;
  createdAt?: string | null;
  exportStartedAt?: string | null;
  exportEstimatedAt?: string | null;
  exportFinishedAt?: string | null;
  orderCodes?: string[];
}

export interface AdminOrderInput {
  id?: number;
  orderCode: string;
}

export type PlanSource = "import" | "manual" | "walk_in";
export type PlanShift = "sang" | "chieu";
export type TruckQueueStatus =
  | "chua_vao"
  | "dang_quet"
  | "dang_xuat"
  | "xong"
  | "phat_sinh";

export type PortalRole = "warehouse" | "carrier" | "driver" | "anonymous";

export interface PortalSession {
  role: PortalRole;
  carrierId: number | null;
  carrierCode: string | null;
  carrierName: string | null;
}

export interface CarrierRow {
  id: number;
  code: string;
  name: string;
  token: string;
  active: number;
  created_at: string;
}

export interface GateRow {
  id: number;
  code: string;
  name: string;
  start_minutes: number;
  end_minutes: number;
  load_minutes: number;
  days_mask: number;
  active: number;
  created_at: string;
}

export interface CarrierGateRow {
  id: number;
  carrier_id: number;
  gate_id: number;
}

export interface CarrierHiddenSlotRow {
  id: number;
  carrier_id: number;
  gate_id: number;
  slot_minutes: number;
}

export interface PortalLinkRow {
  kind: string;
  token: string;
}

export interface TimeSlot {
  minutes: number;
  label: string;
}

export interface PlanOrderRow {
  id: number;
  plan_date: string;
  gate_code: string;
  expected_time: string;
  expected_minutes: number;
  shift: PlanShift;
  order_code: string;
  tonnage: number | null;
  vehicle_plate: string | null;
  driver_name: string | null;
  source: PlanSource;
  carrier_id: number | null;
  created_at: string;
}

export interface PlanOrderInput {
  planDate: string;
  gateCode: string;
  expectedTime: string;
  orderCode: string;
  tonnage?: number | null;
  vehiclePlate?: string | null;
  driverName?: string | null;
  source?: PlanSource;
  carrierId?: number | null;
}

export interface ParsedPlanRow {
  planDate: string;
  gateCode: string;
  expectedTime: string;
  orderCode: string;
  tonnage: number | null;
  vehiclePlate: string | null;
  driverName: string | null;
  errors: string[];
}

export interface PlanGridCell {
  order: PlanOrderRow;
  status: "planned" | "in_progress" | "done";
}

export interface PlanGrid {
  gates: string[];
  times: string[];
  cells: Record<string, Record<string, PlanGridCell[]>>;
}

export interface PlanStats {
  totalTonnage: number;
  totalOrders: number;
  totalTrucksMorning: number;
  totalTrucksAfternoon: number;
  pickedTonnage: number;
  pickedOrders: number;
  pickedTrucksMorning: number;
  pickedTrucksAfternoon: number;
  remainingTonnage: number;
  remainingOrders: number;
  remainingTrucksMorning: number;
  remainingTrucksAfternoon: number;
}

export interface TruckQueueItem {
  vehiclePlate: string;
  driverName: string | null;
  gateCode: string | null;
  expectedTime: string | null;
  orderCount: number;
  status: TruckQueueStatus;
  sessionId: number | null;
  isWalkIn: boolean;
}

export interface PlanDayView {
  date: string;
  orders: PlanOrderRow[];
  grid: PlanGrid;
  stats: PlanStats;
  queue: TruckQueueItem[];
  gateCarriers: Record<string, string>;
  gateNames: Record<string, string>;
}

export interface DriverTruckOption {
  vehiclePlate: string;
  driverName: string | null;
  gateCode: string | null;
  expectedTime: string | null;
  orderCount: number;
  isWalkIn: boolean;
}

export const MORNING_CUTOFF_MINUTES = 12 * 60;
