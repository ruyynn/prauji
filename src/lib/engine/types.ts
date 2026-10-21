/**
 * PRAUJI — tipe data inti engine validasi perubahan keamanan jaringan.
 */

export type ZoneId = "eksternal" | "dmz" | "internal" | "admin" | "keamanan";

export interface Zone {
  id: ZoneId;
  name: string;
  /** 0 = paling tidak tepercaya, 5 = paling tepercaya */
  trustLevel: number;
  description: string;
}

export type Criticality = "low" | "medium" | "high" | "critical";

export type AssetType =
  | "adversary"
  | "server"
  | "database"
  | "bastion"
  | "workstation"
  | "security-appliance";

export interface ServiceDef {
  port: number;
  proto: "tcp" | "udp";
  name: string;
  /** Layanan manajemen (SSH/RDP) — subjek invariant akses terbatas */
  mgmtOnly?: boolean;
}

export interface Asset {
  id: string;
  name: string;
  zone: ZoneId;
  type: AssetType;
  criticality: Criticality;
  services: ServiceDef[];
  /** Alamat IP contoh untuk keperluan demo (model sintetis) */
  ip: string;
  description: string;
}

/**
 * Koneksi fisik/routing antar dua aset.
 * Koneksi mendefinisikan KEMUNGKINAN aliran paket (routable),
 * BUKAN izin. Izin ditentukan oleh aturan ACL.
 * "Jalur koneksi yang diizinkan ditentukan oleh kebijakan,
 *  bukan oleh posisi visual node."
 */
export interface Connection {
  from: string;
  to: string;
  note?: string;
}

export interface Selector {
  zones?: ZoneId[];
  assets?: string[];
  any?: boolean;
}

/** Pemilih layanan: port spesifik, semua, atau seluruh layanan manajemen. */
export interface ServiceSelector {
  port?: number;
  any?: boolean;
  /** Cocok dengan semua layanan bertanda mgmtOnly (SSH/RDP/dsb.) */
  mgmtOnly?: boolean;
}

export interface AclRule {
  id: string;
  action: "allow" | "deny";
  source: Selector;
  destination: Selector;
  service: ServiceSelector;
  description: string;
}

export type ChangeOp = "add_rule" | "remove_rule" | "modify_rule";

export interface ProposedChange {
  id: string;
  op: ChangeOp;
  /** ID aturan baseline yang dihapus/diubah (untuk remove/modify) */
  targetRuleId?: string;
  /** Aturan baru (untuk add/modify) */
  newRule?: AclRule;
  /** Justifikasi teknisi — niat perbaikan yang asli */
  justification: string;
  /** Referensi tiket masalah lama yang ingin diperbaiki */
  ticketRef: string;
  /** Status default saat demo dimuat */
  enabledByDefault: boolean;
  /** Definisi aturan pengganti yang lebih sempit (hasil remediasi) */
  remediation?: {
    id: string;
    remediatedRule: AclRule;
    note: string;
  };
}

export interface ChangeRequest {
  id: string;
  title: string;
  description: string;
  author: string;
  submittedAt: string;
  changes: ProposedChange[];
}

export type InvariantType =
  | "forbidden_path" // sumber TIDAK BOLEH mencapai tujuan
  | "required_path" // sumber WAJIB dapat mencapai tujuan (kontinuitas layanan)
  | "restricted_access"; // hanya sumber tertentu yang boleh mengakses layanan

export type Severity = "critical" | "high" | "medium" | "low";

export interface Invariant {
  id: string;
  type: InvariantType;
  name: string;
  description: string;
  severity: Severity;
  source: Selector;
  destination: Selector;
  service?: ServiceSelector;
  /** Untuk restricted_access: sumber yang diizinkan mengakses */
  allowedSources?: Selector;
  /** Dasar/rujukan kebijakan (mis. NIST SP 800-207) */
  rationale: string;
}

export interface FlowInfo {
  src: string;
  dst: string;
  port: number;
  serviceName: string;
  proto: "tcp" | "udp";
  /** Aturan yang cocok & menentukan keputusan (null = default deny) */
  matchedRuleId: string | null;
  matchedRuleAction: "allow" | "deny";
}

/** Satu hop dalam rantai serangan */
export interface PathHop {
  from: string;
  to: string;
  port: number;
  serviceName: string;
  ruleId: string | null;
}

export interface AttackChain {
  target: string;
  /** null = tidak ada rantai (tidak dapat dijangkau) */
  hops: PathHop[] | null;
  totalStages: number;
}

export type Verdict = "PASS" | "FAIL" | "INCONCLUSIVE";

export type FindingType =
  | "NEW_ATTACK_PATH" // jalur baru menuju aset kritis
  | "SERVICE_EXPOSURE" // layanan baru yang terekspos
  | "SERVICE_IMPACT" // layanan wajib yang terputus
  | "OVERLY_BROAD_RULE" // aturan terlalu luas (least privilege)
  | "MODEL_GAP"; // referensi tak dikenal — tidak dapat disimpulkan

export interface Finding {
  id: string;
  status: "FAIL" | "WARN" | "INCONCLUSIVE";
  severity: Severity;
  findingType: FindingType;
  title: string;
  description: string;
  /** Invariant yang dilanggar (jika ada) */
  policyId?: string;
  affectedAsset?: string;
  /** Perubahan usulan penyebab (jika dapat diatribusikan) */
  causedByChangeId?: string;
  causedByRuleId?: string;
  evidence: {
    baselineReachable?: boolean;
    proposedReachable?: boolean;
    path?: PathHop[];
    baselineChain?: AttackChain;
    proposedChain?: AttackChain;
    impactedFlows?: FlowInfo[];
    detail?: string;
  };
  recommendation: string;
  remediationId?: string;
}

export interface InvariantViolation {
  src: string;
  dst: string;
  port: number;
  proto: "tcp" | "udp";
  serviceName: string;
  detail: string;
}

export interface InvariantResult {
  invariantId: string;
  name: string;
  severity: Severity;
  status: "PASS" | "FAIL";
  explanation: string;
  violations: InvariantViolation[];
}

export interface ValidationReport {
  runId: string;
  requestId: string;
  timestamp: string;
  label: string;
  verdict: Verdict;
  summary: {
    sentence: string;
    totalFindings: number;
    criticalCount: number;
    highCount: number;
    warnCount: number;
    inconclusiveCount: number;
    invariantsPassed: number;
    invariantsFailed: number;
    newFlowsCount: number;
    closedFlowsCount: number;
  };
  /** Aset yang dijangkau pada baseline vs usulan (matriks diff permukaan serangan) */
  diff: {
    newFlows: FlowInfo[];
    closedFlows: FlowInfo[];
  };
  invariants: InvariantResult[];
  findings: Finding[];
  attackPaths: {
    assetId: string;
    assetName: string;
    baseline: AttackChain;
    proposed: AttackChain;
    changed: boolean;
  }[];
  assumptions: string[];
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  zones: Zone[];
  assets: Asset[];
  connections: Connection[];
  baselineRules: AclRule[];
  invariants: Invariant[];
  changeRequest: ChangeRequest;
}
