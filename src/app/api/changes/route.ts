import { NextRequest, NextResponse } from "next/server";
import { getChangeStates, saveChangeStates } from "@/lib/workspace";
import { scenario } from "@/lib/scenario";
import type { ChangeStates } from "@/lib/engine/validate";

/**
 * POST /api/changes — aksi pada change-set:
 *   { action: "toggle", changeId, applied }
 *   { action: "remediate", changeId }
 *   { action: "unremediate", changeId }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body?.action as string;
    const changeId = body?.changeId as string;
    const states = await getChangeStates();

    const changeExists = scenario.changeRequest.changes.some(
      (c) => c.id === changeId
    );
    if (!changeExists) {
      return NextResponse.json(
        { error: "Perubahan tidak ditemukan dalam skenario" },
        { status: 404 }
      );
    }

    const next: ChangeStates = { ...states };

    if (action === "toggle") {
      const applied = Boolean(body?.applied);
      next[changeId] = { applied, remediated: false };
    } else if (action === "remediate") {
      next[changeId] = { applied: true, remediated: true };
    } else if (action === "unremediate") {
      next[changeId] = { applied: true, remediated: false };
    } else {
      return NextResponse.json({ error: "Aksi tidak dikenal" }, { status: 400 });
    }

    await saveChangeStates(next);
    return NextResponse.json({ changeStates: next });
  } catch (err) {
    console.error("[api/changes]", err);
    return NextResponse.json(
      { error: "Gagal memperbarui change-set" },
      { status: 500 }
    );
  }
}
