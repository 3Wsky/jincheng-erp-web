import type { Metadata } from "next";
import { OrganizationManager } from "./organization-manager";

export const metadata: Metadata = {
  title: "组织与员工",
  description: "维护组织、门店、员工档案与登录账号（REQ-AUTH、AC-F-001/002）",
};

export default function OrganizationAdminPage() {
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
            维护组织、门店、员工档案与登录账号；开通账号需分配角色。所有变更都会写入审计日志并记录操作人。
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
      <OrganizationManager />
    </main>
  );
}
