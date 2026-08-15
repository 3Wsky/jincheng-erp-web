"use client";

import {
  PermissionListSchema,
  RoleListSchema,
  RoleSchema,
  type Permission,
  type Role,
} from "@jincheng/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  pay: "付款执行",
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "请求失败，请稍后重试";
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store", ...init });
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

/** 编辑器状态:null=关闭;create=新建;否则为被编辑角色 */
type EditorState = { mode: "create" } | { mode: "edit"; role: Role } | null;

/**
 * 权限与审批管理台(AC 关联 docs/11 权限矩阵):
 * - Role × Action 矩阵展示(全部角色);
 * - 管理员(role:write)可创建/编辑/停用自定义角色;
 * - 内置角色(isSystem)锁定——权限由种子脚本权威管理,防误改破坏钱账分离等已确认规则;
 * - DataScope/Field/Approval 三维待签字,不提供编辑。
 */
export function RolesViewer() {
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [permissions, setPermissions] = useState<Permission[] | null>(null);
  const [canWrite, setCanWrite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  const [editor, setEditor] = useState<EditorState>(null);
  const [formCode, setFormCode] = useState("");
  const [formName, setFormName] = useState("");
  const [formPermissions, setFormPermissions] = useState<Set<string>>(new Set());
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => setRetryTick((value) => value + 1), []);

  /** 并行加载角色/权限/当前用户(判断管理权限) */
  useEffect(() => {
    let active = true;
    const handle = window.setTimeout(() => {
      void (async () => {
        if (active) {
          setLoading(true);
          setError(null);
        }
        try {
          const [rolesRaw, permissionsRaw, meRaw] = await Promise.all([
            fetchJson("/api/org/roles"),
            fetchJson("/api/org/permissions"),
            fetchJson("/api/auth/me").catch(() => null),
          ]);
          const roleList = RoleListSchema.parse(rolesRaw);
          const permissionList = PermissionListSchema.parse(permissionsRaw);
          const mePermissions =
            (meRaw as { permissions?: string[] } | null)?.permissions ?? [];
          if (active) {
            setRoles(roleList.items);
            setPermissions(permissionList.items);
            setCanWrite(mePermissions.includes("role:write"));
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

  const permissionIdByCode = useMemo(
    () => new Map((permissions ?? []).map((item) => [item.code, item.id])),
    [permissions],
  );

  const openCreate = useCallback(() => {
    setEditor({ mode: "create" });
    setFormCode("");
    setFormName("");
    setFormPermissions(new Set());
    setFormError(null);
  }, []);

  const openEdit = useCallback((role: Role) => {
    setEditor({ mode: "edit", role });
    setFormCode(role.code);
    setFormName(role.name);
    setFormPermissions(new Set(role.permissions));
    setFormError(null);
  }, []);

  const togglePermission = useCallback((code: string) => {
    setFormPermissions((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }, []);

  const saveRole = useCallback(async () => {
    if (!editor) return;
    setBusy(true);
    setFormError(null);
    const permissionIds = [...formPermissions]
      .map((code) => permissionIdByCode.get(code))
      .filter((id): id is string => Boolean(id));
    try {
      if (editor.mode === "create") {
        RoleSchema.parse(
          await fetchJson("/api/org/roles", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              code: formCode.trim(),
              name: formName.trim(),
              permissionIds,
            }),
          }),
        );
      } else {
        RoleSchema.parse(
          await fetchJson(`/api/org/roles/${editor.role.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: formName.trim(), permissionIds }),
          }),
        );
      }
      setEditor(null);
      refresh();
    } catch (saveError) {
      setFormError(messageOf(saveError));
    } finally {
      setBusy(false);
    }
  }, [editor, formCode, formName, formPermissions, permissionIdByCode, refresh]);

  const archiveRole = useCallback(
    async (role: Role) => {
      if (
        !window.confirm(
          `确认停用角色「${role.name}」？停用后不能分配给账号，可随时恢复。`,
        )
      ) {
        return;
      }
      setBusy(true);
      try {
        await fetchJson(`/api/org/roles/${role.id}/archive`, { method: "POST" });
        setEditor(null);
        refresh();
      } catch (archiveError) {
        window.alert(messageOf(archiveError));
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const restoreRole = useCallback(
    async (role: Role) => {
      setBusy(true);
      try {
        await fetchJson(`/api/org/roles/${role.id}/restore`, { method: "POST" });
        refresh();
      } catch (restoreError) {
        window.alert(messageOf(restoreError));
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

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
  const activeRoles = roles.filter((role) => !role.archivedAt);

  return (
    <div className="roles-viewer">
      {/* 权限维度落地说明：未签字维度必须明确标注，不得冒充已完成 */}
      <section className="panel roles-notice">
        <strong>权限维度落地情况</strong>
        <p>
          当前系统已落地 <b>Role × Action</b>{" "}
          两维校验（服务端每个请求逐项鉴权）；
          <b>DataScope（数据范围）、Field（字段脱敏）、Approval（审批额度）</b>
          三个维度待权限矩阵签字（docs/11）后接入。内置角色权限由种子脚本权威管理
          （防误改破坏钱账分离等已确认规则），管理员可创建自定义角色并配置权限。
        </p>
      </section>

      {/* 角色概览卡片 */}
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">角色管理</p>
            <h2>
              角色 {roles.length} 个（内置 {roles.filter((role) => role.isSystem).length}
              ） · 权限码 {permissions.length} 项
            </h2>
            <p>
              内置角色锁定不可改；自定义角色可配置权限、停用与恢复，全部操作落审计。
            </p>
          </div>
          {canWrite ? (
            <button className="button primary" type="button" onClick={openCreate}>
              新建自定义角色
            </button>
          ) : null}
        </div>
        <div className="roles-summary-grid">
          {roles.map((role) => (
            <article
              className={`role-card ${role.archivedAt ? "role-card-archived" : ""}`}
              key={role.id}
            >
              <strong>
                {role.isSystem ? <span aria-label="内置角色" title="内置角色（种子权威管理，不可改）">🔒 </span> : null}
                {role.name}
                {role.archivedAt ? (
                  <span className="status-badge status-inactive">已停用</span>
                ) : null}
              </strong>
              <span className="mono">{role.code}</span>
              <small>
                权限 {role.permissions.length} / {permissions.length} 项 · 账号{" "}
                {role.accountCount} 个
                {role.permissions.length === permissions.length ? " · 全部权限" : ""}
              </small>
              {canWrite && !role.isSystem ? (
                <div className="role-card-actions">
                  {role.archivedAt ? (
                    <button
                      className="button small"
                      disabled={busy}
                      type="button"
                      onClick={() => void restoreRole(role)}
                    >
                      恢复
                    </button>
                  ) : (
                    <button
                      className="button small"
                      disabled={busy}
                      type="button"
                      onClick={() => openEdit(role)}
                    >
                      编辑
                    </button>
                  )}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      {/* 角色编辑面板(仅自定义角色) */}
      {editor ? (
        <section className="panel role-editor">
          <div className="section-heading">
            <div>
              <p className="eyebrow">
                {editor.mode === "create" ? "新建自定义角色" : "编辑自定义角色"}
              </p>
              <h2>
                {editor.mode === "create"
                  ? "定义角色编码、名称与权限"
                  : `${editor.role.name}（${editor.role.code}）`}
              </h2>
            </div>
            <button
              className="button ghost"
              type="button"
              onClick={() => setEditor(null)}
            >
              收起
            </button>
          </div>

          <div className="role-editor-fields">
            <label>
              <span>角色编码 *</span>
              <input
                className="input mono"
                disabled={editor.mode === "edit"}
                maxLength={30}
                placeholder="如 AFTER_SALES（大写字母/数字/下划线）"
                value={formCode}
                onChange={(event) => setFormCode(event.target.value.toUpperCase())}
              />
            </label>
            <label>
              <span>角色名称 *</span>
              <input
                className="input"
                maxLength={30}
                placeholder="如 售后专员"
                value={formName}
                onChange={(event) => setFormName(event.target.value)}
              />
            </label>
          </div>

          <div className="role-editor-permissions">
            <h3>权限配置（已选 {formPermissions.size} 项）</h3>
            <p className="role-editor-hint">
              「role:write」仅内置系统管理员持有，自定义角色不可勾选，防止权限管理被接管。
            </p>
            {groups.map((group) => (
              <div className="role-editor-group" key={group.resource}>
                <strong>
                  {RESOURCE_LABELS[group.resource] ?? group.resource}
                  <small className="mono">{group.resource}</small>
                </strong>
                <div className="role-editor-options">
                  {group.items
                    .filter((permission) => permission.code !== "role:write")
                    .map((permission) => (
                    <label className="role-editor-option" key={permission.id}>
                      <input
                        checked={formPermissions.has(permission.code)}
                        type="checkbox"
                        onChange={() => togglePermission(permission.code)}
                      />
                      <span className="mono">{permission.code}</span>
                      <small>
                        {ACTION_LABELS[permission.action] ?? permission.action}
                      </small>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {formError ? <div className="alert error">{formError}</div> : null}

          <div className="role-editor-actions">
            <button
              className="button primary"
              disabled={
                busy ||
                !formName.trim() ||
                (editor.mode === "create" && !formCode.trim())
              }
              type="button"
              onClick={() => void saveRole()}
            >
              {busy ? "保存中…" : editor.mode === "create" ? "创建角色" : "保存修改"}
            </button>
            {editor.mode === "edit" ? (
              <button
                className="button ghost"
                disabled={busy}
                type="button"
                onClick={() => void archiveRole(editor.role)}
              >
                停用角色
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* 角色 × 权限矩阵（未停用角色） */}
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Role × Action 矩阵</p>
            <h2>角色 × 权限分配</h2>
            <p>行为权限码（按资源分组），列为角色；✓ 表示该角色拥有该权限。</p>
          </div>
        </div>
        <div className="sku-table-wrap roles-matrix-wrap">
          <table className="sku-table roles-matrix">
            <thead>
              <tr>
                <th className="matrix-permission-col">权限码</th>
                {activeRoles.map((role) => (
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
                  roles={activeRoles}
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
