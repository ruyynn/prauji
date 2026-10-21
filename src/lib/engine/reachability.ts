/**
 * PRAUJI — reachability & rantai kompromi.
 *
 * Dua konsep dipisahkan eksplisit: FLOW (aluran langsung = koneksi fisik
 * ada DAN ACL mengizinkan) vs ATTACK CHAIN (BFS lintas aluran yang
 * diizinkan — pergerakan lateral, satu hop = satu aluran langsung).
 * "Apakah web bisa ping database" bukan pertanyaan keamanan;
 * "berapa tahap kompromi untuk mencapai database" adalah.
 */
import { evaluateFlow } from "./acl";
import type {
  AclRule,
  Asset,
  AttackChain,
  Connection,
  FlowInfo,
  PathHop,
  Scenario,
  ServiceDef,
} from "./types";

export interface ReachabilityMap {
  /** key: `${srcId}|${dstId}|${port}` → FlowInfo */
  flows: Map<string, FlowInfo>;
  /** key: `${srcId}|${dstId}` → FlowInfo[] (semua layanan yang diizinkan) */
  pairFlows: Map<string, FlowInfo[]>;
}

export function flowKey(src: string, dst: string, port: number): string {
  return `${src}|${dst}|${port}`;
}

export function pairKey(src: string, dst: string): string {
  return `${src}|${dst}`;
}

/**
 * Menghitung SEMUA aluran langsung yang diizinkan: kandidat = koneksi
 * fisik (dua arah) × layanan aset tujuan; ACL menentukan izin tiap kandidat.
 */
export function computeReachability(
  scenario: Scenario,
  rules: AclRule[]
): ReachabilityMap {
  const assetById = new Map(scenario.assets.map((a) => [a.id, a]));
  const flows = new Map<string, FlowInfo>();
  const pairFlows = new Map<string, FlowInfo[]>();

  const adjacent = buildAdjacency(scenario.assets, scenario.connections);

  for (const src of scenario.assets) {
    for (const dst of adjacent.get(src.id) ?? []) {
      const dstAsset = assetById.get(dst);
      if (!dstAsset) continue;
      for (const svc of dstAsset.services) {
        const decision = evaluateFlow(rules, src, dstAsset, svc, assetById);
        if (decision.allowed) {
          const info: FlowInfo = {
            src: src.id,
            dst: dst,
            port: svc.port,
            serviceName: svc.name,
            proto: svc.proto,
            matchedRuleId: decision.matchedRuleId,
            matchedRuleAction: decision.matchedRuleAction,
          };
          flows.set(flowKey(src.id, dst, svc.port), info);
          const pk = pairKey(src.id, dst);
          const list = pairFlows.get(pk) ?? [];
          list.push(info);
          pairFlows.set(pk, list);
        }
      }
    }
  }

  return { flows, pairFlows };
}

/** Koneksi bersifat dua arah pada lapisan fisik (routable). */
export function buildAdjacency(
  assets: Asset[],
  connections: Connection[]
): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const a of assets) adj.set(a.id, []);
  for (const c of connections) {
    if (!adj.has(c.from) || !adj.has(c.to)) continue;
    adj.get(c.from)!.push(c.to);
    adj.get(c.to)!.push(c.from);
  }
  return adj;
}

export function isFlowAllowed(
  map: ReachabilityMap,
  src: string,
  dst: string,
  port: number
): FlowInfo | undefined {
  return map.flows.get(flowKey(src, dst, port));
}

/**
 * Rantai kompromi TERPENDEK antar dua aset melalui aluran yang diizinkan.
 * Asumsi konservatif: setiap akses yang diizinkan = tahap kompromi yang
 * mungkin — kebijakan tidak boleh mengandalkan ketiadaan kerentanan host.
 */
export function findAttackChain(
  scenario: Scenario,
  map: ReachabilityMap,
  from: string,
  to: string
): AttackChain {
  if (from === to) {
    return { target: to, hops: [], totalStages: 0 };
  }

  const assetById = new Map(scenario.assets.map((a) => [a.id, a]));
  const visited = new Set<string>([from]);
  const queue: { asset: string; path: PathHop[] }[] = [
    { asset: from, path: [] },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;

    // pairFlows key = "src|dst" — tetangga langsung yang diizinkan
    const outgoing: { dst: string; flows: FlowInfo[] }[] = [];
    for (const [pk, fl] of map.pairFlows) {
      const [s, d] = pk.split("|");
      if (s === current.asset && !visited.has(d)) {
        outgoing.push({ dst: d, flows: fl });
      }
    }

    // Prioritaskan aset lebih kritis agar rantai yang dilaporkan
    // deterministik dan relevan.
    outgoing.sort((a, b) => {
      const ra = assetById.get(a.dst);
      const rb = assetById.get(b.dst);
      return (ra ? critRank(ra.criticality) : 0) - (rb ? critRank(rb.criticality) : 0);
    });

    for (const out of outgoing) {
      const hopFlow = out.flows[0];
      const hop: PathHop = {
        from: current.asset,
        to: out.dst,
        port: hopFlow.port,
        serviceName: hopFlow.serviceName,
        ruleId: hopFlow.matchedRuleId,
      };
      const nextPath = [...current.path, hop];
      if (out.dst === to) {
        return { target: to, hops: nextPath, totalStages: nextPath.length };
      }
      visited.add(out.dst);
      queue.push({ asset: out.dst, path: nextPath });
    }
  }

  return { target: to, hops: null, totalStages: Infinity };
}

function critRank(c: string): number {
  switch (c) {
    case "critical":
      return 0;
    case "high":
      return 1;
    case "medium":
      return 2;
    default:
      return 3;
  }
}

/** Titik masuk analisis: aset di zona paling tidak tepercaya. */
export function entryPoints(scenario: Scenario): Asset[] {
  const minTrust = Math.min(...scenario.zones.map((z) => z.trustLevel));
  const minZones = new Set(
    scenario.zones.filter((z) => z.trustLevel === minTrust).map((z) => z.id)
  );
  return scenario.assets.filter((a) => minZones.has(a.zone));
}

/**
 * Rantai kompromi terpendek dari titik masuk untuk daftar aset sasaran
 * (dipakai membandingkan baseline vs usulan).
 */
export function computeAttackChains(
  scenario: Scenario,
  map: ReachabilityMap,
  targets: string[]
): Record<string, AttackChain> {
  const entries = entryPoints(scenario);
  const result: Record<string, AttackChain> = {};
  for (const target of targets) {
    let best: AttackChain | null = null;
    for (const entry of entries) {
      const chain = findAttackChain(scenario, map, entry.id, target);
      if (chain.hops && (!best || chain.totalStages < best.totalStages)) {
        best = chain;
      }
    }
    result[target] =
      best ?? { target, hops: null, totalStages: Infinity };
  }
  return result;
}
