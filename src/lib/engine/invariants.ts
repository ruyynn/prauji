/**
 * PRAUJI — evaluasi security invariants.
 *
 * Invariant = aturan yang HARUS selalu benar apa pun perubahannya.
 * Status FAIL = usulan ditolak, terlepas dari apakah perubahan
 * berhasil menyelesaikan masalah lama.
 */
import { selectorMatches, serviceMatches } from "./acl";
import type {
  Asset,
  FlowInfo,
  Invariant,
  InvariantResult,
  Scenario,
  ServiceDef,
  ServiceSelector,
  Selector,
} from "./types";

interface ReachabilityMapLike {
  flows: Map<string, FlowInfo>;
  pairFlows: Map<string, FlowInfo[]>;
}

/** Pasangan (src, dst, layanan) yang cocok dengan pemilih invariant. */
function matchingPairs(
  scenario: Scenario,
  sourceSel: Selector,
  destSel: Selector,
  serviceSel?: ServiceSelector
): { src: Asset; dst: Asset; svc: ServiceDef }[] {
  const assetById = new Map(scenario.assets.map((a) => [a.id, a]));
  const pairs: { src: Asset; dst: Asset; svc: ServiceDef }[] = [];
  for (const src of scenario.assets) {
    if (!selectorMatches(sourceSel, src, assetById)) continue;
    for (const dst of scenario.assets) {
      if (!selectorMatches(destSel, dst, assetById)) continue;
      for (const svc of dst.services) {
        if (serviceSel && !serviceMatches(serviceSel, svc)) continue;
        pairs.push({ src, dst, svc });
      }
    }
  }
  return pairs;
}

function allowedBy(
  map: ReachabilityMapLike,
  src: string,
  dst: string,
  port: number
): FlowInfo | undefined {
  return map.flows.get(`${src}|${dst}|${port}`);
}

/**
 * Evaluasi seluruh invariant terhadap peta reachability suatu state.
 * Setiap pelanggaran disertai bukti aluran aktual.
 */
export function evaluateInvariants(
  scenario: Scenario,
  map: ReachabilityMapLike,
  invariants: Invariant[]
): InvariantResult[] {
  const assetById = new Map(scenario.assets.map((a) => [a.id, a]));
  const results: InvariantResult[] = [];

  for (const inv of invariants) {
    const violations: InvariantResult["violations"] = [];

    if (inv.type === "forbidden_path") {
      const pairs = matchingPairs(scenario, inv.source, inv.destination, inv.service);
      for (const p of pairs) {
        const flow = allowedBy(map, p.src.id, p.dst.id, p.svc.port);
        if (flow) {
          violations.push({
            src: p.src.id,
            dst: p.dst.id,
            port: p.svc.port,
            proto: p.svc.proto,
            serviceName: p.svc.name,
            detail: `Aluran dari ${p.src.name} ke ${p.dst.name} pada layanan ${p.svc.name} diizinkan oleh aturan ${flow.matchedRuleId ?? "default-deny"}.`,
          });
        }
      }
    } else if (inv.type === "required_path") {
      const pairs = matchingPairs(scenario, inv.source, inv.destination, inv.service);
      for (const p of pairs) {
        const flow = allowedBy(map, p.src.id, p.dst.id, p.svc.port);
        if (!flow) {
          violations.push({
            src: p.src.id,
            dst: p.dst.id,
            port: p.svc.port,
            proto: p.svc.proto,
            serviceName: p.svc.name,
            detail: `Aluran wajib dari ${p.src.name} ke ${p.dst.name} pada layanan ${p.svc.name} TIDAK dapat dijangkau pada state ini.`,
          });
        }
      }
    } else if (inv.type === "restricted_access") {
      const pairs = matchingPairs(scenario, inv.source, inv.destination, inv.service);
      for (const p of pairs) {
        const flow = allowedBy(map, p.src.id, p.dst.id, p.svc.port);
        if (!flow) continue;
        const permitted = inv.allowedSources
          ? selectorMatches(inv.allowedSources, p.src, assetById)
          : false;
        if (!permitted) {
          violations.push({
            src: p.src.id,
            dst: p.dst.id,
            port: p.svc.port,
            proto: p.svc.proto,
            serviceName: p.svc.name,
            detail: `${p.src.name} dapat mengakses ${p.svc.name} di ${p.dst.name} (aturan ${flow.matchedRuleId ?? "?"}), padahal sumber ini tidak termasuk yang diizinkan.`,
          });
        }
      }
    }

    results.push({
      invariantId: inv.id,
      name: inv.name,
      severity: inv.severity,
      status: violations.length > 0 ? "FAIL" : "PASS",
      explanation:
        violations.length > 0
          ? `Dilanggar: ${violations.length} aluran tidak sesuai kebijakan.`
          : "Seluruh pasangan akses yang diuji sesuai kebijakan.",
      violations,
    });
  }

  return results;
}
