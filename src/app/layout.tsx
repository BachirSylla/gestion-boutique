import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { ConnectivityBanner, PwaProvider } from "@/shared/pwa";
import "./globals.css";

// Police auto-hébergée par Next.js (téléchargée au build, aucun appel à Google côté client).
const figtree = Figtree({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-figtree",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");
  return {
    title: { default: t("name"), template: `%s · ${t("name")}` },
    description: t("description"),
    applicationName: t("name"),
    appleWebApp: { capable: true, title: t("name"), statusBarStyle: "default" },
    icons: { icon: "/icons/icon.svg", apple: "/icons/apple-touch-icon.png" },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  themeColor: "#0E5A3A",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={figtree.variable}>
      <body className="min-h-dvh antialiased">
        <NextIntlClientProvider>
          <PwaProvider>
            <ConnectivityBanner />
            {children}
          </PwaProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
