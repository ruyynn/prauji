/**
 * PRAUJI — Engine Self-Test (regresi)
 *
 * Menjalankan seluruh alur demo dan memastikan engine menemukan
 * TEPAT temuan yang diharapkan dari model. Ini bukti bahwa semua
 * temuan dihasilkan evaluasi aktual, bukan teks statis.
 *
 * Jalankan: bun scripts/engine-selftest.ts
 */
import { validateChange, defaultChangeStates } from "@/lib/engine/validate";
import { scenario } from "@/lib/scenario";
import type { ChangeStates } from "@/lib/engine/validate";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function states(partial: Record<string, { applied: boolean; remediated?: boolean }>): ChangeStates {
  const s: ChangeStates = {};
  for (const c of scenario.changeRequest.changes) {
    const p = partial[c.id];
    s[c.id] = { applied: p?.applied ?? false, remediated: p?.remediated ?? false };
  }
  return s;
}

const OPTS = { runId: "selftest", label: "test" };

console.log("\n=== PRAUJI Engine Self-Test ===\n");

// ---------- 1. Baseline murni ----------
console.log("[1] Baseline tanpa perubahan");
const rBase = validateChange(scenario, states({}), OPTS);
check("verdict = PASS", rBase.verdict === "PASS", `got ${rBase.verdict}`);
check("semua invariant PASS", rBase.invariants.every((i) => i.status === "PASS"));
check("tidak ada temuan FAIL", !rBase.findings.some((f) => f.status === "FAIL"));
check("newFlows kosong", rBase.diff.newFlows.length === 0);
check("closedFlows kosong", rBase.diff.closedFlows.length === 0);

// ---------- 2. Usulan asli (A+B aktif) ----------
console.log("\n[2] Usulan CHG-2026-047 (A+B aktif, belum remediasi)");
const rProp = validateChange(
  scenario,
  states({ "CHG-2026-047-A": { applied: true }, "CHG-2026-047-B": { applied: true } }),
  OPTS
);
check("verdict = FAIL", rProp.verdict === "FAIL", `got ${rProp.verdict}`);
check(
  "INV-001 dilanggar",
  rProp.invariants.find((i) => i.invariantId === "INV-001")?.status === "FAIL"
);
check(
  "INV-003 dilanggar",
  rProp.invariants.find((i) => i.invariantId === "INV-003")?.status === "FAIL"
);
check(
  "INV-004 dilanggar",
  rProp.invariants.find((i) => i.invariantId === "INV-004")?.status === "FAIL"
);
check(
  "INV-002 tetap terpenuhi",
  rProp.invariants.find((i) => i.invariantId === "INV-002")?.status === "PASS"
);
check(
  "INV-005 tetap terpenuhi",
  rProp.invariants.find((i) => i.invariantId === "INV-005")?.status === "PASS"
);

const newAttack = rProp.findings.find((f) => f.findingType === "NEW_ATTACK_PATH");
check("ada temuan NEW_ATTACK_PATH kritis", newAttack?.severity === "critical");
check(
  "temuan kritis menunjuk Database Inti",
  newAttack?.affectedAsset === "int-db01",
  `got ${newAttack?.affectedAsset}`
);
check(
  "temuan kritis diatribusikan ke FW-NEW-020",
  newAttack?.causedByRuleId === "FW-NEW-020",
  `got ${newAttack?.causedByRuleId}`
);
check(
  "bukti: baseline tidak dapat dijangkau",
  newAttack?.evidence.baselineReachable === false
);
check(
  "bukti: usulan dapat dijangkau",
  newAttack?.evidence.proposedReachable === true
);
check(
  "rantai kompromi baseline 3 tahap",
  newAttack?.evidence.baselineChain?.totalStages === 3,
  `got ${newAttack?.evidence.baselineChain?.totalStages}`
);
check(
  "rantai kompromi usulan 2 tahap (lebih pendek)",
  newAttack?.evidence.proposedChain?.totalStages === 2,
  `got ${newAttack?.evidence.proposedChain?.totalStages}`
);
check(
  "hop rantai: web01 → db01 via FW-NEW-020",
  newAttack?.evidence.proposedChain?.hops?.some(
    (h) => h.from === "dmz-web01" && h.to === "int-db01" && h.ruleId === "FW-NEW-020"
  ) === true
);

const svcImpact = rProp.findings.find((f) => f.findingType === "SERVICE_IMPACT");
check("ada temuan SERVICE_IMPACT (log SIEM putus)", !!svcImpact);
check(
  "SERVICE_IMPACT menunjuk SIEM",
  svcImpact?.affectedAsset === "sec-siem01",
  `got ${svcImpact?.affectedAsset}`
);
check(
  "SERVICE_IMPACT diatribusikan ke FW-NEW-021",
  svcImpact?.causedByRuleId === "FW-NEW-021",
  `got ${svcImpact?.causedByRuleId}`
);
check(
  "2 aluran log wajib terputus",
  svcImpact?.evidence.impactedFlows?.length === 2,
  `got ${svcImpact?.evidence.impactedFlows?.length}`
);

const exposure = rProp.findings.find((f) => f.findingType === "SERVICE_EXPOSURE");
check("ada temuan SERVICE_EXPOSURE (SSH terekspos)", !!exposure);
check(
  "SSH ke App Server dari DMZ",
  exposure?.evidence.impactedFlows?.some((f) => f.src === "dmz-web01" && f.dst === "int-app01" && f.port === 22) === true
);

const broadWarns = rProp.findings.filter((f) => f.findingType === "OVERLY_BROAD_RULE");
check("ada 2 peringatan aturan terlalu luas", broadWarns.length === 2, `got ${broadWarns.length}`);
check(
  "peringatan menyebut shadow FW-BASE-02",
  broadWarns.some((w) => w.description.includes("FW-BASE-02")),
  broadWarns.map((w) => w.description.slice(0, 80)).join(" || ")
);

check(
  "diff: 3 aluran baru terbuka (8443 yang dimaksud tiket + SSH 22 + MySQL 3306)",
  rProp.diff.newFlows.length === 3,
  `got ${rProp.diff.newFlows.map((f) => `${f.src}->${f.dst}:${f.port}`).join(", ")}`
);
check(
  "perbaikan tiket #2026-113 memang berfungsi pada usulan (web→app:8443 terbuka)",
  rProp.diff.newFlows.some((f) => f.src === "dmz-web01" && f.dst === "int-app01" && f.port === 8443)
);
check(
  "celah 1: SSH (22) DMZ → App Server terbuka",
  rProp.diff.newFlows.some((f) => f.src === "dmz-web01" && f.dst === "int-app01" && f.port === 22)
);
check(
  "celah 2: MySQL (3306) DMZ → Database Inti terbuka",
  rProp.diff.newFlows.some((f) => f.src === "dmz-web01" && f.dst === "int-db01" && f.port === 3306)
);
check(
  "diff: 6 aluran tertutup (termasuk kolateral 8443)",
  rProp.diff.closedFlows.length === 6,
  `got ${rProp.diff.closedFlows.map((f) => `${f.src}->${f.dst}:${f.port}`).join(", ")}`
);

// ---------- 3. Remediasi diterapkan ----------
console.log("\n[3] Usulan setelah remediasi REM-020 + REM-021");
const rRem = validateChange(
  scenario,
  states({
    "CHG-2026-047-A": { applied: true, remediated: true },
    "CHG-2026-047-B": { applied: true, remediated: true },
  }),
  OPTS
);
check("verdict = PASS", rRem.verdict === "PASS", `got ${rRem.verdict}`);
check("semua invariant PASS", rRem.invariants.every((i) => i.status === "PASS"));
check("tidak ada temuan FAIL/WARN", !rRem.findings.some((f) => f.status !== "INCONCLUSIVE"));
check(
  "perbaikan reporting tetap berfungsi: web→app:8443 terbuka",
  rRem.diff.newFlows.some((f) => f.src === "dmz-web01" && f.dst === "int-app01" && f.port === 8443),
  `newFlows: ${rRem.diff.newFlows.map((f) => `${f.src}->${f.dst}:${f.port}`).join(", ")}`
);
check(
  "blokir audit tetap berfungsi: kiosk→siem:8443 tertutup",
  rRem.diff.closedFlows.some((f) => f.src === "int-kiosk01" && f.dst === "sec-siem01" && f.port === 8443),
  `closedFlows: ${rRem.diff.closedFlows.map((f) => `${f.src}->${f.dst}:${f.port}`).join(", ")}`
);
check(
  "tidak ada akses baru lain (selain 8443)",
  rRem.diff.newFlows.length === 1,
  `got ${rRem.diff.newFlows.length}`
);
check(
  "log SIEM tetap mengalir: tidak ada closedFlow syslog",
  !rRem.diff.closedFlows.some((f) => f.port === 514),
  `closedFlows: ${rRem.diff.closedFlows.map((f) => `${f.src}->${f.dst}:${f.port}`).join(", ")}`
);

// ---------- 4. Celah model (INCONCLUSIVE) ----------
console.log("\n[4] Hanya FW-NEW-022 aktif (referensi aset tak dikenal)");
const rGap = validateChange(
  scenario,
  states({ "CHG-2026-047-C": { applied: true } }),
  OPTS
);
check("verdict = INCONCLUSIVE", rGap.verdict === "INCONCLUSIVE", `got ${rGap.verdict}`);
check(
  "ada temuan MODEL_GAP",
  rGap.findings.some((f) => f.findingType === "MODEL_GAP")
);
check(
  "tidak ada invariant dilanggar",
  !rGap.invariants.some((i) => i.status === "FAIL")
);

// ---------- 5. Determinisme ----------
console.log("\n[5] Determinisme engine");
const rProp2 = validateChange(
  scenario,
  states({ "CHG-2026-047-A": { applied: true }, "CHG-2026-047-B": { applied: true } }),
  OPTS
);
check(
  "input sama → temuan identik",
  JSON.stringify(rProp.findings.map((f) => [f.id, f.title])) ===
    JSON.stringify(rProp2.findings.map((f) => [f.id, f.title]))
);

// ---------- 6. Toggle tunggal (blame analysis) ----------
console.log("\n[6] Analisis blame: hanya A aktif");
const rA = validateChange(scenario, states({ "CHG-2026-047-A": { applied: true } }), OPTS);
check("verdict tetap FAIL (A sendiri sudah berbahaya)", rA.verdict === "FAIL");
check(
  "temuan SIEM tidak muncul tanpa B",
  !rA.findings.some((f) => f.findingType === "SERVICE_IMPACT"),
  `temuan: ${rA.findings.map((f) => f.findingType).join(", ")}`
);
const rB = validateChange(scenario, states({ "CHG-2026-047-B": { applied: true } }), OPTS);
check("hanya B aktif → masih FAIL (SIEM putus)", rB.verdict === "FAIL");
check(
  "temuan DMZ→DB tidak muncul tanpa A",
  !rB.findings.some((f) => f.findingType === "NEW_ATTACK_PATH")
);

// ---------- 7. Default state ----------
console.log("\n[7] State default skenario");
const defStates = defaultChangeStates(scenario);
check("A & B aktif secara default, C tidak", defStates["CHG-2026-047-A"].applied && defStates["CHG-2026-047-B"].applied && !defStates["CHG-2026-047-C"].applied);

console.log(`\n=== HASIL: ${passed} lulus, ${failed} gagal ===\n`);
if (failed > 0) {
  process.exit(1);
}
