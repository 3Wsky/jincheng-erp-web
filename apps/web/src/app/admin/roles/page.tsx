import type { Metadata } from "next";
import { RolesViewer } from "./roles-viewer";

export const metadata: Metadata = {
  title: "权限与审批",
  description:
    "角色与权限码只读查看：Role × Action 矩阵展示，DataScope/Field/Approval 维度待权限矩阵签字",
};

export default function AdminRolesPage() {
  return (
    <main className="catalog-page">
      <header className="page-heading catalog-header">
        <div>
          <div className="breadcrumb">
            <span>组织与系统</span>
            <b>/</b>
            <strong>权限与审批</strong>
          </div>
          <h1>权限与审批</h1>
          <p>
            查看系统内置角色与权限码的分配关系。所有接口由服务端按
            Role × Action 逐请求鉴权，页面仅作只读展示。
          </p>
        </div>
        <div className="catalog-safety-note">
          <span className="safety-icon">✓</span>
          <span>
            <strong>只读页面</strong>
            <small>编辑功能待权限矩阵签字（docs/11）后开放</small>
          </span>
        </div>
      </header>
      <RolesViewer />
    </main>
  );
}
