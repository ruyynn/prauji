"use client";

/** PRAUJI — header: identitas, navigasi tab, verdict, reset demo. */
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { usePrauji, type TabId } from "@/lib/store";
import { VerdictBadge } from "./bits";
import { RotateCcw, Radar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const TABS: { id: TabId; label: string }[] = [
  { id: "ringkasan", label: "Ringkasan" },
  { id: "topologi", label: "Topologi" },
  { id: "perubahan", label: "Perubahan" },
  { id: "validasi", label: "Validasi" },
];

export function PraujiHeader() {
  const { tab, setTab, report, resetDemo, runValidation, validating, scenario } =
    usePrauji();
  const { toast } = useToast();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-md border border-primary/40 bg-primary/10">
            <Radar className="h-5 w-5 text-primary" />
          </span>
          <div className="leading-tight">
            <p className="font-mono text-sm font-bold tracking-widest">PRAUJI</p>
            <p className="text-[10px] text-muted-foreground">
              Pre-deployment Validator · MVP
            </p>
          </div>
        </div>

        <nav className="order-3 w-full sm:order-none sm:w-auto" aria-label="Navigasi utama">
          <div className="flex flex-wrap gap-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 font-mono text-xs transition-colors",
                  tab === t.id
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {t.label}
                {t.id === "validasi" && (
                  <span className="ml-1.5 text-[10px]">
                    {report
                      ? report.verdict === "FAIL"
                        ? "●"
                        : report.verdict === "PASS"
                          ? "✓"
                          : "?"
                      : ""}
                  </span>
                )}
              </button>
            ))}
          </div>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {report && <VerdictBadge verdict={report.verdict} size="sm" />}
          <Button
            size="sm"
            variant="outline"
            className="font-mono text-[11px]"
            onClick={() =>
              runValidation().then((r) => {
                if (r) {
                  toast({
                    title: `Validasi selesai: ${r.verdict}`,
                    description: r.summary.sentence,
                    variant: r.verdict === "PASS" ? "default" : "destructive",
                  });
                  setTab("validasi");
                }
              })
            }
            disabled={validating}
          >
            <Radar className="mr-1 h-3.5 w-3.5" />
            {validating ? "…" : "VALIDASI"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="font-mono text-[11px]"
            onClick={() =>
              resetDemo().then(() =>
                toast({
                  title: "Demo direset",
                  description:
                    "Change-set kembali ke usulan awal. Riwayat validasi dibersihkan.",
                })
              )
            }
            title="Reset demo ke kondisi awal"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4">
        {scenario && (
          <Badge
            variant="outline"
            className="mb-2 max-w-full whitespace-normal break-words border-border/60 text-left font-mono text-[9px] leading-relaxed text-muted-foreground/80"
          >
            SCENARIO: {scenario.name.toUpperCase()} · MODEL SINTETIS UNTUK DEMONSTRASI
            — SEMUA TEMUAN DIHASILKAN ENGINE, BUKAN TEKS STATIS
          </Badge>
        )}
      </div>
    </header>
  );
}
