import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LocaleProvider } from "@/components/locale-provider";
import { LOCALE_COOKIE, normalizeLocale } from "@/lib/i18n";
import "./globals.css";
import "./open-banking-settings.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = normalizeLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  return { title: "Conti in Chiaro", description: locale === "en" ? "Your monthly finances, account by account." : "Il tuo quadro mensile, conto per conto.", icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" } };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = normalizeLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  return (
    <html lang={locale}>
      <body className="antialiased"><LocaleProvider locale={locale}>{children}</LocaleProvider></body>
    </html>
  );
}
