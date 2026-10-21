import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scenario } from "@/lib/scenario";
import { validateChange } from "@/lib/engine/validate";
import { getChangeStates } from "@/lib/workspace";

/**
 * POST /api/validate — jalankan engine validasi terhadap state change-set
 * saat ini, simpan sebagai run audit, kembalikan laporan lengkap.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const label: string =
      typeof body?.label === "string" && body.label.trim()
        ? body.label.trim().slice(0, 120)
        : "Validasi perubahan";

    const changeStates = await getChangeStates();
    const runId = crypto.randomUUID();

    const report = validateChange(scenario, changeStates, { runId, label });

    await db.validationRun.create({
      data: {
        id: runId,
        requestId: scenario.changeRequest.id,
        label,
        verdict: report.verdict,
        criticalCount: report.summary.criticalCount,
        highCount: report.summary.highCount,
        warnCount: report.summary.warnCount,
        reportJson: JSON.stringify(report),
        changeSnapshot: JSON.stringify(changeStates),
      },
    });

    return NextResponse.json({ report, runId });
  } catch (err) {
    console.error("[api/validate]", err);
    return NextResponse.json(
      { error: "Gagal menjalankan validasi" },
      { status: 500 }
    );
  }
}
