import type { Metadata, Viewport } from "next";
// Manrope из npm-пакета: сборка не зависит от fonts.googleapis.com
// (сайт собирается офлайн и на любой сети).
import "@fontsource-variable/manrope";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Скамейки — карта и рецензии",
  description:
    "Отмечайте скамейки на карте, оценивайте их и делитесь впечатлениями.",
};

export const viewport: Viewport = {
  themeColor: "#047857",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className="bg-slate-100 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
