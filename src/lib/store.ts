"use client";

/**
 * PRAUJI — state management (Zustand): memuat skenario, toggle
 * perubahan, menjalankan validasi, remediasi, dan riwayat.
 */
import { create } from "zustand";
import type {
  Scenario,
  ValidationReport,
} from "@/lib/engine/types";

export type TabId = "ringkasan" | "topologi" | "perubahan" | "validasi";
export type TopoMode = "fisik" | "baseline" | "usulan" | "diff";

export interface ChangeState {
  applied: boolean;
  remediated: boolean;
}

export interface RunSummary {
  id: string;
  label: string;
  verdict: "PASS" | "FAIL" | "INCONCLUSIVE";
  criticalCount: number;
  highCount: number;
  warnCount: number;
  createdAt: string;
}

interface PraujiStore {
  scenario: Scenario | null;
  changeStates: Record<string, ChangeState> | null;
  report: ValidationReport | null;
  /** snapshot change-set saat laporan terakhir dibuat (deteksi basi) */
  reportSnapshot: string | null;
  runs: RunSummary[];

  tab: TabId;
  topoMode: TopoMode;
  selectedAssetId: string | null;
  highlightedFindingId: string | null;

  loading: boolean;
  validating: boolean;
  error: string | null;

  init: () => Promise<void>;
  runValidation: (label?: string) => Promise<ValidationReport | null>;
  toggleChange: (changeId: string, applied: boolean) => Promise<void>;
  remediate: (changeId: string) => Promise<void>;
  unremediate: (changeId: string) => Promise<void>;
  loadRun: (runId: string) => Promise<void>;
  resetDemo: () => Promise<void>;
  setTab: (tab: TabId) => void;
  setTopoMode: (mode: TopoMode) => void;
  selectAsset: (assetId: string | null) => void;
  highlightFinding: (findingId: string | null) => void;
}

async function jfetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const usePrauji = create<PraujiStore>((set, get) => ({
  scenario: null,
  changeStates: null,
  report: null,
  reportSnapshot: null,
  runs: [],
  tab: "ringkasan",
  topoMode: "fisik",
  selectedAssetId: null,
  highlightedFindingId: null,
  loading: false,
  validating: false,
  error: null,

  init: async () => {
    if (get().scenario) return;
    set({ loading: true, error: null });
    try {
      const data = await jfetch<{
        scenario: Scenario;
        changeStates: Record<string, ChangeState>;
      }>("/api/scenario");
      const runs = await jfetch<{ runs: RunSummary[] }>("/api/runs");
      set({
        scenario: data.scenario,
        changeStates: data.changeStates,
        runs: runs.runs,
        loading: false,
      });
      // Pulihkan laporan terakhir agar verdict tetap terlihat setelah refresh
      if (runs.runs.length > 0 && !get().report) {
        await get().loadRun(runs.runs[0].id);
      }
    } catch (e) {
      set({ loading: false, error: (e as Error).message });
    }
  },

  runValidation: async (label?: string) => {
    set({ validating: true, error: null });
    try {
      const data = await jfetch<{ report: ValidationReport }>("/api/validate", {
        method: "POST",
        body: JSON.stringify({
          label:
            label ??
            (get().report
              ? "Validasi ulang perubahan"
              : "Validasi awal permintaan perubahan"),
        }),
      });
      const runs = await jfetch<{ runs: RunSummary[] }>("/api/runs");
      set({
        report: data.report,
        reportSnapshot: JSON.stringify(get().changeStates),
        runs: runs.runs,
        validating: false,
      });
      return data.report;
    } catch (e) {
      set({ validating: false, error: (e as Error).message });
      return null;
    }
  },

  toggleChange: async (changeId, applied) => {
    try {
      const data = await jfetch<{ changeStates: Record<string, ChangeState> }>(
        "/api/changes",
        { method: "POST", body: JSON.stringify({ action: "toggle", changeId, applied }) }
      );
      set({ changeStates: data.changeStates });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  remediate: async (changeId) => {
    try {
      const data = await jfetch<{ changeStates: Record<string, ChangeState> }>(
        "/api/changes",
        { method: "POST", body: JSON.stringify({ action: "remediate", changeId }) }
      );
      set({ changeStates: data.changeStates });
      // Satu klik remediasi → validasi ulang otomatis sebagai bukti perbaikan
      await get().runValidation(`Validasi ulang pasca-remediasi (${changeId})`);
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  unremediate: async (changeId) => {
    try {
      const data = await jfetch<{ changeStates: Record<string, ChangeState> }>(
        "/api/changes",
        { method: "POST", body: JSON.stringify({ action: "unremediate", changeId }) }
      );
      set({ changeStates: data.changeStates });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  loadRun: async (runId) => {
    try {
      const data = await jfetch<{
        run: {
          id: string;
          label: string;
          verdict: string;
          reportJson: string;
          changeSnapshot: string;
          createdAt: string;
        };
      }>(`/api/runs/${runId}`);
      const report = JSON.parse(data.run.reportJson) as ValidationReport;
      if (!report?.verdict) throw new Error("Laporan run tidak valid");
      set({
        report,
        reportSnapshot: data.run.changeSnapshot,
        highlightedFindingId: null,
      });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  resetDemo: async () => {
    try {
      const data = await jfetch<{ changeStates: Record<string, ChangeState> }>(
        "/api/reset",
        { method: "POST" }
      );
      set({
        changeStates: data.changeStates,
        report: null,
        reportSnapshot: null,
        runs: [],
        highlightedFindingId: null,
        selectedAssetId: null,
        topoMode: "fisik",
      });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  setTab: (tab) => set({ tab }),
  setTopoMode: (topoMode) => set({ topoMode }),
  selectAsset: (selectedAssetId) => set({ selectedAssetId }),
  highlightFinding: (highlightedFindingId) => set({ highlightedFindingId }),
}));

/** Helper: deteksi apakah change-set berubah sejak laporan terakhir. */
export function isReportStale(
  changeStates: Record<string, ChangeState> | null,
  snapshot: string | null
): boolean {
  if (!snapshot || !changeStates) return false;
  return JSON.stringify(changeStates) !== snapshot;
}
