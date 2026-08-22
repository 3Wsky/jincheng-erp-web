import type { Metadata } from "next";
import { ProcurementManager } from "./procurement-manager";

export const metadata: Metadata = {
  title: "采购管理",
  description:
    "供应商、采购单三维度状态机(审批/付款/收货)、扫码收货生成序列号(docs/12 第 3 节)",
};

export default async function ProcurementOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  // 顶栏「新建业务」快捷入口:?new=1 直接打开新建表单
  const autoCreate = (await searchParams).new === "1";
  return (
    <main className="catalog-page">
      <header className="page-heading catalog-header">
        <div>
          <div className="breadcrumb">
            <span>进销存</span>
            <b>/</b>
            <strong>采购管理</strong>
          </div>
          <h1>采购管理</h1>
          <p>
            审批、付款、收货三个维度独立推进，系统持续显示已付未到与到货未付；
            每台设备扫码入库生成一机一码档案，库存与资金变化全部由单据驱动。
          </p>
        </div>
        <div className="catalog-safety-note">
          <span className="safety-icon">✓</span>
          <span>
            <strong>三维度聚合</strong>
            <small>审批 → 付款 / 收货 → 完成 · 一机一码入库</small>
          </span>
        </div>
      </header>
      <ProcurementManager autoCreate={autoCreate} />
    </main>
  );
}
