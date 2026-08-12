import type { Metadata } from "next";
import { GlobalSearch } from "./global-search";

export const metadata: Metadata = {
  title: "全局查货",
  description:
    "按 IMEI、SN、SKU 编码、条码、品牌与型号跨仓查找货品位置、状态与责任归属(AC-F-004/005)",
};

export default function SearchPage() {
  return (
    <main className="catalog-page">
      <header className="page-heading catalog-header">
        <div>
          <div className="breadcrumb">
            <span>经营总览</span>
            <b>/</b>
            <strong>全局查货</strong>
          </div>
          <h1>全局查货</h1>
          <p>
            一个搜索框覆盖 IMEI、SN、SKU 编码、条码、品牌与型号；
            结果展示货品当前位置、库存状态与责任归属，点击任意一台可查看完整流转时间线。
          </p>
        </div>
        <div className="catalog-safety-note">
          <span className="safety-icon">✓</span>
          <span>
            <strong>一机一码</strong>
            <small>IMEI/SN 公司范围唯一 · 状态实时</small>
          </span>
        </div>
      </header>
      <GlobalSearch />
    </main>
  );
}
