import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Скамейки — карта и рецензии",
  description:
    "Отмечайте скамейки на карте, оценивайте их и делитесь впечатлениями.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className="bg-slate-100 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
