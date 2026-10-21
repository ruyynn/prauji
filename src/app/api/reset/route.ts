import { NextResponse } from "next/server";
import { resetWorkspace } from "@/lib/workspace";

/** POST /api/reset — kembalikan demo ke kondisi awal + bersihkan riwayat. */
export async function POST() {
  const changeStates = await resetWorkspace();
  return NextResponse.json({ changeStates });
}
