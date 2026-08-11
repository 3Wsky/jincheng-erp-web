import { InventoryOverview } from "@/components/inventory/inventory-overview";

export const metadata = {
  title: "库存管理",
};

export default function InventoryPage() {
  return (
    <main className="inventory-page">
      <header className="page-heading inventory-header">
        <div>
          <div className="breadcrumb">
            <span>进销存</span>
            <b>/</b>
            <strong>库存管理</strong>
          </div>
          <h1>库存总览</h1>
          <p>
            实时查看公司门店及个人分销仓库存情况。板块面积与台数成正比，
            悬停查看明细，点击板块查看仓库序列号。
          </p>
        </div>
      </header>
      <InventoryOverview />
    </main>
  );
}
