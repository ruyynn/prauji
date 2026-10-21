import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/** GET /api/runs/[id] — ambil laporan lengkap satu run. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const run = await db.validationRun.findUnique({ where: { id } });
  if (!run) {
    return NextResponse.json({ error: "Run tidak ditemukan" }, { status: 404 });
  }
  return NextResponse.json({ run });
}
