import type { Metadata } from "next";
import { PersonalStockManager } from "./personal-stock-manager";

export const metadata: Metadata = {
  title: "个人库存",
  description:
    "领用、归还、转交个人库存：提交锁库、接收方确认后落位（AC-F-007）",
};

export default async function PersonalStockPage({
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
            <strong>个人库存</strong>
          </div>
          <h1>个人库存</h1>
          <p>
            公共库领用到个人仓、个人仓归还公共库、员工之间转交，都必须走单据握手。
            提交即锁库，确认后才移仓写流水；销售只看本人，店长看本店。
          </p>
        </div>
        <div className="catalog-safety-note">
          <span className="safety-icon">✓</span>
          <span>
            <strong>单据驱动</strong>
            <small>禁止直接改仓 · 归还库管确认 · 转交接收人确认</small>
          </span>
        </div>
      </header>
      <PersonalStockManager autoCreate={autoCreate} />
    </main>
  );
}
