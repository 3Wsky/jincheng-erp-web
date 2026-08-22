import type { Metadata } from "next";
import { RolesViewer } from "./roles-viewer";

export const metadata: Metadata = {
  title: "权限与审批",
  description:
    "角色权限管理台：内置角色锁定（seed 权威），管理员可创建/配置/停用自定义角色；DataScope/Field/Approval 维度待签字",
};

export default async function AdminRolesPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  // 顶栏「新建业务」快捷入口:?new=1 直接展开新建自定义角色编辑器
  const autoCreate = (await searchParams).new === "1";
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
            所有接口由服务端按 Role × Action 逐请求鉴权。内置角色锁定不可改，
            管理员可创建自定义角色并按模块勾选权限；系统始终保留至少一个可用管理员。
          </p>
        </div>
        <div className="catalog-safety-note">
          <span className="safety-icon">✓</span>
          <span>
            <strong>内置角色锁定</strong>
            <small>种子权威管理 · 自定义角色可配权 · 操作全落审计</small>
          </span>
        </div>
      </header>
      <RolesViewer autoCreate={autoCreate} />
    </main>
  );
}
