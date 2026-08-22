import type { Metadata } from "next";
import { OrganizationManager } from "./organization-manager";

export const metadata: Metadata = {
  title: "组织与员工",
  description: "维护组织、门店、员工档案与登录账号（REQ-AUTH、AC-F-001/002）",
};

export default async function OrganizationAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  // 顶栏「新建业务」快捷入口:?new=warehouse / ?new=employee 直接展开对应表单
  const requested = (await searchParams).new;
  const autoCreate =
    requested === "warehouse" || requested === "employee"
      ? requested
      : undefined;
  return (
    <main className="catalog-page">
      <header className="page-heading catalog-header">
        <div>
          <div className="breadcrumb">
            <span>组织与系统</span>
            <b>/</b>
            <strong>组织与员工</strong>
          </div>
          <h1>组织与员工</h1>
          <p>
            维护组织、门店、全部仓库（含个人仓）和员工账号。开通账号先划分角色；销售岗再划分所属门店与仓库。
          </p>
        </div>
        <div className="catalog-safety-note">
          <span className="safety-icon">✓</span>
          <span>
            <strong>账号安全</strong>
            <small>冻结立即生效 · 离职员工不可登录</small>
          </span>
        </div>
      </header>
      <OrganizationManager autoCreate={autoCreate} />
    </main>
  );
}
