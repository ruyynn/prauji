"use client";

/** PRAUJI — komponen tampilan bersama. */
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  AclRule,
  Asset,
  Criticality,
  FlowInfo,
  PathHop,
  Scenario,
  Severity,
  Verdict,
  ZoneId,
} from "@/lib/engine/types";

export function VerdictBadge({
  verdict,
  size = "md",
}: {
  verdict: Verdict;
  size?: "sm" | "md" | "lg";
}) {
  const map = {
    PASS: { label: "PASS — AMAN DITERAPKAN", cls: "bg-emerald-600/90 text-emerald-50 border-emerald-500" },
    FAIL: { label: "FAIL — TOLAK / PERBAIKI", cls: "bg-red-600/90 text-red-50 border-red-500" },
    INCONCLUSIVE: { label: "INCONCLUSIVE — MODEL BELUM LENGKAP", cls: "bg-amber-500/90 text-amber-950 border-amber-400" },
  }[verdict];
  return (
    <Badge
      className={cn(
        "border font-mono font-semibold tracking-wide",
        map.cls,
        size === "lg" && "px-4 py-1.5 text-sm",
        size === "sm" && "text-[10px]"
      )}
    >
      {map.label}
    </Badge>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const map: Record<Severity, { label: string; cls: string }> = {
    critical: { label: "KRITIS", cls: "bg-red-950/70 text-red-300 border-red-500/60" },
    high: { label: "TINGGI", cls: "bg-orange-950/70 text-orange-300 border-orange-500/60" },
    medium: { label: "SEDANG", cls: "bg-amber-950/70 text-amber-300 border-amber-500/60" },
    low: { label: "RENDAH", cls: "bg-zinc-800 text-zinc-300 border-zinc-600" },
  };
  return (
    <Badge variant="outline" className={cn("font-mono text-[10px] tracking-wider", map[severity].cls)}>
      {map[severity].label}
    </Badge>
  );
}

export function ZoneChip({ zone, scenario }: { zone: ZoneId; scenario: Scenario }) {
  const z = scenario.zones.find((x) => x.id === zone);
  return (
    <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">
      ZONA {z?.name.toUpperCase() ?? zone} · TRUST {z?.trustLevel ?? "?"}
    </Badge>
  );
}

export function criticalityColor(c: Criticality): string {
  switch (c) {
    case "critical":
      return "text-red-400";
    case "high":
      return "text-orange-300";
    case "medium":
      return "text-emerald-300";
    default:
      return "text-zinc-400";
  }
}

export function CriticalityBadge({ criticality }: { criticality: Criticality }) {
  const map: Record<Criticality, string> = {
    critical: "KRITIS",
    high: "TINGGI",
    medium: "SEDANG",
    low: "RENDAH",
  };
  return (
    <Badge
      variant="outline"
      className={cn("font-mono text-[10px]", criticalityColor(criticality))}
    >
      {map[criticality]}
    </Badge>
  );
}

export function assetName(scenario: Scenario, id: string): string {
  return scenario.assets.find((a) => a.id === id)?.name ?? id;
}

export function ruleSummary(scenario: Scenario, rule: AclRule): string {
  const src = selectorLabel(scenario, rule.source, "sumber");
  const dst = selectorLabel(scenario, rule.destination, "tujuan");
  const svc = rule.service.any
    ? "SEMUA layanan"
    : rule.service.mgmtOnly
      ? "layanan manajemen"
      : `port ${rule.service.port}`;
  return `${src} → ${dst} : ${svc}`;
}

export function selectorLabel(
  scenario: Scenario,
  sel: AclRule["source"],
  role: "sumber" | "tujuan"
): string {
  if (sel.any) return `SEMUA ${role}`;
  const parts: string[] = [];
  if (sel.assets) {
    for (const a of sel.assets) {
      parts.push(assetName(scenario, a));
    }
  }
  if (sel.zones) {
    for (const z of sel.zones) {
      parts.push(`zona ${scenario.zones.find((x) => x.id === z)?.name ?? z}`);
    }
  }
  return parts.length > 0 ? parts.join(" / ") : "—";
}

export function FlowRow({
  flow,
  scenario,
  tone = "neutral",
}: {
  flow: FlowInfo;
  scenario: Scenario;
  tone?: "new" | "closed" | "neutral";
}) {
  const toneCls =
    tone === "new"
      ? "border-red-500/40 bg-red-950/30"
      : tone === "closed"
        ? "border-amber-500/40 bg-amber-950/20"
        : "border-border bg-muted/40";
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border px-3 py-2 font-mono text-xs",
        toneCls
      )}
    >
      <span className="text-foreground">{assetName(scenario, flow.src)}</span>
      <span className="text-muted-foreground">→</span>
      <span className="text-foreground">{assetName(scenario, flow.dst)}</span>
      <span className="text-muted-foreground">:</span>
      <span className="text-primary">{flow.serviceName} {flow.port}/{flow.proto}</span>
      <span className="ml-auto text-[10px] text-muted-foreground">
        via {flow.matchedRuleId ?? "default-deny"}
      </span>
    </div>
  );
}

export function ChainDisplay({
  hops,
  scenario,
  tone = "danger",
}: {
  hops: PathHop[] | null;
  scenario: Scenario;
  tone?: "danger" | "safe";
}) {
  if (!hops) {
    return (
      <div className="rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-xs text-muted-foreground">
        tidak dapat dijangkau — tidak ada rantai kompromi
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-xs">
      <span className={cn("font-semibold", tone === "danger" ? "text-red-400" : "text-emerald-400")}>
        {assetName(scenario, hops[0]?.from ?? "")}
      </span>
      {hops.map((h, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <span className="text-muted-foreground">→</span>
          <span className="text-foreground">{assetName(scenario, h.to)}</span>
          <span className="text-[10px] text-primary">[{h.serviceName} {h.port}]</span>
        </span>
      ))}
      <span className="ml-auto text-[10px] text-muted-foreground">
        {hops.length} tahap kompromi
      </span>
    </div>
  );
}

/** Ikon aset: SVG murni (grup <g> berisi path, tanpa <svg> bersarang; koordinat 24×24). */
export function AssetGlyph({
  type,
  className,
}: {
  type: Asset["type"];
  className?: string;
}) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (type) {
    case "database":
      return (
        <g className={className}>
          <ellipse cx="12" cy="5.5" rx="7" ry="2.8" {...common} />
          <path d="M5 5.5v6c0 1.55 3.13 2.8 7 2.8s7-1.25 7-2.8v-6" {...common} />
          <path d="M5 11.5v6c0 1.55 3.13 2.8 7 2.8s7-1.25 7-2.8v-6" {...common} />
        </g>
      );
    case "bastion":
      return (
        <g className={className}>
          <path d="M12 3l7 3v5c0 4.4-2.9 8.4-7 10-4.1-1.6-7-5.6-7-10V6z" {...common} />
          <path d="M9 12l2 2 4-4" {...common} />
        </g>
      );
    case "security-appliance":
      return (
        <g className={className}>
          <path d="M12 3l7 3v5c0 4.4-2.9 8.4-7 10-4.1-1.6-7-5.6-7-10V6z" {...common} />
          <circle cx="12" cy="11.5" r="2.2" {...common} />
          <path d="M12 13.7v3" {...common} />
        </g>
      );
    case "adversary":
      return (
        <g className={className}>
          <circle cx="12" cy="12" r="8" {...common} />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4" {...common} />
          <circle cx="12" cy="12" r="2.4" {...common} />
        </g>
      );
    case "workstation":
      return (
        <g className={className}>
          <rect x="3" y="4.5" width="18" height="11" rx="1.5" {...common} />
          <path d="M9 19.5h6M12 15.5v4" {...common} />
        </g>
      );
    default:
      return (
        <g className={className}>
          <rect x="3.5" y="4" width="17" height="6" rx="1.2" {...common} />
          <rect x="3.5" y="13" width="17" height="6" rx="1.2" {...common} />
          <path d="M7 7h.01M7 16h.01" {...common} />
        </g>
      );
  }
}
