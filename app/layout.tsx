import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mangystau Logistics — диспетчер грузоперевозок области",
  description:
    "Сборка рейсов из нескольких заявок: обратная загрузка вместо порожнего пробега и " +
    "консолидация мелких грузов в отдалённые посёлки Мангистауской области.",
};

/** The driver screen is used in a cab, so the layout must not zoom-jump. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
