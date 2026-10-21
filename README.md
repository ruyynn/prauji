# PRAUJI — Pre-deployment Validator

PRAUJI memvalidasi dampak keamanan sebuah perubahan firewall/ACL **sebelum** perubahan itu diterapkan. Pertanyaan intinya:

> Bagaimana mencegah tim membuat masalah baru saat memperbaiki masalah lama?

PRAUJI tidak hanya memeriksa apakah perbaikan yang dimaksud berhasil — ia memeriksa apa yang mungkin rusak akibat perbaikan tersebut: jalur serangan baru menuju aset kritis, layanan wajib yang terputus, aturan yang terlalu luas, hingga referensi aset yang tidak dikenal oleh model.

## Fitur

- Engine validasi deterministik: evaluasi ACL (first-match, default-deny), reachability, rantai kompromi multi-tahap, security invariants, dan attack surface diff.
- Verdict eksplisit: **PASS** / **FAIL** / **INCONCLUSIVE** — ketiadaan temuan pada model yang tidak lengkap tidak pernah dilaporkan sebagai "aman".
- Topologi interaktif dengan 4 mode tampilan (fisik, baseline, usulan, diff) dan inspektor aset.
- Workspace perubahan dengan toggle per aturan (blame-analysis) serta remediasi satu klik yang otomatis memvalidasi ulang.
- Riwayat validasi tersimpan sebagai bukti audit dan dapat diekspor JSON.
- Skenario demo SATUAN-NET 01: 5 zona kepercayaan, 9 aset, 8 aturan baseline, 5 security invariant, dan permintaan perubahan CHG-2026-047.

## Teknologi

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui · Prisma + SQLite · Zustand

## Menjalankan

Persyaratan: Node.js 20 atau lebih baru (atau Bun 1.1+).

    npm install
    npm run db:push
    npm run dev

Buka http://localhost:3000. Basis data SQLite sudah disertakan di `db/custom.db`; `db:push` hanya diperlukan bila berkas tersebut terhapus atau skema berubah.

## Uji regresi engine

    bun scripts/engine-selftest.ts

Tanpa Bun:

    npx tsx scripts/engine-selftest.ts

48 asersi memeriksa: baseline murni PASS, usulan asli FAIL (jalur baru DMZ → Database Inti, SSH terekspos, log SIEM terputus), pasca-remediasi PASS, referensi aset tak dikenal INCONCLUSIVE, determinisme engine, dan blame-analysis.

## Struktur

    src/lib/engine/         engine validasi murni (ACL, reachability, invariant, laporan)
    src/lib/scenario/       model topologi + change-set demo
    src/app/api/            endpoint validasi, perubahan, riwayat, reset
    src/components/prauji/  UI command-center (4 tab)
    prisma/schema.prisma    skema tabel WorkspaceState + ValidationRun

## Batasan model

- Koneksi pada model merepresentasikan kemungkinan routing; izin sepenuhnya ditentukan aturan ACL.
- Analisis berjalan pada model yang dideklarasikan — aset di luar model berada di luar jangkauan validasi, dan PRAUJI menyatakannya secara eksplisit (verdict INCONCLUSIVE) alih-alih diam-diam menganggapnya aman.
