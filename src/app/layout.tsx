import type { Metadata, Viewport } from "next";
// Manrope из npm-пакета: сборка не зависит от fonts.googleapis.com
// (сайт собирается офлайн и на любой сети).
import "@fontsource-variable/manrope";
import "@fontsource-variable/unbounded";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Скамейки — карта и рецензии",
  description:
    "Отмечайте скамейки на карте, оценивайте их и делитесь впечатлениями.",
};

export const viewport: Viewport = {
  themeColor: "#f4f0e6",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className="bg-cream text-ink antialiased">{children}</body>
    </html>
  );
}
