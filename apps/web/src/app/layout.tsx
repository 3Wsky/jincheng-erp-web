import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "锦程 ERP",
  description: "锦程内部 ERP 网站端",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
