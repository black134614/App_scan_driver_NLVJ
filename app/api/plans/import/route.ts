import { NextRequest, NextResponse } from "next/server";
import { todayDateString } from "@/lib/plan-parse";
import { importPlanOrders } from "@/lib/plans";
import type { PlanOrderInput } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  const b = body as {
    date?: string;
    replace?: boolean;
    rows?: Array<Record<string, unknown>>;
  };

  const date = b.date?.trim() || todayDateString();
  const replace = Boolean(b.replace);
  const rows = b.rows ?? [];

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "Không có dòng dữ liệu" }, { status: 400 });
  }

  const inputs: PlanOrderInput[] = [];
  const errors: string[] = [];

  for (const row of rows) {
    const planDate = String(row.planDate ?? date).trim();
    const gateCode = String(row.gateCode ?? "").trim();
    const expectedTime = String(row.expectedTime ?? "").trim();
    const orderCode = String(row.orderCode ?? "").trim();
    const rowErrors = (row.errors as string[] | undefined) ?? [];

    if (rowErrors.length > 0 || !gateCode || !expectedTime || !orderCode) {
      errors.push(
        `Dòng ${row.rowNumber ?? "?"}: ${rowErrors.join(", ") || "Thiếu dữ liệu"}`
      );
      continue;
    }

    const tonnage =
      row.tonnage == null ? null : Number(String(row.tonnage).replace(",", "."));

    inputs.push({
      planDate,
      gateCode,
      expectedTime,
      orderCode,
      tonnage: tonnage != null && !Number.isNaN(tonnage) ? tonnage : null,
      vehiclePlate: String(row.vehiclePlate ?? "").trim() || null,
      driverName: String(row.driverName ?? "").trim() || null,
      source: "import",
    });
  }

  if (errors.length > 0 && inputs.length === 0) {
    return NextResponse.json({ error: "Import thất bại", details: errors }, { status: 400 });
  }

  const result = await importPlanOrders(date, inputs, replace);
  return NextResponse.json({
    ...result,
    warnings: errors,
  });
}
