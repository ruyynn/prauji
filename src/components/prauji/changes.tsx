"use client";

/**
 * PRAUJI — workspace perubahan: aturan baseline, usulan (dengan toggle
 * blame-analysis), invariant keamanan, dan tombol jalankan validasi.
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
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Radar, ShieldCheck, Undo2, Wand2 } from "lucide-react";
import { usePrauji, isReportStale } from "@/lib/store";
import type { AclRule, Invariant } from "@/lib/engine/types";
import { ruleSummary, SeverityBadge } from "./bits";

export function ChangesView() {
  const {
    scenario,
    changeStates,
    report,
    runValidation,
    toggleChange,
    remediate,
    unremediate,
    setTab,
    validating,
  } = usePrauji();
  const { toast } = useToast();

  if (!scenario) return null;
  const cr = scenario.changeRequest;
  const nonaktifDefault = cr.changes.filter((c) => !c.enabledByDefault);
  const stale = isReportStale(changeStates, usePrauji.getState().reportSnapshot);

  return (
    <div className="space-y-6">
      <Card className={stale ? "border-amber-500/50" : undefined}>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
          <div>
            <p className="font-mono text-sm font-semibold">{cr.id}</p>
            <p className="text-xs text-muted-foreground">
              {cr.description}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {stale && report && (
              <Badge variant="outline" className="border-amber-500/60 font-mono text-[10px] text-amber-300">
                CHANGE-SET BERUBAH SEJAK VALIDASI TERAKHIR
              </Badge>
            )}
            <Button
              onClick={() =>
                runValidation().then((r) => {
                  if (r) {
                    toast({
                      title: `Validasi selesai: ${r.verdict}`,
                      description: r.summary.sentence,
                      variant:
                        r.verdict === "PASS" ? "default" : "destructive",
                    });
                    setTab("validasi");
                  }
                })
              }
              disabled={validating}
              className="font-mono"
            >
              <Radar className="mr-1.5 h-4 w-4" />
              {validating ? "Mengevaluasi…" : "Validasi Perubahan"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Aturan Baseline (disetujui)</CardTitle>
            <CardDescription>
              Kondisi awal yang dianggap valid. Aturan dievaluasi berurutan —
              kecocokan pertama menang, tanpa kecocokan = default deny.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">ID</TableHead>
                  <TableHead className="w-16">Aksi</TableHead>
                  <TableHead>Aluran & layanan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scenario.baselineRules.map((rule: AclRule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-mono text-xs">{rule.id}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          rule.action === "allow"
                            ? "border-emerald-500/50 font-mono text-[10px] text-emerald-300"
                            : "border-red-500/50 font-mono text-[10px] text-red-300"
                        }
                      >
                        {rule.action.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <p className="font-mono text-xs">{ruleSummary(scenario, rule)}</p>
                      <p className="text-[11px] text-muted-foreground">{rule.description}</p>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Security Invariants
            </CardTitle>
            <CardDescription>
              Aturan yang WAJIB selalu benar apa pun perubahannya. Setiap usulan
              diuji terhadap seluruh daftar ini.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {scenario.invariants.map((inv: Invariant) => (
              <div key={inv.id} className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-primary">{inv.id}</span>
                  <span className="text-sm font-medium">{inv.name}</span>
                  <SeverityBadge severity={inv.severity} />
                  <Badge variant="outline" className="ml-auto font-mono text-[10px] text-muted-foreground">
                    {inv.type === "forbidden_path"
                      ? "LARANGAN JALUR"
                      : inv.type === "required_path"
                        ? "JALUR WAJIB"
                        : "AKSES TERBATAS"}
                  </Badge>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">{inv.description}</p>
                <p className="mt-1 text-[11px] italic text-muted-foreground/80">{inv.rationale}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Usulan Perubahan — {cr.id}</CardTitle>
          <CardDescription>
            Niat teknisi baik: menyelesaikan dua tiket masalah lama. Toggle tiap
            perubahan untuk melihat bagaimana tiap aturan berkontribusi pada temuan
            (blame-analysis), lalu terapkan remediasi dari laporan validasi.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {cr.changes.map((change) => {
            const state = changeStates?.[change.id];
            const isActive = state?.applied ?? false;
            const isRemediated = state?.remediated ?? false;
            const rule = change.newRule;
            const remediatedRule = change.remediation?.remediatedRule;
            return (
              <div
                key={change.id}
                className={
                  "rounded-lg border p-4 " +
                  (isActive
                    ? isRemediated
                      ? "border-emerald-500/50 bg-emerald-950/20"
                      : "border-red-500/40 bg-red-950/10"
                    : "border-border bg-muted/10 opacity-70")
                }
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {change.op === "add_rule" ? "TAMBAH ATURAN" : change.op === "remove_rule" ? "HAPUS ATURAN" : "UBAH ATURAN"}
                  </Badge>
                  <span className="font-mono text-xs text-primary">{change.id}</span>
                  <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">
                    TIKET {change.ticketRef}
                  </Badge>
                  <div className="ml-auto flex items-center gap-2">
                    {isRemediated && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 font-mono text-[10px]"
                        onClick={() => unremediate(change.id)}
                      >
                        <Undo2 className="mr-1 h-3 w-3" />
                        KEMBALIKAN KE USULAN ASLI
                      </Button>
                    )}
                    <Switch
                      checked={isActive}
                      onCheckedChange={(v) =>
                        toggleChange(change.id, v).then(() =>
                          toast({
                            title: v
                              ? `${change.id} diaktifkan`
                              : `${change.id} dinonaktifkan`,
                            description:
                              "Topologi & aluran diperbarui seketika. Jalankan validasi untuk laporan resmi.",
                          })
                        )
                      }
                      aria-label={`Aktifkan atau nonaktifkan ${change.id}`}
                    />
                  </div>
                </div>

                <p className="mt-3 text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">Justifikasi teknisi: </span>
                  {change.justification}
                </p>

                {rule && !isRemediated && (
                  <div className="mt-3 rounded-md border border-border bg-muted/30 p-3 font-mono text-xs">
                    <span className={rule.action === "allow" ? "text-emerald-300" : "text-red-300"}>
                      {rule.action.toUpperCase()}
                    </span>{" "}
                    <span className="text-foreground">{ruleSummary(scenario, rule)}</span>
                    <p className="mt-1 text-[11px] text-muted-foreground">{rule.description}</p>
                  </div>
                )}

                {isRemediated && rule && remediatedRule && (
                  <div className="mt-3 space-y-2">
                    <div className="rounded-md border border-border bg-muted/20 p-3 font-mono text-xs opacity-60">
                      <span className="line-through">{ruleSummary(scenario, rule)}</span>
                      <p className="text-[10px] text-muted-foreground">(usulan asli — digantikan remediasi)</p>
                    </div>
                    <div className="rounded-md border border-emerald-500/50 bg-emerald-950/20 p-3 font-mono text-xs">
                      <Wand2 className="mr-1 inline h-3 w-3 text-emerald-300" />
                      <span className="text-emerald-300">
                        {remediatedRule.action.toUpperCase()}{" "}
                      </span>
                      <span className="text-foreground">{ruleSummary(scenario, remediatedRule)}</span>
                      <p className="mt-1 text-[11px] text-muted-foreground">{remediatedRule.description}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{change.remediation?.note}</p>
                  </div>
                )}

                {!isRemediated && change.remediation && (
                  <p className="mt-2 text-[11px] text-muted-foreground/80">
                    Remediasi tersedia dari laporan validasi bila aturan ini menimbulkan temuan.
                  </p>
                )}
              </div>
            );
          })}
          <Separator />
          {nonaktifDefault.length > 0 && (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Catatan: {nonaktifDefault.map((c) => c.id).join(", ")} nonaktif
              secara default — aktifkan lalu jalankan validasi untuk melihat
              bagaimana PRAUJI menangani referensi aset yang tidak dikenal
              dalam model (verdict INCONCLUSIVE, bukan &ldquo;aman&rdquo;).
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
