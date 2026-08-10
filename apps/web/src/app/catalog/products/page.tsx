import Link from "next/link";
import { CatalogManager } from "./catalog-manager";

export default function CatalogProductsPage() {
  return (
    <main className="catalog-page">
      <header className="catalog-header">
        <div>
          <Link className="back-link" href="/">
            ← 返回项目首页
          </Link>
          <p className="eyebrow">货品中心 · AC-F-003</p>
          <h1>商品、SKU 与管家婆货品导入</h1>
          <p className="lead">
            维护货品主档、条码和序列号规则；管家婆数据先预校验，再生成待归类商品。库存、成本和仓库映射不会在此页面直接写入。
          </p>
        </div>
        <div className="catalog-safety-note">
          <strong>数据安全边界</strong>
          <span>货品导入 ≠ 库存入账</span>
          <span>异常串号保留在错误清单</span>
        </div>
      </header>
      <CatalogManager />
    </main>
  );
}
