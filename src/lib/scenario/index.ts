/**
 * PRAUJI — registry skenario. MVP mengirim satu skenario sintetis;
 * arsitektur engine tidak terikat pada skenario tertentu.
 */
import type { Scenario } from "@/lib/engine/types";
import { scenario as scenarioData } from "./satuan-net";

export const scenario: Scenario = scenarioData;
