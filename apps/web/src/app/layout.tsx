import type { Metadata } from "next";
import { ErpShell } from "@/components/erp-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "锦程 ERP · 企业经营管理平台",
    template: "%s · 锦程 ERP",
  },
  description: "锦程科技企业级进销存、客户与经营管理平台",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <ErpShell>{children}</ErpShell>
      </body>
    </html>
  );
}
