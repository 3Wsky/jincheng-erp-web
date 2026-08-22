import type { Metadata } from "next";
import { CustomersManager } from "./customers-manager";

export const metadata: Metadata = {
  title: "客户管理",
  description:
    "统一客户档案:建档去重识别、回访记录与到期提醒(AC-F-015/016);手机号脱敏保护",
};

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  // 顶栏「新建业务」快捷入口:?new=1 直接打开建档表单
  const autoCreate = (await searchParams).new === "1";
  return (
    <main className="catalog-page">
      <header className="page-heading catalog-header">
        <div>
          <div className="breadcrumb">
            <span>客户中心</span>
            <b>/</b>
            <strong>客户管理</strong>
          </div>
          <h1>客户管理</h1>
          <p>
            统一客户档案：建档时自动识别重复手机号；每次回访实名记录，
            约定的下次回访到期自动进入「我的待办」。手机号全员脱敏显示。
          </p>
        </div>
        <div className="catalog-safety-note">
          <span className="safety-icon">✓</span>
          <span>
            <strong>隐私保护</strong>
            <small>手机号脱敏 · 重复识别 · 回访可追溯</small>
          </span>
        </div>
      </header>
      <CustomersManager autoCreate={autoCreate} />
    </main>
  );
}
