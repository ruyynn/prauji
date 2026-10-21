/**
 * PRAUJI — orchestrator validasi.
 *
 * Alur: bangun aturan efektif dari baseline + perubahan → hitung
 * reachability kedua state → uji invariant → diff permukaan serangan
 * → laporan PASS / FAIL / INCONCLUSIVE. Semua temuan dihasilkan dari
 * evaluasi aktual engine — tidak ada teks temuan yang di-hardcode.
 */
import { buildEffectiveRules, evaluateFlow, type EffectiveRules } from "./acl";
import { evaluateInvariants } from "./invariants";
import { computeAttackChains, computeReachability, type ReachabilityMap } from "./reachability";
import type {
  AclRule,
  AttackChain,
  Finding,
  FlowInfo,
  Scenario,
  ValidationReport,
  Verdict,
} from "./types";

export interface ChangeState {
  applied: boolean;
  remediated: boolean;
}

export type ChangeStates = Record<string, ChangeState>;

export interface ValidateOptions {
  runId: string;
  label: string;
}

// ---------- Diff permukaan serangan ----------
function diffFlows(
  baseline: ReachabilityMap,
  proposed: ReachabilityMap
): { newFlows: FlowInfo[]; closedFlows: FlowInfo[] } {
  const newFlows: FlowInfo[] = [];
  const closedFlows: FlowInfo[] = [];

  for (const [key, flow] of proposed.flows) {
    if (!baseline.flows.has(key)) newFlows.push(flow);
  }
  for (const [key, flow] of baseline.flows) {
    if (!proposed.flows.has(key)) closedFlows.push(flow);
  }

  const sortFn = (a: FlowInfo, b: FlowInfo) =>
    `${a.src}|${a.dst}|${a.port}`.localeCompare(`${b.src}|${b.dst}|${b.port}`);
  newFlows.sort(sortFn);
  closedFlows.sort(sortFn);
  return { newFlows, closedFlows };
}

function chainSignature(c: AttackChain): string {
  if (!c.hops) return "unreachable";
  return c.hops
    .map((h) => `${h.from}>${h.to}:${h.port}(${h.ruleId ?? "deny"})`)
    .join("|");
}

// ---------- Temuan dari invariant ----------
function buildInvariantFindings(
  scenario: Scenario,
  baselineMap: ReachabilityMap,
  proposedMap: ReachabilityMap,
  effective: EffectiveRules,
  chainsBaseline: Record<string, AttackChain>,
  chainsProposed: Record<string, AttackChain>
): Finding[] {
  const assetById = new Map(scenario.assets.map((a) => [a.id, a]));
  const invById = new Map(scenario.invariants.map((i) => [i.id, i]));
  const findings: Finding[] = [];
  let counter = 1;

  const invariantResults = evaluateInvariants(
    scenario,
    proposedMap,
    scenario.invariants
  );

  for (const result of invariantResults) {
    if (result.status !== "FAIL") continue;
    const inv = invById.get(result.invariantId);
    if (!inv) continue;

    // Kelompokkan pelanggaran per aset tujuan → satu temuan per aset
    const byDst = new Map<string, typeof result.violations>();
    for (const v of result.violations) {
      const list = byDst.get(v.dst) ?? [];
      list.push(v);
      byDst.set(v.dst, list);
    }

    for (const [dstId, violations] of byDst) {
      const dstAsset = assetById.get(dstId);
      if (!dstAsset) continue;

      const isCriticalTarget =
        dstAsset.criticality === "critical" || dstAsset.criticality === "high";

      let findingType: Finding["findingType"] = "SERVICE_EXPOSURE";
      if (inv.type === "forbidden_path") {
        findingType = isCriticalTarget ? "NEW_ATTACK_PATH" : "SERVICE_EXPOSURE";
      } else if (inv.type === "required_path") {
        findingType = "SERVICE_IMPACT";
      }

      const impactedFlows: FlowInfo[] = [];
      let causedByRuleId: string | undefined;
      let causedByChangeId: string | undefined;
      let baselineReachable = false;

      if (inv.type === "required_path") {
        // Aluran terputus: cari aturan yang kini menolaknya
        for (const v of violations) {
          const dstSvc = dstAsset.services.find((s) => s.port === v.port);
          const srcAsset = assetById.get(v.src);
          if (!dstSvc || !srcAsset) continue;
          const decision = evaluateFlow(
            effective.rules,
            srcAsset,
            dstAsset,
            dstSvc,
            assetById
          );
          if (decision.matchedRuleId) causedByRuleId = decision.matchedRuleId;
          impactedFlows.push({
            src: v.src,
            dst: v.dst,
            port: v.port,
            serviceName: v.serviceName,
            proto: v.proto,
            matchedRuleId: decision.matchedRuleId,
            matchedRuleAction: decision.matchedRuleAction,
          });
        }
        baselineReachable = true;
      } else {
        for (const v of violations) {
          const flow = proposedMap.flows.get(`${v.src}|${v.dst}|${v.port}`);
          if (flow) {
            impactedFlows.push(flow);
            causedByRuleId = flow.matchedRuleId ?? undefined;
          }
        }
        const first = violations[0];
        baselineReachable =
          baselineMap.flows.has(`${first.src}|${first.dst}|${first.port}`);
      }

      if (causedByRuleId) {
        causedByChangeId = effective.ruleToChange.get(causedByRuleId);
      }

      const owningChange =
        causedByChangeId !== undefined
          ? scenario.changeRequest.changes.find((c) => c.id === causedByChangeId)
          : undefined;
      const remediationId = owningChange?.remediation?.id;

      const severity: Finding["severity"] =
        findingType === "NEW_ATTACK_PATH" && dstAsset.criticality === "critical"
          ? "critical"
          : inv.severity;

      let title: string;
      let description: string;
      let recommendation: string;

      if (findingType === "NEW_ATTACK_PATH") {
        const shorter =
          chainsProposed[dstId] &&
          chainsBaseline[dstId] &&
          chainsProposed[dstId].totalStages < chainsBaseline[dstId].totalStages;
        title = `Jalur akses baru menuju aset kritis: ${dstAsset.name}`;
        description = `Usulan perubahan membuka aluran langsung dari ${assetById.get(violations[0].src)?.name} ke ${dstAsset.name} pada layanan ${violations[0].serviceName} (${violations[0].port}/${violations[0].proto}).${shorter ? " Rantai kompromi dari titik masuk eksternal menjadi LEBIH PENDEK dibanding baseline." : ""} Invariant ${inv.id} dilanggar: ${inv.description}`;
        recommendation =
          owningChange?.remediation?.note ??
          "Persempit aturan ke sumber, tujuan, dan layanan yang memang diperlukan, lalu jalankan ulang validasi.";
      } else if (findingType === "SERVICE_IMPACT") {
        title = `Kontrol keamanan terputus: ${inv.name}`;
        description = `Perubahan memutus ${violations.length} aluran wajib menuju ${dstAsset.name} (layanan ${violations[0].serviceName}, ${violations[0].port}/${violations[0].proto}). Aluran ini bukan sekadar konektivitas — melainkan kontrol/layanan yang sudah berjalan (contoh: pengiriman log). Invariant ${inv.id} dilanggar: ${inv.description}`;
        recommendation =
          owningChange?.remediation?.note ??
          "Ganti aturan deny yang terlalu luas dengan deny spesifik terhadap sumber/layanan yang benar-benar berisiko, lalu validasi ulang.";
      } else {
        title = `Akses tidak sah ke layanan ${violations[0].serviceName} di ${dstAsset.name}`;
        description = `Sumber yang tidak diizinkan kini dapat mengakses ${violations[0].serviceName} (${violations[0].port}/${violations[0].proto}) di ${dstAsset.name}. Invariant ${inv.id} dilanggar: ${inv.description}`;
        recommendation =
          owningChange?.remediation?.note ??
          "Batasi sumber aturan akses agar hanya aset yang memang diizinkan, lalu validasi ulang.";
      }

      findings.push({
        id: `F-${String(counter++).padStart(3, "0")}`,
        status: "FAIL",
        severity,
        findingType,
        title,
        description,
        policyId: inv.id,
        affectedAsset: dstId,
        causedByChangeId,
        causedByRuleId,
        evidence: {
          baselineReachable,
          proposedReachable: inv.type === "required_path" ? false : true,
          impactedFlows,
          baselineChain: chainsBaseline[dstId] ?? null,
          proposedChain: chainsProposed[dstId] ?? null,
          path: chainsProposed[dstId]?.hops ?? undefined,
        },
        recommendation,
        remediationId,
      });
    }
  }

  return findings;
}

/** Selesaikan level kepercayaan semua zona/aset yang dirujuk pemilih. */
function selectorTrustLevels(
  sel: { zones?: string[]; assets?: string[]; any?: boolean },
  zoneById: Map<string, { trustLevel: number }>,
  assetById: Map<string, { zone: string }>
): number[] {
  const levels: number[] = [];
  if (sel.zones) {
    for (const z of sel.zones) {
      const zone = zoneById.get(z);
      if (zone) levels.push(zone.trustLevel);
    }
  }
  if (sel.assets) {
    for (const a of sel.assets) {
      const asset = assetById.get(a);
      const zone = asset ? zoneById.get(asset.zone) : undefined;
      if (zone) levels.push(zone.trustLevel);
    }
  }
  return levels;
}

// ---------- Temuan heuristik: aturan terlalu luas ----------
function buildBroadRuleFindings(
  scenario: Scenario,
  effective: EffectiveRules,
  changeStates: ChangeStates,
  closedFlows: FlowInfo[]
): Finding[] {
  const findings: Finding[] = [];
  const zoneById = new Map(scenario.zones.map((z) => [z.id, z]));
  const assetById = new Map(scenario.assets.map((a) => [a.id, a]));
  let counter = 100;

  for (const change of scenario.changeRequest.changes) {
    const state = changeStates[change.id];
    if (!state?.applied || state.remediated) continue;
    const rule =
      change.op === "add_rule" || change.op === "modify_rule"
        ? change.newRule
        : undefined;
    if (!rule || !rule.service.any) continue;

    // Heuristik: aturan dengan layanan ANY pada level zona
    const srcZones = rule.source.zones ?? [];
    const dstZones = rule.destination.zones ?? [];
    const zoneLevel = srcZones.length > 0 || dstZones.length > 0;
    if (!zoneLevel) continue;

    if (rule.action === "allow") {
      // Aturan baseline yang tershadow: keputusan alurannya berpindah ke usulan
      const shadowedBaselineRules = new Set(
        shadowCandidates(scenario, effective, rule)
      );
      // lintas batas kepercayaan menuju zona lebih tepercaya?
      const srcLevels = selectorTrustLevels(rule.source, zoneById, assetById);
      const dstLevels = selectorTrustLevels(rule.destination, zoneById, assetById);
      if (srcLevels.length === 0 || dstLevels.length === 0) continue;
      const maxSrcTrust = Math.max(...srcLevels);
      const minDstTrust = Math.min(...dstLevels);
      if (minDstTrust <= maxSrcTrust) continue; // hanya lintas ke zona lebih tepercaya

      findings.push({
        id: `F-${String(counter++).padStart(3, "0")}`,
        status: "WARN",
        severity: "medium",
        findingType: "OVERLY_BROAD_RULE",
        title: `Aturan ${rule.id} terlalu luas (layanan ANY lintas zona)`,
        description: `Aturan allow dari zona ${srcZones.join(", ") || "tertentu"} menuju zona ${dstZones.join(", ") || "tertentu"} mengizinkan SEMUA layanan. Prinsip least privilege (NIST SP 800-128 / SP 800-207) mensyaratkan izin selektif.${shadowedBaselineRules.size > 0 ? ` Aturan ini juga meng-shadow ${shadowedBaselineRules.size} aturan baseline: ${[...shadowedBaselineRules].join(", ")}.` : ""}`,
        causedByChangeId: change.id,
        causedByRuleId: rule.id,
        evidence: {
          detail: `Justifikasi teknisi: "${change.justification}" — kebutuhan riil hanya layanan spesifik, bukan seluruh layanan.`,
        },
        recommendation:
          change.remediation?.note ??
          "Persempit layanan pada aturan ke port yang benar-benar dibutuhkan tiket terkait.",
        remediationId: change.remediation?.id,
      });
    } else {
      // deny luas: risiko memutus layanan wajib
      findings.push({
        id: `F-${String(counter++).padStart(3, "0")}`,
        status: "WARN",
        severity: "medium",
        findingType: "OVERLY_BROAD_RULE",
        title: `Aturan deny ${rule.id} menutup seluruh layanan lintas zona`,
        description: `Aturan deny dari zona ${srcZones.join(", ")} menuju zona ${dstZones.join(", ")} memblokir SEMUA layanan, termasuk aluran yang belum terdaftar sebagai wajib. Perubahan ini menutup ${closedFlows.length} aluran yang sebelumnya diizinkan.`,
        causedByChangeId: change.id,
        causedByRuleId: rule.id,
        evidence: {
          impactedFlows: closedFlows,
          detail: `Justifikasi teknisi: "${change.justification}" — target riil hanya sumber spesifik yang ditandai audit.`,
        },
        recommendation:
          change.remediation?.note ??
          "Ganti deny luas dengan deny spesifik sumber/layanan yang ditandai audit, lalu validasi ulang.",
        remediationId: change.remediation?.id,
      });
    }
  }

  return findings;
}

/** Deteksi aturan baseline yang tershadow oleh aturan usulan (matched rule berpindah). */
function shadowCandidates(
  scenario: Scenario,
  effective: EffectiveRules,
  proposedAllowRule: AclRule
): string[] {
  const shadowed: string[] = [];
  const baselineOnly = scenario.baselineRules;
  const baselineMap = computeReachability(scenario, baselineOnly);
  const proposedMap = computeReachability(scenario, effective.rules);

  for (const [key, flow] of baselineMap.flows) {
    const after = proposedMap.flows.get(key);
    if (after && after.matchedRuleId === proposedAllowRule.id) {
      if (flow.matchedRuleId && !effective.proposedRuleIds.has(flow.matchedRuleId)) {
        shadowed.push(flow.matchedRuleId);
      }
    }
  }
  return [...new Set(shadowed)];
}

// ---------- Temuan celah model (INCONCLUSIVE) ----------
function buildModelGapFindings(
  effective: EffectiveRules,
  scenario: Scenario
): Finding[] {
  const findings: Finding[] = [];
  let counter = 200;
  for (const gap of effective.unknownRefs) {
    const change = scenario.changeRequest.changes.find(
      (c) => c.id === gap.changeId
    );
    findings.push({
      id: `F-${String(counter++).padStart(3, "0")}`,
      status: "INCONCLUSIVE",
      severity: "medium",
      findingType: "MODEL_GAP",
      title: `Referensi tidak dikenal dalam model: ${gap.refs.join(", ")}`,
      description: `Perubahan ${change?.id ?? gap.changeId} mengacu pada aset yang tidak ada dalam model topologi. PRAUJI tidak dapat menyimpulkan dampaknya — ketiadaan temuan BUKAN berarti aman.`,
      causedByChangeId: gap.changeId,
      evidence: {
        detail:
          "Model tidak merepresentasikan aset yang dirujuk. Lengkapi model topologi atau hapus referensi, lalu validasi ulang.",
      },
      recommendation:
        "Lengkapi model dengan aset yang dimaksud, atau hapus aturan yang mengacunya. Jangan menganggap konfigurasi aman hanya karena model tidak menemukan masalah.",
    });
  }
  return findings;
}

// ---------- Verdict & laporan ----------
function buildSummarySentence(
  verdict: Verdict,
  failedInvariants: number,
  totalInvariants: number,
  newFlows: FlowInfo[],
  closedFlows: FlowInfo[]
): string {
  if (verdict === "FAIL") {
    return `Usulan perubahan MELANGGAR ${failedInvariants} dari ${totalInvariants} invariant keamanan. Ditemukan ${newFlows.length} aluran akses baru dan ${closedFlows.length} aluran terputus. Perubahan belum aman untuk diterapkan.`;
  }
  if (verdict === "INCONCLUSIVE") {
    return `Tidak ada invariant yang dilanggar, TETAPI model tidak lengkap (terdapat referensi aset yang tidak dikenal). PRAUJI tidak dapat menyatakan aman — lengkapi model lalu validasi ulang.`;
  }
  return `Seluruh ${totalInvariants} invariant keamanan terpenuhi. ${newFlows.length} aluran baru dibuka dan ${closedFlows.length} aluran ditutup — semuanya sesuai rencana dan tidak membuka jalur tak terduga. Perubahan aman diterapkan sesuai batas model.`;
}

/**
 * Fungsi utama: validasi usulan perubahan terhadap baseline.
 * Murni & deterministik — input sama selalu menghasilkan laporan sama.
 */
export function validateChange(
  scenario: Scenario,
  changeStates: ChangeStates,
  options: ValidateOptions
): ValidationReport {
  const effective = buildEffectiveRules(scenario, changeStates);

  const baselineMap = computeReachability(scenario, scenario.baselineRules);
  const proposedMap = computeReachability(scenario, effective.rules);

  const { newFlows, closedFlows } = diffFlows(baselineMap, proposedMap);

  // Rantai kompromi untuk aset penting (baseline vs usulan)
  const keyAssets = scenario.assets
    .filter((a) => a.criticality === "critical" || a.criticality === "high")
    .map((a) => a.id);
  const chainsBaseline = computeAttackChains(scenario, baselineMap, keyAssets);
  const chainsProposed = computeAttackChains(scenario, proposedMap, keyAssets);

  // Invariant (semua, termasuk yang PASS — sebagai checklist bukti)
  const invariantResults = evaluateInvariants(
    scenario,
    proposedMap,
    scenario.invariants
  );

  const findings: Finding[] = [
    ...buildInvariantFindings(
      scenario,
      baselineMap,
      proposedMap,
      effective,
      chainsBaseline,
      chainsProposed
    ),
    ...buildBroadRuleFindings(scenario, effective, changeStates, closedFlows),
    ...buildModelGapFindings(effective, scenario),
  ];

  // Urutkan berdasarkan keparahan
  const sevRank: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  findings.sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);

  const failedInvariants = invariantResults.filter((r) => r.status === "FAIL");
  const hasFail = findings.some((f) => f.status === "FAIL");
  const hasGap = findings.some((f) => f.status === "INCONCLUSIVE");

  const verdict: Verdict = hasFail ? "FAIL" : hasGap ? "INCONCLUSIVE" : "PASS";

  const unreachable = (assetId: string): AttackChain => ({
    target: assetId,
    hops: null,
    totalStages: Infinity,
  });

  const attackPaths = keyAssets.map((assetId) => ({
    assetId,
    assetName: scenario.assets.find((a) => a.id === assetId)?.name ?? assetId,
    baseline: chainsBaseline[assetId] ?? unreachable(assetId),
    proposed: chainsProposed[assetId] ?? unreachable(assetId),
    changed:
      chainSignature(chainsBaseline[assetId] ?? unreachable(assetId)) !==
      chainSignature(chainsProposed[assetId] ?? unreachable(assetId)),
  }));

  return {
    runId: options.runId,
    requestId: scenario.changeRequest.id,
    timestamp: new Date().toISOString(),
    label: options.label,
    verdict,
    summary: {
      sentence: buildSummarySentence(
        verdict,
        failedInvariants.length,
        scenario.invariants.length,
        newFlows,
        closedFlows
      ),
      totalFindings: findings.length,
      criticalCount: findings.filter((f) => f.severity === "critical" && f.status === "FAIL").length,
      highCount: findings.filter((f) => f.severity === "high" && f.status === "FAIL").length,
      warnCount: findings.filter((f) => f.status === "WARN").length,
      inconclusiveCount: findings.filter((f) => f.status === "INCONCLUSIVE").length,
      invariantsPassed: invariantResults.filter((r) => r.status === "PASS").length,
      invariantsFailed: failedInvariants.length,
      newFlowsCount: newFlows.length,
      closedFlowsCount: closedFlows.length,
    },
    diff: { newFlows, closedFlows },
    invariants: invariantResults,
    findings,
    attackPaths,
    assumptions: [
      "Model topologi bersifat sintetis untuk demonstrasi; koneksi merepresentasikan kemungkinan routing, ACL menentukan izin.",
      "Setiap akses yang diizinkan kebijakan dianggap tahap kompromi yang mungkin (asumsi konservatif standar analisis dampak kebijakan).",
      "Rantai kompromi dihitung dari titik masuk zona paling tidak tepercaya menuju aset kritis.",
      "PRAUJI hanya menilai apa yang direpresentasikan model; di luar model = di luar jangkauan validasi.",
      "Verdict INCONCLUSIVE diberikan bila referensi tidak dikenal — ketiadaan temuan tidak dianggap bukti keamanan.",
    ],
  };
}

/** Helper: status change-set default dari definisi skenario. */
export function defaultChangeStates(scenario: Scenario): ChangeStates {
  const states: ChangeStates = {};
  for (const c of scenario.changeRequest.changes) {
    states[c.id] = { applied: c.enabledByDefault, remediated: false };
  }
  return states;
}
