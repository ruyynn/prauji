"use client";

/**
 * PRAUJI — peta topologi interaktif. Overlay aluran dihitung engine
 * yang sama dengan server, sehingga peta langsung bereaksi saat
 * change-set di-toggle — tanpa menunggu validasi.
 */
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { usePrauji, type TopoMode } from "@/lib/store";
import { buildEffectiveRules } from "@/lib/engine/acl";
import { computeReachability, type ReachabilityMap } from "@/lib/engine/reachability";
import type { Asset, FlowInfo, PathHop, Scenario } from "@/lib/engine/types";
import { AssetGlyph, CriticalityBadge, assetName, FlowRow, ZoneChip } from "./bits";

/** Posisi node per aset (koordinat viewBox 1320×760). */
const LAYOUT: Record<string, { x: number; y: number }> = {
  "ext-hostile": { x: 130, y: 375 },
  "dmz-web01": { x: 360, y: 375 },
  "int-app01": { x: 590, y: 190 },
  "int-db01": { x: 590, y: 350 },
  "int-kiosk01": { x: 700, y: 560 },
  "adm-ws01": { x: 955, y: 140 },
  "adm-bastion": { x: 955, y: 300 },
  "adm-server01": { x: 955, y: 470 },
  "sec-siem01": { x: 1195, y: 375 },
};

const ZONE_BOXES: Record<string, { x: number; y: number; w: number; h: number; label: string; trust: number }> = {
  eksternal: { x: 40, y: 210, w: 180, h: 330, label: "EKSTERNAL", trust: 0 },
  dmz: { x: 260, y: 210, w: 200, h: 330, label: "DMZ", trust: 1 },
  internal: { x: 500, y: 70, w: 310, h: 620, label: "INTERNAL", trust: 2 },
  admin: { x: 850, y: 70, w: 210, h: 560, label: "ADMIN", trust: 3 },
  keamanan: { x: 1110, y: 210, w: 170, h: 330, label: "KEAMANAN", trust: 3 },
};

const NODE_R = 30;

function pos(assetId: string) {
  return LAYOUT[assetId] ?? { x: 0, y: 0 };
}

/** Titik potong garis terhadap tepi lingkaran node. */
function trimPoint(
  from: { x: number; y: number },
  to: { x: number; y: number },
  r: number
) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: from.x + (dx / len) * r, y: from.y + (dy / len) * r };
}

function criticalityStroke(c: Asset["criticality"]): string {
  switch (c) {
    case "critical":
      return "#f87171";
    case "high":
      return "#fdba74";
    case "medium":
      return "#6ee7b7";
    default:
      return "#a1a1aa";
  }
}

export function TopologyView() {
  const {
    scenario,
    changeStates,
    topoMode,
    setTopoMode,
    selectedAssetId,
    selectAsset,
    report,
    highlightedFindingId,
  } = usePrauji();

  const baselineMap = useMemo<ReachabilityMap | null>(() => {
    if (!scenario) return null;
    return computeReachability(scenario, scenario.baselineRules);
  }, [scenario]);

  const proposedMap = useMemo<ReachabilityMap | null>(() => {
    if (!scenario || !changeStates) return null;
    const eff = buildEffectiveRules(scenario, changeStates);
    return computeReachability(scenario, eff.rules);
  }, [scenario, changeStates]);

  const highlightChain: PathHop[] | null = useMemo(() => {
    if (!report || !highlightedFindingId) return null;
    const f = report.findings.find((x) => x.id === highlightedFindingId);
    return f?.evidence.proposedChain?.hops ?? f?.evidence.path ?? null;
  }, [report, highlightedFindingId]);

  if (!scenario) return null;

  const overlayFlows: {
    flow: FlowInfo;
    tone: "new" | "same" | "closed";
  }[] = [];

  if (topoMode === "baseline" && baselineMap) {
    for (const f of baselineMap.flows.values()) overlayFlows.push({ flow: f, tone: "same" });
  } else if (topoMode === "usulan" && proposedMap) {
    for (const f of proposedMap.flows.values()) {
      const isNew = !baselineMap?.flows.has(`${f.src}|${f.dst}|${f.port}`);
      overlayFlows.push({ flow: f, tone: isNew ? "new" : "same" });
    }
  } else if (topoMode === "diff" && proposedMap && baselineMap) {
    for (const f of proposedMap.flows.values()) {
      if (!baselineMap.flows.has(`${f.src}|${f.dst}|${f.port}`)) {
        overlayFlows.push({ flow: f, tone: "new" });
      }
    }
    for (const f of baselineMap.flows.values()) {
      if (!proposedMap.flows.has(`${f.src}|${f.dst}|${f.port}`)) {
        overlayFlows.push({ flow: f, tone: "closed" });
      }
    }
  }

  // kelompokkan per pasangan agar antar-arc paralel tidak bertumpuk
  const flowsByPair = new Map<string, typeof overlayFlows>();
  for (const item of overlayFlows) {
    const key = `${item.flow.src}|${item.flow.dst}`;
    const list = flowsByPair.get(key) ?? [];
    list.push(item);
    flowsByPair.set(key, list);
  }

  const chainSet = new Set<string>();
  if (highlightChain) {
    for (const hop of highlightChain) chainSet.add(`${hop.from}>${hop.to}`);
  }

  const selectedAsset = selectedAssetId
    ? scenario.assets.find((a) => a.id === selectedAssetId) ?? null
    : null;

  const modeButtons: { id: TopoMode; label: string }[] = [
    { id: "fisik", label: "Koneksi Fisik" },
    { id: "baseline", label: "Aluran Baseline" },
    { id: "usulan", label: "Aluran Usulan" },
    { id: "diff", label: "Diff" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {modeButtons.map((m) => (
          <Button
            key={m.id}
            size="sm"
            variant={topoMode === m.id ? "default" : "outline"}
            className={cn("font-mono text-xs", topoMode === m.id && "font-semibold")}
            onClick={() => setTopoMode(m.id)}
          >
            {m.label}
          </Button>
        ))}
        {topoMode === "diff" && (
          <Badge variant="outline" className="border-red-500/60 text-red-300 font-mono text-[10px]">
            merah = terbuka baru
          </Badge>
        )}
        {topoMode === "diff" && (
          <Badge variant="outline" className="border-amber-500/60 text-amber-300 font-mono text-[10px]">
            kuning = tertutup
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_340px]">
        <Card className="overflow-hidden">
          <CardContent className="overflow-x-auto p-0">
            <svg
              viewBox="0 0 1320 760"
              className="min-w-[900px] w-full"
              role="img"
              aria-label="Peta topologi jaringan PRAUJI"
            >
              <defs>
                <marker
                  id="arrow-emerald"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 9 5 L 0 9 z" fill="#34d399" />
                </marker>
                <marker
                  id="arrow-red"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 9 5 L 0 9 z" fill="#f87171" />
                </marker>
              </defs>

              {Object.entries(ZONE_BOXES).map(([zoneId, z]) => {
                const zone = scenario.zones.find((x) => x.id === zoneId);
                return (
                  <g key={zoneId}>
                    <rect
                      x={z.x}
                      y={z.y}
                      width={z.w}
                      height={z.h}
                      rx="14"
                      className="fill-secondary/30 stroke-border"
                      strokeWidth="1.5"
                      strokeDasharray={zoneId === "eksternal" ? "8 5" : undefined}
                    />
                    <text
                      x={z.x + 14}
                      y={z.y + 22}
                      className="fill-muted-foreground font-mono"
                      fontSize="13"
                      letterSpacing="2"
                    >
                      {z.label}
                    </text>
                    <text
                      x={z.x + z.w - 14}
                      y={z.y + 22}
                      textAnchor="end"
                      className="fill-muted-foreground/70 font-mono"
                      fontSize="11"
                    >
                      trust {zone?.trustLevel}
                    </text>
                  </g>
                );
              })}

              {scenario.connections.map((c, i) => {
                const a = pos(c.from);
                const b = pos(c.to);
                return (
                  <line
                    key={`conn-${i}`}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    className="stroke-border"
                    strokeWidth="1.5"
                  />
                );
              })}

              {highlightChain?.map((hop, i) => {
                const a = pos(hop.from);
                const b = pos(hop.to);
                const p1 = trimPoint(a, b, NODE_R + 6);
                const p2 = trimPoint(b, a, NODE_R + 6);
                const mx = (p1.x + p2.x) / 2;
                const my = (p1.y + p2.y) / 2 - 26;
                return (
                  <g key={`chain-${i}`}>
                    <path
                      d={`M ${p1.x} ${p1.y} Q ${mx} ${my} ${p2.x} ${p2.y}`}
                      fill="none"
                      stroke="#f87171"
                      strokeWidth="4"
                      strokeLinecap="round"
                      className="prauji-flow-anim"
                    />
                    <circle cx={mx} cy={my - 4} r="11" fill="#f87171" />
                    <text
                      x={mx}
                      y={my - 0.5}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight="bold"
                      fill="#0c0f0e"
                      className="font-mono"
                    >
                      {i + 1}
                    </text>
                  </g>
                );
              })}

              {[...flowsByPair.entries()].map(([pairKey, list]) => {
                const [srcId, dstId] = pairKey.split("|");
                const a = pos(srcId);
                const b = pos(dstId);
                return list.map((item, idx) => {
                  const offset = 14 + idx * 11;
                  const p1 = trimPoint(a, b, NODE_R + 2);
                  const p2 = trimPoint(b, a, NODE_R + 2);
                  const dx = p2.x - p1.x;
                  const dy = p2.y - p1.y;
                  const len = Math.hypot(dx, dy) || 1;
                  const nx = (-dy / len) * offset;
                  const ny = (dx / len) * offset;
                  const mx = (p1.x + p2.x) / 2 + nx;
                  const my = (p1.y + p2.y) / 2 + ny;
                  const color =
                    item.tone === "new" ? "#f87171" : item.tone === "closed" ? "#fbbf24" : "#34d399";
                  const inChain = chainSet.has(`${srcId}>${dstId}`);
                  if (item.tone === "closed") {
                    return (
                      <line
                        key={`${pairKey}-${idx}`}
                        x1={p1.x + nx}
                        y1={p1.y + ny}
                        x2={p2.x + nx}
                        y2={p2.y + ny}
                        stroke={color}
                        strokeWidth="2"
                        strokeDasharray="4 6"
                        opacity="0.85"
                      />
                    );
                  }
                  return (
                    <g key={`${pairKey}-${idx}`}>
                      <path
                        d={`M ${p1.x + nx} ${p1.y + ny} Q ${mx + nx * 0.2} ${my + ny * 0.2} ${p2.x + nx} ${p2.y + ny}`}
                        fill="none"
                        stroke={color}
                        strokeWidth={item.tone === "new" ? 2.4 : 1.8}
                        markerEnd={`url(#${item.tone === "new" ? "arrow-red" : "arrow-emerald"})`}
                        className={cn(item.tone === "new" && "prauji-flow-anim", inChain && "opacity-90")}
                      />
                      <text
                        x={mx + nx}
                        y={my + ny - 3}
                        textAnchor="middle"
                        fontSize="10"
                        className="fill-muted-foreground font-mono"
                      >
                        {item.flow.port}
                      </text>
                    </g>
                  );
                });
              })}

              {scenario.assets.map((asset) => {
                const p = pos(asset.id);
                const isSel = selectedAssetId === asset.id;
                const stroke = criticalityStroke(asset.criticality);
                const isChainTarget =
                  highlightChain &&
                  highlightChain[highlightChain.length - 1]?.to === asset.id;
                return (
                  <g
                    key={asset.id}
                    transform={`translate(${p.x}, ${p.y})`}
                    className="cursor-pointer"
                    onClick={() => selectAsset(isSel ? null : asset.id)}
                    role="button"
                    aria-label={`Aset ${asset.name}, zona ${asset.zone}`}
                  >
                    {/* area klik transparan — menjamin seluruh area node menangkap pointer */}
                    <circle r={NODE_R + 14} fill="transparent" />
                    {isChainTarget && (
                      <circle r={NODE_R} fill="none" stroke="#f87171" strokeWidth="2">
                        <animate
                          attributeName="r"
                          values="32;46"
                          dur="1.6s"
                          repeatCount="indefinite"
                        />
                        <animate
                          attributeName="opacity"
                          values="0.9;0"
                          dur="1.6s"
                          repeatCount="indefinite"
                        />
                      </circle>
                    )}
                    <circle
                      r={NODE_R}
                      className="fill-card stroke-card-foreground/20"
                      strokeWidth="1"
                    />
                    <circle
                      r={NODE_R - 4}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={isSel ? 3 : 1.8}
                      opacity={isSel ? 1 : 0.9}
                    />
                    <g transform="translate(-12, -12)">
                      <AssetGlyph
                        type={asset.type}
                        className="text-foreground"
                      />
                    </g>
                    <text
                      y={NODE_R + 18}
                      textAnchor="middle"
                      fontSize="12.5"
                      className="fill-foreground font-medium"
                    >
                      {asset.name}
                    </text>
                    <text
                      y={NODE_R + 31}
                      textAnchor="middle"
                      fontSize="10"
                      className="fill-muted-foreground font-mono"
                    >
                      {asset.ip}
                    </text>
                  </g>
                );
              })}
            </svg>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-mono tracking-wide text-muted-foreground">
                INSPEKTOR ASET
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedAsset ? (
                <p className="text-sm text-muted-foreground">
                  Klik salah satu node pada peta untuk melihat detail aset, aluran
                  yang diizinkan padanya, dan invariant keamanan yang melibatkannya.
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold">{selectedAsset.name}</span>
                    <CriticalityBadge criticality={selectedAsset.criticality} />
                  </div>
                  <ZoneChip zone={selectedAsset.zone} scenario={scenario} />
                  <p className="text-sm text-muted-foreground">{selectedAsset.description}</p>
                  <Separator />
                  <div>
                    <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                      Layanan diekspos
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedAsset.services.length === 0 ? (
                        <span className="font-mono text-xs text-muted-foreground">—</span>
                      ) : (
                        selectedAsset.services.map((s) => (
                          <Badge
                            key={s.port}
                            variant="outline"
                            className="font-mono text-[10px]"
                          >
                            {s.name} {s.port}/{s.proto}
                            {s.mgmtOnly ? " · MGMT" : ""}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>
                  <Separator />
                  <div>
                    <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                      Aluran masuk diizinkan (usulan saat ini)
                    </p>
                    <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
                      {inFlows(selectedAsset.id, proposedMap).length === 0 ? (
                        <span className="font-mono text-xs text-muted-foreground">tidak ada</span>
                      ) : (
                        inFlows(selectedAsset.id, proposedMap).map((f) => (
                          <FlowRow key={`${f.src}-${f.port}`} flow={f} scenario={scenario} />
                        ))
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                      Aluran keluar diizinkan (usulan saat ini)
                    </p>
                    <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
                      {outFlows(selectedAsset.id, proposedMap).length === 0 ? (
                        <span className="font-mono text-xs text-muted-foreground">tidak ada</span>
                      ) : (
                        outFlows(selectedAsset.id, proposedMap).map((f) => (
                          <FlowRow key={`${f.dst}-${f.port}`} flow={f} scenario={scenario} />
                        ))
                      )}
                    </div>
                  </div>
                  <Separator />
                  <div>
                    <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                      Invariant terkait
                    </p>
                    <div className="space-y-1.5">
                      {relatedInvariants(scenario, selectedAsset.id).map((inv) => (
                        <div
                          key={inv.id}
                          className="rounded-md border border-border bg-muted/30 px-3 py-1.5 font-mono text-xs"
                        >
                          <span className="text-primary">{inv.id}</span>{" "}
                          <span className="text-foreground">{inv.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Catatan model
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Koneksi garis abu = <em>kemungkinan routing</em>, bukan izin. Izin
                ditentukan ACL — itulah sebabnya dua node yang tampak tersambung
                bisa saja tidak saling mengizinkan aluran. Overlay aluran dihitung
                oleh engine yang sama persis dengan yang dipakai server.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function inFlows(assetId: string, map: ReachabilityMap | null): FlowInfo[] {
  if (!map) return [];
  const out: FlowInfo[] = [];
  for (const [key, f] of map.flows) {
    if (key.split("|")[1] === assetId) out.push(f);
  }
  return out.sort((a, b) => a.src.localeCompare(b.src) || a.port - b.port);
}

function outFlows(assetId: string, map: ReachabilityMap | null): FlowInfo[] {
  if (!map) return [];
  const out: FlowInfo[] = [];
  for (const [key, f] of map.flows) {
    if (key.split("|")[0] === assetId) out.push(f);
  }
  return out.sort((a, b) => a.dst.localeCompare(b.dst) || a.port - b.port);
}

function relatedInvariants(scenario: Scenario, assetId: string) {
  return scenario.invariants.filter(
    (inv) =>
      inv.destination.assets?.includes(assetId) ||
      inv.source.assets?.includes(assetId) ||
      inv.allowedSources?.assets?.includes(assetId)
  );
}
