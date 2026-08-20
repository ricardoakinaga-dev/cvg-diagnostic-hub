import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CVG Diagnostics Hub",
  description: "Central operacional de exames diagnósticos",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
