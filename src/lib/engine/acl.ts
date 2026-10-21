/**
 * PRAUJI — evaluasi ACL.
 *
 * Semantik: daftar aturan berurutan, keputusan = aturan PERTAMA yang
 * cocok; tanpa kecocokan = implicit deny. Setiap keputusan menyertakan
 * aturan penentunya agar temuan selalu dapat dijelaskan.
 */
import type {
  AclRule,
  Asset,
  ProposedChange,
  Scenario,
  Selector,
  ServiceDef,
  ServiceSelector,
} from "./types";

export function selectorMatches(
  sel: Selector,
  asset: Asset,
  assetById: Map<string, Asset>
): boolean {
  if (sel.any) return true;
  if (sel.assets && sel.assets.includes(asset.id)) return true;
  if (sel.zones && sel.zones.includes(asset.zone)) return true;
  // Referensi aset yang tidak dikenal dalam model → tidak dapat dicocokkan;
  // engine memperlakukannya sebagai celah model (MODEL_GAP), bukan keputusan aman.
  return false;
}

export function selectorHasUnknownRefs(
  sel: Selector,
  assetById: Map<string, Asset>
): string[] {
  const unknown: string[] = [];
  if (sel.assets) {
    for (const a of sel.assets) {
      if (!assetById.has(a)) unknown.push(a);
    }
  }
  return unknown;
}

export function serviceMatches(rule: ServiceSelector, svc: ServiceDef): boolean {
  if (rule.any) return true;
  if (rule.mgmtOnly) return svc.mgmtOnly === true;
  return rule.port !== undefined && rule.port === svc.port;
}

export interface FlowDecision {
  allowed: boolean;
  matchedRuleId: string | null;
  matchedRuleAction: "allow" | "deny";
}

/**
 * Evaluasi satu aliran terhadap daftar aturan efektif.
 * Mengembalikan aturan yang menentukan keputusan agar temuan
 * selalu dapat dibuktikan ("aturan mana yang membuka akses ini?").
 */
export function evaluateFlow(
  rules: AclRule[],
  src: Asset,
  dst: Asset,
  svc: ServiceDef,
  assetById: Map<string, Asset>
): FlowDecision {
  for (const rule of rules) {
    const srcMatch = selectorMatches(rule.source, src, assetById);
    const dstMatch = selectorMatches(rule.destination, dst, assetById);
    const svcMatch = serviceMatches(rule.service, svc);
    if (srcMatch && dstMatch && svcMatch) {
      return {
        allowed: rule.action === "allow",
        matchedRuleId: rule.id,
        matchedRuleAction: rule.action,
      };
    }
  }
  // Default deny — tidak ada aturan yang cocok
  return { allowed: false, matchedRuleId: null, matchedRuleAction: "deny" };
}

export interface EffectiveRules {
  rules: AclRule[];
  /** Aturan hasil usulan (untuk atribusi temuan) */
  proposedRuleIds: Set<string>;
  /** ID perubahan pemilik tiap aturan usulan */
  ruleToChange: Map<string, string>;
  /** Referensi tidak dikenal yang ditemukan (celah model) */
  unknownRefs: { changeId: string; refs: string[] }[];
  /** Aturan baseline yang dihapus/diubah */
  modifiedBaselineIds: Set<string>;
}

/**
 * Aturan efektif = aturan dari perubahan yang diterapkan (di depan,
 * insert-before) diikuti aturan baseline minus yang dihapus/diubah.
 * Perubahan yang diremediasi memakai aturan penggantinya.
 */
export function buildEffectiveRules(
  scenario: Scenario,
  changeStates: Record<string, { applied: boolean; remediated: boolean }>
): EffectiveRules {
  const rules: AclRule[] = [];
  const proposedRuleIds = new Set<string>();
  const ruleToChange = new Map<string, string>();
  const unknownRefs: { changeId: string; refs: string[] }[] = [];
  const modifiedBaselineIds = new Set<string>();

  const assetById = new Map(scenario.assets.map((a) => [a.id, a]));

  for (const change of scenario.changeRequest.changes) {
    const state = changeStates[change.id];
    if (!state || !state.applied) continue;

    let rule: AclRule | undefined;
    if (state.remediated && change.remediation) {
      // Remediasi menghadirkan aturan pengganti — termasuk untuk remove_rule
      // agar aturan baseline yang dibuang tidak dibiarkan tanpa gantinya.
      rule = change.remediation.remediatedRule;
    } else if (change.op === "add_rule" || change.op === "modify_rule") {
      rule = change.newRule;
    }

    if (rule) {
      const refs = [
        ...selectorHasUnknownRefs(rule.source, assetById),
        ...selectorHasUnknownRefs(rule.destination, assetById),
      ];
      if (refs.length > 0) {
        unknownRefs.push({ changeId: change.id, refs });
      }
      rules.push(rule);
      proposedRuleIds.add(rule.id);
      ruleToChange.set(rule.id, change.id);
    }

    if (change.op === "remove_rule" || change.op === "modify_rule") {
      if (change.targetRuleId) modifiedBaselineIds.add(change.targetRuleId);
    }
  }

  // Aturan baseline menyusul, kecuali yang dihapus/diubah
  for (const rule of scenario.baselineRules) {
    if (modifiedBaselineIds.has(rule.id)) continue;
    rules.push(rule);
  }

  return {
    rules,
    proposedRuleIds,
    ruleToChange,
    unknownRefs,
    modifiedBaselineIds,
  };
}

/** Cari objek aturan berdasarkan ID (untuk tampilan). */
export function findRule(
  scenario: Scenario,
  effective: EffectiveRules,
  ruleId: string | null
): AclRule | undefined {
  if (!ruleId) return undefined;
  return (
    effective.rules.find((r) => r.id === ruleId) ||
    scenario.baselineRules.find((r) => r.id === ruleId)
  );
}
