import { NextResponse } from "next/server";
import { scenario } from "@/lib/scenario";
import { getChangeStates } from "@/lib/workspace";

export async function GET() {
  const changeStates = await getChangeStates();
  return NextResponse.json({ scenario, changeStates });
}
