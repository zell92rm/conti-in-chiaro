import type { Metadata } from "next";
import "./globals.css";
import "./open-banking-settings.css";

export const metadata: Metadata = {
  title: "Conti in Chiaro",
  description: "Il tuo quadro mensile, conto per conto.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body className="antialiased">{children}</body>
    </html>
  );
}
