"use client";

/**
 * PRAUJI — laporan validasi: verdict, temuan berbasis bukti, attack
 * surface diff, rantai kompromi, checklist invariant, riwayat.
 */
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  Radar,
  Download,
  Wand2,
  Map as MapIcon,
  ShieldX,
  ShieldCheck,
  History,
  RefreshCw,
} from "lucide-react";
import { usePrauji, isReportStale } from "@/lib/store";
import type { Finding, Scenario, ValidationReport } from "@/lib/engine/types";
import {
  ChainDisplay,
  FlowRow,
  SeverityBadge,
  VerdictBadge,
  assetName,
} from "./bits";
import { cn } from "@/lib/utils";

export function ValidationView() {
  const {
    scenario,
    report,
    runs,
    runValidation,
    remediate,
    loadRun,
    setTab,
    setTopoMode,
    highlightFinding,
    validating,
  } = usePrauji();
  const { toast } = useToast();

  if (!scenario) return null;

  if (!report) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
          <Radar className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="text-lg font-semibold">Belum ada hasil validasi</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Jalankan engine untuk melihat dampak keamanan usulan perubahan:
              jalur baru, invariant yang dilanggar, dan rekomendasi perbaikan.
            </p>
          </div>
          <Button
            className="font-mono"
            onClick={() =>
              runValidation().then((r) => {
                if (r)
                  toast({
                    title: `Validasi selesai: ${r.verdict}`,
                    description: r.summary.sentence,
                    variant: r.verdict === "PASS" ? "default" : "destructive",
                  });
              })
            }
            disabled={validating}
          >
            <Radar className="mr-1.5 h-4 w-4" />
            {validating ? "Mengevaluasi…" : "Jalankan Validasi"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const stale = isReportStale(
    usePrauji.getState().changeStates,
    usePrauji.getState().reportSnapshot
  );

  const applyRemediation = (f: Finding) => {
    const changeId =
      f.causedByChangeId ??
      scenario.changeRequest.changes.find((c) => c.remediation?.id === f.remediationId)?.id;
    if (!changeId) {
      toast({
        title: "Remediasi otomatis tidak tersedia",
        description: "Terapkan rekomendasi secara manual, lalu validasi ulang.",
        variant: "destructive",
      });
      return;
    }
    remediate(changeId).then(() => {
      const updated = usePrauji.getState().report;
      toast({
        title: `Remediasi diterapkan — validasi ulang: ${updated?.verdict ?? "…"}`,
        description: updated?.summary.sentence,
        variant: updated?.verdict === "PASS" ? "default" : "destructive",
      });
    });
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prauji-report-${report.runId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <Card
        className={cn(
          report.verdict === "FAIL" && "border-red-500/60",
          report.verdict === "PASS" && "border-emerald-500/60",
          report.verdict === "INCONCLUSIVE" && "border-amber-500/60"
        )}
      >
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {report.verdict === "PASS" ? (
                <ShieldCheck className="h-8 w-8 text-emerald-400" />
              ) : (
                <ShieldX
                  className={cn(
                    "h-8 w-8",
                    report.verdict === "FAIL" ? "text-red-400" : "text-amber-400"
                  )}
                />
              )}
              <div>
                <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  {report.label} · run {report.runId.slice(0, 8)} ·{" "}
                  {new Date(report.timestamp).toLocaleString("id-ID")}
                </p>
                <p className="text-lg font-semibold">
                  Keputusan validator untuk {report.requestId}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {stale && (
                <Badge variant="outline" className="border-amber-500/60 font-mono text-[10px] text-amber-300">
                  LAPORAN BASI — CHANGE-SET BERUBAH
                </Badge>
              )}
              <VerdictBadge verdict={report.verdict} size="lg" />
              <Button size="sm" variant="outline" className="font-mono text-xs" onClick={exportJson}>
                <Download className="mr-1 h-3.5 w-3.5" />
                Unduh JSON
              </Button>
              {stale && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-amber-500/60 font-mono text-xs text-amber-300"
                  onClick={() => runValidation("Validasi ulang perubahan")}
                  disabled={validating}
                >
                  <RefreshCw className="mr-1 h-3.5 w-3.5" />
                  Validasi Ulang
                </Button>
              )}
            </div>
          </div>
          <p
            className={cn(
              "rounded-lg border px-4 py-3 text-sm leading-relaxed",
              report.verdict === "FAIL"
                ? "border-red-500/40 bg-red-950/30 text-red-100"
                : report.verdict === "PASS"
                  ? "border-emerald-500/40 bg-emerald-950/20 text-emerald-100"
                  : "border-amber-500/40 bg-amber-950/20 text-amber-100"
            )}
          >
            {report.summary.sentence}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Metric label="Temuan kritis" value={report.summary.criticalCount} tone="danger" />
            <Metric label="Temuan tinggi" value={report.summary.highCount} tone="warn" />
            <Metric label="Peringatan" value={report.summary.warnCount} />
            <Metric label="Invariant gagal" value={report.summary.invariantsFailed} tone="danger" />
            <Metric label="Aluran baru" value={report.summary.newFlowsCount} tone="danger" />
            <Metric label="Aluran tertutup" value={report.summary.closedFlowsCount} tone="warn" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Temuan Engine ({report.findings.length})
          </CardTitle>
          <CardDescription>
            Setiap temuan dihasilkan evaluasi model — bukan teks statis. Bukti
            berisi aturan penyebab, status baseline vs usulan, dan rantai kompromi.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {report.findings.length === 0 && (
            <p className="rounded-md border border-emerald-500/40 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-200">
              Tidak ada temuan. Seluruh invariant terpenuhi dan tidak ada jalur
              tak terduga yang terbuka pada usulan ini.
            </p>
          )}
          {report.findings.map((f) => (
            <FindingCard
              key={f.id}
              finding={f}
              scenario={scenario}
              onRemediate={() => applyRemediation(f)}
              onShowOnMap={() => {
                highlightFinding(f.id);
                setTopoMode("usulan");
                setTab("topologi");
              }}
              remediationApplied={(() => {
                const cid =
                  f.causedByChangeId ??
                  scenario.changeRequest.changes.find(
                    (c) => c.remediation?.id === f.remediationId
                  )?.id;
                return cid
                  ? usePrauji.getState().changeStates?.[cid]?.remediated ?? false
                  : false;
              })()}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MapIcon className="h-4 w-4 text-primary" />
            Rantai Kompromi: Baseline vs Usulan
          </CardTitle>
          <CardDescription>
            Tahap kompromi dari titik masuk eksternal menuju aset penting.
            Asumsi konservatif: setiap akses yang diizinkan = tahap yang mungkin.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {report.attackPaths
            .filter((p) => p.baseline.hops || p.proposed.hops)
            .sort((a, b) => (b.changed ? 1 : 0) - (a.changed ? 1 : 0))
            .map((p) => (
              <div
                key={p.assetId}
                className={cn(
                  "rounded-lg border p-4",
                  p.changed ? "border-red-500/40 bg-red-950/10" : "border-border bg-muted/10"
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{p.assetName}</span>
                  {p.changed ? (
                    <Badge variant="outline" className="border-red-500/60 font-mono text-[10px] text-red-300">
                      RANTAI BERUBAH
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">
                      TIDAK BERUBAH
                    </Badge>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
                  <div>
                    <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Baseline
                    </p>
                    <ChainDisplay hops={p.baseline.hops} scenario={scenario} tone="safe" />
                  </div>
                  <div>
                    <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Usulan
                    </p>
                    <ChainDisplay
                      hops={p.proposed.hops}
                      scenario={scenario}
                      tone={p.changed ? "danger" : "safe"}
                    />
                  </div>
                </div>
              </div>
            ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Attack Surface Diff</CardTitle>
          <CardDescription>
            Perubahan aluran yang diizinkan: mana yang baru terbuka, mana yang
            tertutup. Di luar daftar ini, tidak ada yang berubah.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 font-mono text-xs text-red-300">
              TERBUKA BARU ({report.diff.newFlows.length})
            </p>
            <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
              {report.diff.newFlows.length === 0 ? (
                <p className="text-xs text-muted-foreground">tidak ada</p>
              ) : (
                report.diff.newFlows.map((f, i) => (
                  <FlowRow key={i} flow={f} scenario={scenario} tone="new" />
                ))
              )}
            </div>
          </div>
          <div>
            <p className="mb-2 font-mono text-xs text-amber-300">
              TERTUTUP ({report.diff.closedFlows.length})
            </p>
            <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
              {report.diff.closedFlows.length === 0 ? (
                <p className="text-xs text-muted-foreground">tidak ada</p>
              ) : (
                report.diff.closedFlows.map((f, i) => (
                  <FlowRow key={i} flow={f} scenario={scenario} tone="closed" />
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Checklist Invariant Keamanan</CardTitle>
          <CardDescription>
            Status seluruh aturan wajib pada state usulan — termasuk yang tetap
            terpenuhi (bukti bahwa engine menguji semuanya, bukan sebagian).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {report.invariants.map((inv) => (
            <div key={inv.invariantId} className="rounded-lg border border-border bg-muted/10 p-3">
              <div className="flex flex-wrap items-center gap-2">
                {inv.status === "PASS" ? (
                  <Badge variant="outline" className="border-emerald-500/60 font-mono text-[10px] text-emerald-300">
                    PASS
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-red-500/60 font-mono text-[10px] text-red-300">
                    FAIL
                  </Badge>
                )}
                <span className="font-mono text-xs text-primary">{inv.invariantId}</span>
                <span className="text-sm font-medium">{inv.name}</span>
                <SeverityBadge severity={inv.severity} />
                <span className="ml-auto text-[11px] text-muted-foreground">{inv.explanation}</span>
              </div>
              {inv.violations.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {inv.violations.map((v, i) => (
                    <p key={i} className="rounded-md border border-red-500/30 bg-red-950/20 px-3 py-1.5 font-mono text-[11px] text-red-200">
                      {assetName(scenario, v.src)} → {assetName(scenario, v.dst)} : {v.serviceName} {v.port}/{v.proto}
                      {" — "}
                      {v.detail}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-primary" />
            Riwayat Validasi
          </CardTitle>
          <CardDescription>
            Setiap eksekusi tersimpan sebagai bukti audit — hasil dapat diulang
            dan dibandingkan (mis. sebelum vs sesudah remediasi).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-64">
            {runs.length === 0 ? (
              <p className="text-xs text-muted-foreground">belum ada riwayat</p>
            ) : (
              <div className="space-y-2">
                {runs.map((run) => (
                  <button
                    key={run.id}
                    onClick={() => loadRun(run.id)}
                    className={cn(
                      "flex w-full flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors",
                      run.id === report.runId
                        ? "border-primary/50 bg-primary/10"
                        : "border-border bg-muted/20 hover:bg-muted/40"
                    )}
                  >
                    <VerdictBadge verdict={run.verdict} size="sm" />
                    <span className="text-xs">{run.label}</span>
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                      {run.criticalCount} kritis / {run.highCount} tinggi / {run.warnCount} warn ·{" "}
                      {new Date(run.createdAt).toLocaleString("id-ID")}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Asumsi & Batas Model</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-inside list-disc space-y-1.5 text-xs leading-relaxed text-muted-foreground">
            {report.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
          <Separator className="my-4" />
          <p className="text-[11px] text-muted-foreground">
            PRAUJI hanya menilai apa yang direpresentasikan model dan kebijakan.
            Kualitas hasil bergantung kelengkapan serta akurasi data — batasan ini
            dinyatakan eksplisit agar hasil validasi tetap jujur dan dapat diulang.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function FindingCard({
  finding,
  scenario,
  onRemediate,
  onShowOnMap,
  remediationApplied,
}: {
  finding: Finding;
  scenario: Scenario;
  onRemediate: () => void;
  onShowOnMap: () => void;
  remediationApplied: boolean;
}) {
  const borderTone =
    finding.status === "FAIL"
      ? "border-red-500/50"
      : finding.status === "INCONCLUSIVE"
        ? "border-amber-500/50"
        : "border-border";

  const typeLabel: Record<Finding["findingType"], string> = {
    NEW_ATTACK_PATH: "JALUR SERANGAN BARU",
    SERVICE_EXPOSURE: "LAYANAN TEREKSPOS",
    SERVICE_IMPACT: "DAMPAK LAYANAN/KONTROL",
    OVERLY_BROAD_RULE: "ATURAN TERLALU LUAS",
    MODEL_GAP: "CELAH MODEL",
  };

  return (
    <div className={cn("rounded-lg border bg-muted/10 p-4", borderTone)}>
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={finding.severity} />
        <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">
          {typeLabel[finding.findingType]}
        </Badge>
        {finding.policyId && (
          <Badge variant="outline" className="border-primary/50 font-mono text-[10px] text-primary">
            {finding.policyId}
          </Badge>
        )}
        {finding.causedByRuleId && (
          <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">
            aturan: {finding.causedByRuleId}
          </Badge>
        )}
      </div>
      <p className="mt-2 text-sm font-semibold">{finding.title}</p>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{finding.description}</p>

      <div className="mt-3 space-y-2">
        {(finding.evidence.baselineReachable !== undefined ||
          finding.evidence.proposedReachable !== undefined) && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px]">
            <span className="text-muted-foreground">
              baseline:{" "}
              <span className={finding.evidence.baselineReachable ? "text-red-300" : "text-emerald-300"}>
                {finding.evidence.baselineReachable ? "DAPAT DIJANGKAU" : "TIDAK DIJANGKAU"}
              </span>
            </span>
            <span className="text-muted-foreground">
              usulan:{" "}
              <span
                className={
                  finding.evidence.proposedReachable ? "text-red-300" : "text-emerald-300"
                }
              >
                {finding.evidence.proposedReachable ? "DAPAT DIJANGKAU" : "TIDAK DIJANGKAU"}
              </span>
            </span>
          </div>
        )}
        {finding.evidence.impactedFlows && finding.evidence.impactedFlows.length > 0 && (
          <div className="space-y-1.5">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Aluran terdampak
            </p>
            {finding.evidence.impactedFlows.map((f, i) => (
              <FlowRow key={i} flow={f} scenario={scenario} tone={finding.evidence.proposedReachable === false ? "closed" : "new"} />
            ))}
          </div>
        )}
        {(finding.evidence.baselineChain || finding.evidence.proposedChain) &&
          finding.findingType !== "MODEL_GAP" && (
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              <div>
                <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Rantai kompromi — baseline
                </p>
                <ChainDisplay
                  hops={finding.evidence.baselineChain?.hops ?? null}
                  scenario={scenario}
                  tone="safe"
                />
              </div>
              <div>
                <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Rantai kompromi — usulan
                </p>
                <ChainDisplay
                  hops={finding.evidence.proposedChain?.hops ?? null}
                  scenario={scenario}
                  tone="danger"
                />
              </div>
            </div>
          )}
        {finding.evidence.detail && (
          <p className="rounded-md border border-border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
            {finding.evidence.detail}
          </p>
        )}
      </div>

      <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
        <p className="text-[10px] font-mono uppercase tracking-wider text-primary">Rekomendasi</p>
        <p className="mt-1 text-sm">{finding.recommendation}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {finding.remediationId && finding.status !== "INCONCLUSIVE" && (
          <Button
            size="sm"
            className="font-mono text-xs"
            variant={remediationApplied ? "outline" : "default"}
            disabled={remediationApplied}
            onClick={onRemediate}
          >
            <Wand2 className="mr-1.5 h-3.5 w-3.5" />
            {remediationApplied ? "REMEDIASI DITERAPKAN" : "Terapkan Remediasi & Validasi Ulang"}
          </Button>
        )}
        {(finding.findingType === "NEW_ATTACK_PATH" ||
          finding.findingType === "SERVICE_EXPOSURE") && (
          <Button size="sm" variant="outline" className="font-mono text-xs" onClick={onShowOnMap}>
            <MapIcon className="mr-1.5 h-3.5 w-3.5" />
            Lihat Jalur di Topologi
          </Button>
        )}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "danger" | "warn";
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5">
      <p className="font-mono text-xl font-bold leading-none">
        <span
          className={cn(
            tone === "danger" && "text-red-400",
            tone === "warn" && "text-amber-400"
          )}
        >
          {value}
        </span>
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
