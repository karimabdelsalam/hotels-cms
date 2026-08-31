import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { getEnabledLocales, getMenu, getBrand } from "@fantazia/db/content";
import { dirFor, isKnownLocale, KNOWN_LOCALES } from "@/lib/routing";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import "../globals.css";

export function generateStaticParams() {
  return KNOWN_LOCALES.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isKnownLocale(locale)) notFound();

  setRequestLocale(locale);
  const messages = await getMessages();

  const [locales, primary, utility, footerC, brand] = await Promise.all([
    getEnabledLocales(),
    getMenu(locale, "primary"),
    getMenu(locale, "utility"),
    getMenu(locale, "footer_c"),
    getBrand(locale),
  ]);

  return (
    <html lang={locale} dir={dirFor(locale)}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Manrope:wght@300;400;500;600&family=IBM+Plex+Sans+Arabic:wght@300;400;500&display=swap"
        />
      </head>
      <body>
        <NextIntlClientProvider messages={messages}>
          <SiteHeader locale={locale} primary={primary} utility={utility} locales={locales} brand={brand} />
          <main id="content">{children}</main>
          <SiteFooter locale={locale} support={footerC} brand={brand} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
