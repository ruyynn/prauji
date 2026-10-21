"use client";

/**
 * PRAUJI — satu halaman kerja operasi: Ringkasan → Topologi →
 * Perubahan → Validasi.
 */
import { useEffect } from "react";
import { usePrauji } from "@/lib/store";
import { PraujiHeader } from "@/components/prauji/header";
import { DashboardView } from "@/components/prauji/dashboard";
import { TopologyView } from "@/components/prauji/topology";
import { ChangesView } from "@/components/prauji/changes";
import { ValidationView } from "@/components/prauji/validation";
import { Skeleton } from "@/components/ui/skeleton";

export default function Home() {
  const { init, tab, loading, error, scenario } = usePrauji();

  useEffect(() => {
    init();
  }, [init]);

  return (
    <div className="flex min-h-screen flex-col">
      <PraujiHeader />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        {error && (
          <div className="mb-4 rounded-md border border-red-500/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
            Gagal memuat data: {error} — coba reset demo atau muat ulang halaman.
          </div>
        )}

        {loading || !scenario ? (
          <div className="space-y-4">
            <Skeleton className="h-40 w-full" />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Skeleton className="h-64 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          </div>
        ) : (
          <>
            {tab === "ringkasan" && <DashboardView />}
            {tab === "topologi" && <TopologyView />}
            {tab === "perubahan" && <ChangesView />}
            {tab === "validasi" && <ValidationView />}
          </>
        )}
      </main>

      <footer className="mt-auto border-t border-border bg-card/40">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-[11px] text-muted-foreground">
          <span className="font-mono">
            PRAUJI · Pre-deployment Validator — MVP Kartika Cyber Hackathon 2026
          </span>
          <span>
            Tidak hanya memvalidasi perbaikan yang dimaksudkan — PRAUJI memeriksa
            apa yang mungkin rusak akibat perbaikan tersebut.
          </span>
        </div>
      </footer>
    </div>
  );
}
