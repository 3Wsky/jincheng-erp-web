import type { Metadata } from "next";
import { SystemPanel } from "./system-panel";

export const metadata: Metadata = {
  title: "系统设置",
  description:
    "系统健康检查、Outbox 待发布事件与审计日志查询（按操作人、对象、动作与 request_id 检索）",
};

export default function SystemHealthPage() {
  return (
    <main className="catalog-page">
      <header className="page-heading catalog-header">
        <div>
          <div className="breadcrumb">
            <span>组织与系统</span>
            <b>/</b>
            <strong>系统设置</strong>
          </div>
          <h1>系统设置</h1>
          <p>
            实时查看 API 与数据库健康状态、Outbox 待发布事件，并按动作与资源
            检索全量审计日志——每笔业务写入都能追溯到操作人与前后值。
          </p>
        </div>
        <div className="catalog-safety-note">
          <span className="safety-icon">✓</span>
          <span>
            <strong>只读运维页</strong>
            <small>审计日志需要 audit:read 权限 · 不提供任何写操作</small>
          </span>
        </div>
      </header>
      <SystemPanel />
    </main>
  );
}
