import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/** GET /api/runs — riwayat eksekusi validasi (bukti audit yang dapat dibandingkan). */
export async function GET() {
  const runs = await db.validationRun.findMany({
    orderBy: { createdAt: "desc" },
    take: 25,
    select: {
      id: true,
      label: true,
      verdict: true,
      criticalCount: true,
      highCount: true,
      warnCount: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ runs });
}
