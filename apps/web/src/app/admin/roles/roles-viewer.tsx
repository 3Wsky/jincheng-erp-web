"use client";

import {
  PermissionListSchema,
  RoleListSchema,
  type Permission,
  type Role,
} from "@jincheng/contracts";
import { useEffect, useState } from "react";

/** 权限资源中文名（与种子 resource 字段对应） */
const RESOURCE_LABELS: Record<string, string> = {
  catalog: "货品主档",
  inventory: "库存",
  transfer: "调拨",
  procurement: "采购",
  sales: "销售",
  customer: "客户",
  finance: "财务",
  report: "报表",
  organization: "组织",
  account: "账号",
  role: "角色",
  audit: "审计",
};

/** 权限动作中文名 */
const ACTION_LABELS: Record<string, string> = {
  read: "读取",
  write: "写入",
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "请求失败，请稍后重试";
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string | string[];
    };
    const message = Array.isArray(payload.message)
      ? payload.message[0]
      : payload.message;
    throw new Error(message || `请求失败(HTTP ${response.status})`);
  }
  return response.json();
}

/** 按 resource 分组（保持 resource 首次出现顺序，组内按 action 升序） */
function groupByResource(
  permissions: Permission[],
): Array<{ resource: string; items: Permission[] }> {
  const groups = new Map<string, Permission[]>();
  for (const permission of permissions) {
    const bucket = groups.get(permission.resource);
    if (bucket) bucket.push(permission);
    else groups.set(permission.resource, [permission]);
  }
  return Array.from(groups.entries()).map(([resource, items]) => ({
    resource,
    items: [...items].sort((a, b) => a.action.localeCompare(b.action)),
  }));
}

/**
 * 权限与审批只读查看页（AC 关联 docs/11 权限矩阵）：
 * 角色卡片 + 角色 × 权限矩阵，数据来自 GET /api/org/roles 与 /api/org/permissions。
 * 当前系统仅落地 Role × Action 两维；DataScope/Field/Approval 待签字，不提供编辑。
 */
export function RolesViewer() {
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [permissions, setPermissions] = useState<Permission[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** 失败重试计数：自增触发加载 effect 重新执行 */
  const [retryTick, setRetryTick] = useState(0);

  /** 并行加载角色与权限清单；回调在定时器内执行，不属于 effect 内同步 setState */
  useEffect(() => {
    let active = true;
    const handle = window.setTimeout(() => {
      void (async () => {
        if (active) {
          setLoading(true);
          setError(null);
        }
        try {
          const [rolesRaw, permissionsRaw] = await Promise.all([
            fetchJson("/api/org/roles"),
            fetchJson("/api/org/permissions"),
          ]);
          const roleList = RoleListSchema.parse(rolesRaw);
          const permissionList = PermissionListSchema.parse(permissionsRaw);
          if (active) {
            setRoles(roleList.items);
            setPermissions(permissionList.items);
          }
        } catch (loadError) {
          if (active) setError(messageOf(loadError));
        } finally {
          if (active) setLoading(false);
        }
      })();
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [retryTick]);

  if (error) {
    return (
      <div className="alert error">
        角色与权限数据加载失败：{error}
        <button
          className="button small"
          type="button"
          onClick={() => setRetryTick((value) => value + 1)}
        >
          重试
        </button>
      </div>
    );
  }

  if (loading || !roles || !permissions) {
    return (
      <section className="panel roles-loading">
        <strong>正在加载角色与权限矩阵…</strong>
      </section>
    );
  }

  const groups = groupByResource(permissions);

  return (
    <div className="roles-viewer">
      {/* 权限维度落地说明：未签字维度必须明确标注，不得冒充已完成 */}
      <section className="panel roles-notice">
        <strong>权限维度落地情况</strong>
        <p>
          当前系统已落地 <b>Role × Action</b>{" "}
          两维校验（服务端每个请求逐项鉴权）；
          <b>DataScope（数据范围）、Field（字段脱敏）、Approval（审批额度）</b>
          三个维度待权限矩阵签字（docs/11）后接入，本页编辑功能同步待签字后开放。
        </p>
      </section>

      {/* 角色概览卡片 */}
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">角色概览</p>
            <h2>系统角色 {roles.length} 个 · 权限码 {permissions.length} 项</h2>
            <p>角色与权限均来自种子初始化，调整需走数据库变更并同步审计。</p>
          </div>
        </div>
        <div className="roles-summary-grid">
          {roles.map((role) => (
            <article className="role-card" key={role.id}>
              <strong>{role.name}</strong>
              <span className="mono">{role.code}</span>
              <small>
                权限 {role.permissions.length} / {permissions.length} 项
                {role.permissions.length === permissions.length
                  ? " · 全部权限"
                  : ""}
              </small>
            </article>
          ))}
        </div>
      </section>

      {/* 角色 × 权限矩阵（只读） */}
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Role × Action 矩阵</p>
            <h2>角色 × 权限分配（只读）</h2>
            <p>行为权限码（按资源分组），列为角色；✓ 表示该角色拥有该权限。</p>
          </div>
        </div>
        <div className="sku-table-wrap roles-matrix-wrap">
          <table className="sku-table roles-matrix">
            <thead>
              <tr>
                <th className="matrix-permission-col">权限码</th>
                {roles.map((role) => (
                  <th className="matrix-role-col" key={role.id}>
                    {role.name}
                    <small className="mono">{role.code}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <RoleMatrixGroup
                  group={group}
                  key={group.resource}
                  roles={roles}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function RoleMatrixGroup({
  group,
  roles,
}: {
  group: { resource: string; items: Permission[] };
  roles: Role[];
}) {
  return (
    <>
      <tr className="matrix-group-row">
        <td colSpan={roles.length + 1}>
          {RESOURCE_LABELS[group.resource] ?? group.resource}
          <small className="mono">{group.resource}</small>
        </td>
      </tr>
      {group.items.map((permission) => (
        <tr key={permission.id}>
          <td className="matrix-permission-col">
            <span className="mono">{permission.code}</span>
            <small>{ACTION_LABELS[permission.action] ?? permission.action}</small>
          </td>
          {roles.map((role) => {
            const granted = role.permissions.includes(permission.code);
            return (
              <td
                className={`matrix-cell ${granted ? "granted" : ""}`}
                key={role.id}
              >
                {granted ? "✓" : "—"}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
