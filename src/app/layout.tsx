import type { Metadata, Viewport } from "next";
// Manrope из npm-пакета: сборка не зависит от fonts.googleapis.com
// (сайт собирается офлайн и на любой сети).
import "@fontsource-variable/manrope";
import "@fontsource-variable/unbounded";
import type { ReactNode } from "react";
import "./globals.css";

// Абсолютные адреса для превью ссылок (og:image и т.п.)
const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Скамейки — карта и рецензии",
  description:
    "Отмечайте скамейки на карте, оценивайте их и делитесь впечатлениями.",
  applicationName: "Скамейки",
  // iPhone: «На экран „Домой“» в Safari — полноэкранный режим без панелей браузера.
  // statusBarStyle "default" — контент начинается под статус-баром, шапка не залезает под вырез
  appleWebApp: {
    capable: true,
    title: "Скамейки",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  openGraph: {
    title: "Скамейки — карта и рецензии",
    description: "Отмечайте скамейки на карте, оценивайте их и делитесь впечатлениями.",
    siteName: "Скамейки",
    locale: "ru_RU",
    type: "website",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "Скамейки" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f0e6" },
    { media: "(prefers-color-scheme: dark)", color: "#111713" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className="bg-cream text-ink antialiased">{children}</body>
    </html>
  );
}
