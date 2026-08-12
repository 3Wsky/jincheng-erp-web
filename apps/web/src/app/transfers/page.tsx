import type { Metadata } from "next";
import { TransferManager } from "./transfer-manager";

export const metadata: Metadata = {
  title: "调拨管理",
  description:
    "仓库间序列号商品调拨:双向握手状态机、锁库、在途与扫码接收(AC-F-008/009)",
};

export default function TransfersPage() {
  return (
    <main className="catalog-page">
      <header className="page-heading catalog-header">
        <div>
          <div className="breadcrumb">
            <span>进销存</span>
            <b>/</b>
            <strong>调拨管理</strong>
          </div>
          <h1>调拨管理</h1>
          <p>
            发出方与接收方分别确认，杜绝单边完成；库存变化全部由调拨单驱动，
            每台设备的锁定、在途、接收与差异都有完整流水与审计。
          </p>
        </div>
        <div className="catalog-safety-note">
          <span className="safety-icon">✓</span>
          <span>
            <strong>双向握手</strong>
            <small>锁库 → 发出 → 在途 → 扫码接收 · 差异可追溯</small>
          </span>
        </div>
      </header>
      <TransferManager />
    </main>
  );
}
