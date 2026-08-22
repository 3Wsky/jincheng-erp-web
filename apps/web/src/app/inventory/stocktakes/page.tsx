import type { Metadata } from "next";
import { StocktakeManager } from "./stocktake-manager";

export const metadata: Metadata = {
  title: "盘点管理",
  description:
    "按仓库整仓盘点:盘点期间仓库封存(禁止调拨与出入库),差异经审批后过账(AC-F-006/007)",
};

export default async function StocktakesPage({
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
            <strong>盘点管理</strong>
          </div>
          <h1>盘点管理</h1>
          <p>
            对指定仓库整仓盘点。开始盘点后该仓库自动封存——调拨与出入库全部禁止，
            避免盘点期间账实混乱；差异（盘亏/盘盈/串仓）经审批过账后解封。
          </p>
        </div>
        <div className="catalog-safety-note">
          <span className="safety-icon">✓</span>
          <span>
            <strong>盘库封存</strong>
            <small>盘点中禁止调库 · 差异可追溯 · 过账留流水</small>
          </span>
        </div>
      </header>
      <StocktakeManager autoCreate={autoCreate} />
    </main>
  );
}
