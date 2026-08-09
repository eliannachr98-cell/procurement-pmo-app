import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TenderScope",
  description: "Ελληνικό Παρατηρητήριο Δημοσίων Συμβάσεων",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="el">
      <body>{children}</body>
    </html>
  );
}

