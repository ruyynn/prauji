/**
 * PRAUJI — skenario demonstrasi "SATUAN-NET 01".
 *
 * Topologi sintetis bergaya jaringan satuan: 5 zona kepercayaan, aset
 * kritis, dan satu permintaan perubahan (CHG-2026-047) yang niatnya
 * memperbaiki dua masalah lama — tetapi tanpa sengaja membuka jalur
 * baru ke database inti DAN memutus pengiriman log ke SIEM.
 */
import type { Scenario } from "@/lib/engine/types";

export const scenario: Scenario = {
  id: "satuan-net-01",
  name: "SATUAN-NET 01 — Lab Simulasi Segmentasi",
  description:
    "Topologi sintetis untuk demonstrasi validasi perubahan keamanan jaringan. Zone-based segmentation: Eksternal → DMZ → Internal → Admin/Keamanan. Aset kritis ditandai eksplisit.",

  zones: [
    {
      id: "eksternal",
      name: "Eksternal",
      trustLevel: 0,
      description: "Internet / pihak tidak tepercaya. Titik masuk analisis rantai kompromi.",
    },
    {
      id: "dmz",
      name: "DMZ",
      trustLevel: 1,
      description: "Perimeter layanan publik. Aset di sini diasumsikan dapat dikompromi.",
    },
    {
      id: "internal",
      name: "Internal",
      trustLevel: 2,
      description: "Jaringan operasional: aplikasi, database inti, terminal informasi.",
    },
    {
      id: "admin",
      name: "Admin",
      trustLevel: 3,
      description: "Zona manajemen. Akses hanya melalui Bastion Host.",
    },
    {
      id: "keamanan",
      name: "Keamanan",
      trustLevel: 3,
      description: "Zona pengawasan: SIEM/log collector. Harus menerima log dari seluruh server produksi.",
    },
  ],

  assets: [
    {
      id: "ext-hostile",
      name: "Internet / Hostile",
      zone: "eksternal",
      type: "adversary",
      criticality: "low",
      ip: "0.0.0.0/0",
      services: [],
      description:
        "Representasi pihak eksternal tidak tepercaya. Titik masuk perhitungan rantai kompromi.",
    },
    {
      id: "dmz-web01",
      name: "Web Server Publik",
      zone: "dmz",
      type: "server",
      criticality: "high",
      ip: "10.10.10.11",
      services: [{ port: 443, proto: "tcp", name: "HTTPS" }],
      description:
        "Front-end aplikasi pelayanan. Satu-satunya aset DMZ yang diekspos ke publik.",
    },
    {
      id: "int-app01",
      name: "Application Server",
      zone: "internal",
      type: "server",
      criticality: "high",
      ip: "10.20.30.11",
      services: [
        { port: 8080, proto: "tcp", name: "HTTP-App" },
        { port: 22, proto: "tcp", name: "SSH", mgmtOnly: true },
        { port: 8443, proto: "tcp", name: "Reporting-API" },
      ],
      description:
        "Server aplikasi internal. Layanan SSH hanya untuk pemeliharaan melalui Bastion.",
    },
    {
      id: "int-db01",
      name: "Database Inti",
      zone: "internal",
      type: "database",
      criticality: "critical",
      ip: "10.20.30.21",
      services: [{ port: 3306, proto: "tcp", name: "MySQL" }],
      description:
        "Aset paling kritis: data operasional satuan. Tidak boleh dijangkau langsung dari DMZ.",
    },
    {
      id: "int-kiosk01",
      name: "Kiosk Informasi Territorial",
      zone: "internal",
      type: "workstation",
      criticality: "low",
      ip: "10.20.30.51",
      services: [{ port: 80, proto: "tcp", name: "HTTP" }],
      description:
        "Terminal informasi publik internal. Ditandai audit sebagai aset kurang tepercaya.",
    },
    {
      id: "adm-ws01",
      name: "Workstation Administrator",
      zone: "admin",
      type: "workstation",
      criticality: "medium",
      ip: "10.30.40.11",
      services: [],
      description: "Komputer kerja administrator. Titik awal akses manajemen.",
    },
    {
      id: "adm-bastion",
      name: "Bastion Host",
      zone: "admin",
      type: "bastion",
      criticality: "high",
      ip: "10.30.40.21",
      services: [{ port: 22, proto: "tcp", name: "SSH", mgmtOnly: true }],
      description: "Satu-satunya gerbang sah menuju layanan manajemen di jaringan ini.",
    },
    {
      id: "adm-server01",
      name: "Admin Server",
      zone: "admin",
      type: "server",
      criticality: "critical",
      ip: "10.30.40.31",
      services: [
        { port: 22, proto: "tcp", name: "SSH", mgmtOnly: true },
        { port: 3389, proto: "tcp", name: "RDP", mgmtOnly: true },
      ],
      description: "Server manajemen inti. Hanya boleh diakses melalui Bastion Host.",
    },
    {
      id: "sec-siem01",
      name: "SIEM / Log Collector",
      zone: "keamanan",
      type: "security-appliance",
      criticality: "critical",
      ip: "10.40.50.11",
      services: [
        { port: 514, proto: "udp", name: "Syslog" },
        { port: 8443, proto: "tcp", name: "SIEM-API" },
      ],
      description:
        "Pusat pengawasan. Semua server produksi WAJIB dapat mengirim log ke aset ini.",
    },
  ],

  // Koneksi = kemungkinan routing (fisik/logis), BUKAN izin.
  // Segmentasi ditegakkan firewall — realisme inilah yang membuat
  // perubahan ACL berpotensi membuka celah.
  connections: [
    { from: "ext-hostile", to: "dmz-web01", note: "Jalur publik HTTPS" },
    { from: "dmz-web01", to: "int-app01", note: "Web → App (lintas zona)" },
    { from: "dmz-web01", to: "int-db01", note: "Routable via core switch — ACL wajib menahan" },
    { from: "int-app01", to: "int-db01", note: "App → Database" },
    { from: "int-app01", to: "sec-siem01", note: "Pengiriman log" },
    { from: "int-db01", to: "sec-siem01", note: "Pengiriman log" },
    { from: "dmz-web01", to: "sec-siem01", note: "Pengiriman log" },
    { from: "int-kiosk01", to: "sec-siem01", note: "Akses dashboard lokal / log" },
    { from: "adm-ws01", to: "adm-bastion", note: "Administrator masuk via bastion" },
    { from: "adm-bastion", to: "adm-server01", note: "Manajemen server" },
  ],

  // Kondisi awal yang telah disetujui dan dianggap valid.
  baselineRules: [
    {
      id: "FW-BASE-01",
      action: "allow",
      source: { zones: ["eksternal"] },
      destination: { assets: ["dmz-web01"] },
      service: { port: 443 },
      description: "Layanan publik HTTPS ke web server DMZ",
    },
    {
      id: "FW-BASE-02",
      action: "allow",
      source: { assets: ["dmz-web01"] },
      destination: { assets: ["int-app01"] },
      service: { port: 8080 },
      description: "Web server memanggil application server",
    },
    {
      id: "FW-BASE-03",
      action: "allow",
      source: { assets: ["int-app01"] },
      destination: { assets: ["int-db01"] },
      service: { port: 3306 },
      description: "Application server akses database inti",
    },
    {
      id: "FW-BASE-04",
      action: "allow",
      source: { zones: ["internal", "dmz"] },
      destination: { assets: ["sec-siem01"] },
      service: { port: 514 },
      description: "Pengiriman log Syslog dari seluruh server DMZ & Internal ke SIEM",
    },
    {
      id: "FW-BASE-05",
      action: "allow",
      source: { zones: ["internal"] },
      destination: { assets: ["sec-siem01"] },
      service: { port: 8443 },
      description: "Akses API SIEM dari jaringan internal (dashboard lokal)",
    },
    {
      id: "FW-BASE-06",
      action: "allow",
      source: { assets: ["adm-ws01"] },
      destination: { assets: ["adm-bastion"] },
      service: { port: 22 },
      description: "Administrator masuk ke Bastion Host",
    },
    {
      id: "FW-BASE-07",
      action: "allow",
      source: { assets: ["adm-bastion"] },
      destination: { assets: ["adm-server01"] },
      service: { any: true },
      description: "Manajemen Admin Server melalui Bastion (SSH/RDP)",
    },
    {
      id: "FW-BASE-99",
      action: "deny",
      source: { any: true },
      destination: { any: true },
      service: { any: true },
      description: "Default deny — seluruh aluran lain ditolak",
    },
  ],

  // Aturan yang WAJIB selalu benar apa pun perubahannya.
  invariants: [
    {
      id: "INV-001",
      type: "forbidden_path",
      name: "DMZ dilarang akses langsung ke Database Inti",
      description:
        "Tidak boleh ada aluran langsung dari zona DMZ ke Database Inti (int-db01) pada layanan apa pun.",
      severity: "critical",
      source: { zones: ["dmz"] },
      destination: { assets: ["int-db01"] },
      service: { any: true },
      rationale:
        "Segmentasi DMZ (CISA Network Segmentation Guidance; MITRE ATT&CK Network Segmentation) — aset perimeter tidak boleh menyentuh data inti.",
    },
    {
      id: "INV-002",
      type: "forbidden_path",
      name: "Eksternal tidak boleh menembus ke zona Internal/Admin/Keamanan",
      description:
        "Tidak ada aluran dari zona Eksternal langsung ke aset di Internal, Admin, atau Keamanan.",
      severity: "critical",
      source: { zones: ["eksternal"] },
      destination: { zones: ["internal", "admin", "keamanan"] },
      service: { any: true },
      rationale: "Prinsip perimeter: satu-satunya pintu masuk adalah layanan publik DMZ.",
    },
    {
      id: "INV-003",
      type: "restricted_access",
      name: "Layanan manajemen hanya via Bastion Host",
      description:
        "Layanan bertanda manajemen (SSH/RDP) hanya boleh diakses dari Bastion Host atau workstation admin.",
      severity: "high",
      source: { any: true },
      destination: { any: true },
      service: { mgmtOnly: true },
      allowedSources: { assets: ["adm-bastion", "adm-ws01"] },
      rationale:
        "Kontrol akses manajemen (NIST SP 800-207 Zero Trust — keputusan akses berbasis kebijakan, bukan lokasi).",
    },
    {
      id: "INV-004",
      type: "required_path",
      name: "Seluruh server produksi wajib kirim log ke SIEM",
      description:
        "Web Server, Application Server, dan Database Inti WAJIB dapat mengirim Syslog (514/udp) ke SIEM. Memutus aluran ini = menciptakan titik buta pengawasan.",
      severity: "high",
      source: { assets: ["dmz-web01", "int-app01", "int-db01"] },
      destination: { assets: ["sec-siem01"] },
      service: { port: 514 },
      rationale:
        "Kontinuitas kontrol deteksi — menutup alur log saat memperbaiki masalah lain adalah regresi keamanan yang tidak boleh terjadi diam-diam.",
    },
    {
      id: "INV-005",
      type: "restricted_access",
      name: "Admin Server hanya boleh diakses dari Bastion",
      description:
        "Semua layanan di Admin Server (adm-server01) hanya boleh dijangkau dari Bastion Host.",
      severity: "critical",
      source: { any: true },
      destination: { assets: ["adm-server01"] },
      service: { any: true },
      allowedSources: { assets: ["adm-bastion"] },
      rationale: "Zona manajemen militer: jalur administrasi tunggal, dapat diaudit.",
    },
  ],

  changeRequest: {
    id: "CHG-2026-047",
    title: "Perbaikan akses reporting DMZ & pengetatan zona Keamanan",
    description:
      "Dua tiket masalah lama: (1) tim reporting gagal menarik data Reporting-API dari Application Server karena aturan belum ada; (2) audit menemukan Kiosk Informasi Territorial dapat mengakses API SIEM dan harus diblokir. Niat teknisi baik — tetapi kedua aturan usulan ditulis terlalu luas.",
    author: "Teknisi Jaringan (demo)",
    submittedAt: "2026-10-19T08:30:00+07:00",
    changes: [
      {
        id: "CHG-2026-047-A",
        op: "add_rule",
        newRule: {
          id: "FW-NEW-020",
          action: "allow",
          source: { zones: ["dmz"] },
          destination: { zones: ["internal"] },
          service: { any: true },
          description: "Buka akses DMZ ke Internal agar reporting berjalan",
        },
        justification:
          "Tiket #2026-113: Reporting-API (8443) di Application Server tidak dapat diakses dari DMZ. Buka akses DMZ → Internal.",
        ticketRef: "#2026-113",
        enabledByDefault: true,
        remediation: {
          id: "REM-020",
          remediatedRule: {
            id: "FW-REM-020",
            action: "allow",
            source: { assets: ["dmz-web01"] },
            destination: { assets: ["int-app01"] },
            service: { port: 8443 },
            description: "Akses Reporting-API: DMZ Web → App Server port 8443 saja",
          },
          note: "Persempit ke sumber, tujuan, dan port yang benar-benar dibutuhkan tiket: dmz-web01 → int-app01:8443. Kebutuhan reporting tetap terpenuhi tanpa membuka DMZ ke seluruh zona Internal.",
        },
      },
      {
        id: "CHG-2026-047-B",
        op: "add_rule",
        newRule: {
          id: "FW-NEW-021",
          action: "deny",
          source: { zones: ["internal"] },
          destination: { zones: ["keamanan"] },
          service: { any: true },
          description: "Blokir akses Internal ke zona Keamanan hasil audit",
        },
        justification:
          "Tiket #2026-127: audit menemukan Kiosk Informasi Territorial (int-kiosk01) mengakses API SIEM. Blokir akses Internal → Keamanan.",
        ticketRef: "#2026-127",
        enabledByDefault: true,
        remediation: {
          id: "REM-021",
          remediatedRule: {
            id: "FW-REM-021",
            action: "deny",
            source: { assets: ["int-kiosk01"] },
            destination: { assets: ["sec-siem01"] },
            service: { port: 8443 },
            description: "Blokir khusus Kiosk → SIEM-API (8443) sesuai temuan audit",
          },
          note: "Blokir tepat sasaran: int-kiosk01 → sec-siem01:8443. Kiosk tetap tidak bisa mengakses API SIEM, sementara seluruh aluran log produksi ke SIEM tetap hidup.",
        },
      },
      {
        id: "CHG-2026-047-C",
        op: "add_rule",
        newRule: {
          id: "FW-NEW-022",
          action: "allow",
          source: { zones: ["dmz"] },
          destination: { assets: ["int-legacy-01"] },
          service: { port: 1433 },
          description: "Hidupkan kembali akses ke server legacy (eksperimen)",
        },
        justification:
          "Tiket #2026-134: tim meminta akses ke server lama untuk pengecekan data historis. (Aset tidak ada dalam model topologi.)",
        ticketRef: "#2026-134",
        enabledByDefault: false,
      },
    ],
  },
};
