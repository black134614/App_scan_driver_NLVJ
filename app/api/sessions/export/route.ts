import { NextRequest, NextResponse } from "next/server";
import { buildSessionsWorkbook } from "@/lib/export";
import { listSessionsForExport } from "@/lib/sessions";
import type { SessionFilters } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseFilters(searchParams: URLSearchParams): SessionFilters {
  return {
    gate: searchParams.get("gate") ?? undefined,
    driver: searchParams.get("driver") ?? undefined,
    orderCode: searchParams.get("orderCode") ?? undefined,
    exportDate: searchParams.get("exportDate") ?? undefined,
  };
}

export async function GET(req: NextRequest) {
  const filters = parseFilters(req.nextUrl.searchParams);
  const sessions = await listSessionsForExport(filters);
  const buffer = buildSessionsWorkbook(sessions);
  const filename = `xuat-hang-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
