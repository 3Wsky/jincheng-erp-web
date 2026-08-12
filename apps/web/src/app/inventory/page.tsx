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
            实时查看公司门店及个人分销仓库存情况。每个仓库一张卡片、按台数排序，
            颜色越深库存越多，点击卡片查看仓库序列号明细。
          </p>
        </div>
      </header>
      <InventoryOverview />
    </main>
  );
}
