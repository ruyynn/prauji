import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PRAUJI — Pre-deployment Validator",
  description:
    "PRAUJI memvalidasi dampak keamanan perubahan firewall/ACL sebelum diterapkan: attack path analysis, uji security invariants, dan attack surface diff. Tidak hanya memvalidasi perbaikan yang dimaksudkan — PRAUJI memeriksa apa yang mungkin rusak akibat perbaikan tersebut.",
  authors: [{ name: "Tim PRAUJI" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
