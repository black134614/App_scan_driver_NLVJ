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
