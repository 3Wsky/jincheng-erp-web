import { CatalogManager } from "./catalog-manager";

export default function CatalogProductsPage() {
  return (
    <main className="catalog-page">
      <header className="page-heading catalog-header">
        <div>
          <div className="breadcrumb"><span>进销存</span><b>/</b><strong>货品中心</strong></div>
          <h1>货品中心</h1>
          <p>
            维护货品主档、条码和序列号规则；管家婆数据先预校验，再生成待归类商品。库存、成本和仓库映射不会在此页面直接写入。
          </p>
        </div>
        <div className="catalog-safety-note">
          <span className="safety-icon">✓</span>
          <span><strong>安全导入模式</strong><small>货品导入不等于库存入账</small></span>
        </div>
      </header>
      <CatalogManager />
    </main>
  );
}
