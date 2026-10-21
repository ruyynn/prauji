"use client";

/**
 * PRAUJI — ringkasan: identitas produk, status permintaan perubahan
 * aktif, cara kerja engine, dan posisi produk.
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
import {
  ShieldCheck,
  GitCompareArrows,
  Route,
  FileWarning,
  ClipboardList,
  ArrowRight,
  Radar,
} from "lucide-react";
import { usePrauji, isReportStale } from "@/lib/store";
import { VerdictBadge } from "./bits";

const HOW_IT_WORKS = [
  { n: "01", t: "Muat baseline", d: "Model topologi, aturan ACL, dan invariant keamanan yang disetujui dimuat." },
  { n: "02", t: "Terapkan usulan", d: "Perubahan hanya diterapkan pada SALINAN model — jaringan asli tidak disentuh." },
  { n: "03", t: "Evaluasi konektivitas", d: "Engine menghitung seluruh aluran yang diizinkan/ditolak pada kedua state." },
  { n: "04", t: "Uji invariant", d: "Setiap aturan keamanan yang wajib selalu benar diuji terhadap state usulan." },
  { n: "05", t: "Bandingkan & jelaskan", d: "Attack surface diff + rantai kompromi sebelum/sesudah, dengan bukti per aturan." },
  { n: "06", t: "Laporan keputusan", d: "PASS / FAIL / INCONCLUSIVE beserta rekomendasi dan remediasi yang dapat diuji ulang." },
];

export function DashboardView() {
  const { scenario, changeStates, report, setTab, runValidation, validating } =
    usePrauji();

  if (!scenario) return null;

  const cr = scenario.changeRequest;
  const appliedChanges = cr.changes.filter(
    (c) => changeStates?.[c.id]?.applied
  ).length;
  const remediatedCount = cr.changes.filter(
    (c) => changeStates?.[c.id]?.remediated
  ).length;
  const stale = isReportStale(changeStates, usePrauji.getState().reportSnapshot);

  return (
    <div className="space-y-6">
      <Card className="relative overflow-hidden border-primary/30">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(600px 220px at 15% -10%, oklch(0.35 0.06 163 / 0.5), transparent), radial-gradient(500px 200px at 90% 120%, oklch(0.3 0.04 25 / 0.4), transparent)",
          }}
        />
        <CardContent className="relative space-y-5 pt-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-primary/50 font-mono text-[10px] text-primary">
              KATEGORI: CORE INFRA — DUKUNGAN TEKNOLOGI
            </Badge>
            <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">
              MVP · KARTIKA CYBER HACKATHON 2026
            </Badge>
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              PRAUJI — Pre-deployment Validator
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Alat validasi perubahan keamanan jaringan <em>sebelum diterapkan</em>.
              PRAUJI menjawab satu pertanyaan yang sering terlupakan saat tim memperbaiki
              masalah lama:{" "}
              <span className="font-semibold text-foreground">
                &ldquo;Gimana caranya cegah tim bikin masalah baru saat nge-fix masalah lama?&rdquo;
              </span>
            </p>
            <p className="mt-2 max-w-3xl border-l-2 border-primary/60 pl-3 font-mono text-xs text-primary sm:text-sm">
              PRAUJI doesn&apos;t just validate the intended fix.
              <br className="hidden sm:block" />
              It checks what the fix might break.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => runValidation().then(() => setTab("validasi"))}
              disabled={validating}
              className="font-mono"
            >
              <Radar className="mr-1.5 h-4 w-4" />
              {validating ? "Memvalidasi…" : "Jalankan Validasi"}
            </Button>
            <Button variant="outline" onClick={() => setTab("perubahan")} className="font-mono">
              Buka Workspace Perubahan
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="font-mono text-base">
                Permintaan Perubahan Aktif — {cr.id}
              </CardTitle>
              <CardDescription className="mt-1">{cr.title}</CardDescription>
            </div>
            {report ? (
              <div className="flex items-center gap-2">
                {stale && (
                  <Badge variant="outline" className="border-amber-500/60 font-mono text-[10px] text-amber-300">
                    CHANGE-SET BERUBAH — VALIDASI ULANG
                  </Badge>
                )}
                <VerdictBadge verdict={report.verdict} />
              </div>
            ) : (
              <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">
                BELUM DIVALIDASI
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-relaxed text-muted-foreground">{cr.description}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Aset termodel" value={`${scenario.assets.length}`} />
            <Stat label="Zona kepercayaan" value={`${scenario.zones.length}`} />
            <Stat label="Aturan baseline" value={`${scenario.baselineRules.length}`} />
            <Stat label="Invariant keamanan" value={`${scenario.invariants.length}`} />
            <Stat label="Usulan aktif" value={`${appliedChanges}/${cr.changes.length}`} />
            <Stat label="Sudah diremediasi" value={`${remediatedCount}`} />
            <Stat label="Temuan terakhir" value={report ? `${report.summary.totalFindings}` : "—"} />
            <Stat
              label="Aluran baru terbuka"
              value={report ? `${report.summary.newFlowsCount}` : "—"}
              tone={report && report.summary.newFlowsCount > 0 ? "danger" : undefined}
            />
          </div>
          <Separator />
          <div className="space-y-2">
            {cr.changes.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2"
              >
                <Badge
                  variant="outline"
                  className={cnChange(changeStates?.[c.id]?.applied)}
                >
                  {changeStates?.[c.id]?.applied ? "AKTIF" : "NONAKTIF"}
                </Badge>
                {changeStates?.[c.id]?.remediated && (
                  <Badge variant="outline" className="border-emerald-500/60 font-mono text-[10px] text-emerald-300">
                    DIREMEDIASI
                  </Badge>
                )}
                <span className="font-mono text-xs text-primary">{c.newRule?.id ?? c.targetRuleId}</span>
                <span className="text-xs text-muted-foreground">{c.justification}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4 text-primary" />
            Cara Kerja Engine (alur evaluasi)
          </CardTitle>
          <CardDescription>
            Alur evaluasi selaras prinsip <em>security-focused configuration management</em> (NIST SP 800-128).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {HOW_IT_WORKS.map((s) => (
              <div key={s.n} className="rounded-lg border border-border bg-muted/20 p-4">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-lg font-bold text-primary">{s.n}</span>
                  <span className="text-sm font-semibold">{s.t}</span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{s.d}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Apa yang membedakan PRAUJI dari sekadar &ldquo;cek konektivitas&rdquo;?</CardTitle>
          <CardDescription>
            Analisis konfigurasi jaringan sudah ada (mis. Batfish). PRAUJI membangun
            pengalaman <em>security-first change validation</em> yang berbeda:
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Feature
            icon={<Route className="h-4 w-4" />}
            title="Perubahan jalur serangan, bukan sekadar perubahan konfigurasi"
            desc="Rantai kompromi dihitung sebelum vs sesudah usulan — termasuk deteksi rantai yang menjadi LEBIH PENDEK menuju aset kritis."
          />
          <Feature
            icon={<ShieldCheck className="h-4 w-4" />}
            title="Security invariants yang dideklarasikan tim sendiri"
            desc={"Aturan wajib-selalu-benar (mis. \u201cDMZ dilarang menyentuh database\u201d) diuji pada setiap usulan — niat perbaikan tidak bisa menggesernya."}
          />
          <Feature
            icon={<GitCompareArrows className="h-4 w-4" />}
            title="Attack surface diff berbasis bukti"
            desc="Setiap temuan menyertakan aluran, aturan penyebab, status baseline vs usulan, dan perbandingan rantai — dapat diperiksa ulang."
          />
          <Feature
            icon={<FileWarning className="h-4 w-4" />}
            title="INCONCLUSIVE yang jujur"
            desc="Bila model belum merepresentasikan aset yang dirujuk, PRAUJI menolak menyatakan aman. Ketiadaan temuan bukan bukti keamanan."
          />
        </CardContent>
      </Card>
    </div>
  );
}

function cnChange(applied?: boolean) {
  return applied !== undefined && applied
    ? "border-emerald-500/60 font-mono text-[10px] text-emerald-300"
    : "border-zinc-600 font-mono text-[10px] text-zinc-400";
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger";
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5">
      <p className="font-mono text-xl font-bold leading-none">
        <span className={tone === "danger" ? "text-red-400" : ""}>{value}</span>
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function Feature({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
          {icon}
        </span>
        <span className="text-sm font-semibold">{title}</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{desc}</p>
    </div>
  );
}
