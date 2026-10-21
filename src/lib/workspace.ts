/**
 * PRAUJI — state workspace sisi server (SQLite): status change-set
 * dipersist agar demo konsisten antar-refresh dan tiap run validasi
 * dapat dibandingkan.
 */
import { db } from "@/lib/db";
import { scenario } from "@/lib/scenario";
import { defaultChangeStates, type ChangeStates } from "@/lib/engine/validate";

const WORKSPACE_ID = "main";

export async function getChangeStates(): Promise<ChangeStates> {
  let row = await db.workspaceState.findUnique({
    where: { id: WORKSPACE_ID },
  });
  if (!row) {
    const defaults = defaultChangeStates(scenario);
    row = await db.workspaceState.create({
      data: {
        id: WORKSPACE_ID,
        scenarioId: scenario.id,
        changeStates: JSON.stringify(defaults),
      },
    });
  }
  return JSON.parse(row.changeStates) as ChangeStates;
}

export async function saveChangeStates(states: ChangeStates): Promise<void> {
  await db.workspaceState.upsert({
    where: { id: WORKSPACE_ID },
    update: { changeStates: JSON.stringify(states) },
    create: {
      id: WORKSPACE_ID,
      scenarioId: scenario.id,
      changeStates: JSON.stringify(states),
    },
  });
}

export async function resetWorkspace(): Promise<ChangeStates> {
  const defaults = defaultChangeStates(scenario);
  await saveChangeStates(defaults);
  await db.validationRun.deleteMany({});
  return defaults;
}
