"use client";

import {
  PermissionListSchema,
  RoleAccountListSchema,
  RoleListSchema,
  RoleSchema,
  type Permission,
  type Role,
  type RoleAccount,
} from "@jincheng/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useConfirm, useToast } from "@/components/ui/feedback";

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

/** 每个权限码解锁的具体功能（给管理员看的人话说明） */
const PERMISSION_INFO: Record<string, string> = {
  "catalog:read": "查看商品/SKU/条码与官网价",
  "catalog:write": "建改商品与SKU、应用管家婆导入、同步官网价",
  "inventory:read": "库存总览、全局查货、单机档案、盘点查看",
  "inventory:write": "盘点开盘/扫码/审批过账等库存单据",
  "transfer:read": "查看调拨单与进度",
  "transfer:write": "调拨建单/审批/锁库/发货/接收/异常处理",
  "procurement:read": "查看供应商与采购单",
  "procurement:write": "采购建单/提交/审批/收货登记（管账，不含付款）",
  "procurement:pay": "采购付款执行（出纳专属，不含单据审批）",
  "sales:read": "查看销售单（模块待业务确认后上线）",
  "sales:write": "开销售单/退换（模块待业务确认后上线）",
  "customer:read": "查看客户与回访记录（手机号脱敏）",
  "customer:write": "客户建档、回访登记、作废",
  "finance:read": "查看财务数据（模块待上线）",
  "finance:write": "财务记账与单据审核（模块待上线）",
  "report:read": "报表与驾驶舱（待开发）",
  "organization:read": "查看组织/门店/仓库/员工",
  "organization:write": "维护组织、门店、员工档案",
  "account:write": "开通/冻结账号、重置密码、调整角色",
  "role:read": "查看角色与权限矩阵",
  "role:write": "创建/配置/停用自定义角色（仅内置系统管理员）",
  "audit:read": "查看审计日志",
};

/** 服务端强制执行中的权限边界（每条都有对应校验代码与测试） */
const BOUNDARY_RULES: Array<{
  title: string;
  detail: string;
  status: "已强制" | "待签字";
}> = [
  {
    title: "内置角色种子权威",
    detail: "9 个内置角色的权限由种子脚本管理，管理台修改/停用一律 422 拒绝，防误改破坏已确认规则。",
    status: "已强制",
  },
  {
    title: "权限管理不可外放",
    detail: "role:write 仅内置系统管理员持有；自定义角色勾选它会被服务端拒绝，权限管理台无法被接管。",
    status: "已强制",
  },
  {
    title: "钱账分离",
    detail: "采购单据/审批（procurement:write）与付款执行（procurement:pay）不可同角色、同账号兼有；财务与出纳不可互任（系统管理员为技术兜底除外）。",
    status: "已强制",
  },
  {
    title: "管理员角色只能管理员授",
    detail: "人事可开账号、配角色，但把「系统管理员」授予他人需要 role:write，人事操作会被 422 拒绝。",
    status: "已强制",
  },
  {
    title: "系统保底一个管理员",
    detail: "冻结最后一个可用管理员账号、或移除其管理员角色的操作会被拒绝，避免无人能进权限管理台。",
    status: "已强制",
  },
  {
    title: "停用角色即刻失效",
    detail: "已停用角色不能再分配；已挂账号的角色不能停用；登录守卫逐请求校验，停用后权限立即收回。",
    status: "已强制",
  },
  {
    title: "销售必须落门店+仓库",
    detail: "内置「销售」或含 sales:write 的自定义角色开账号时，必须先划分所属门店与仓库（个人仓挂到本人名下）。",
    status: "已强制",
  },
  {
    title: "数据范围/字段/审批额度",
    detail: "DataScope 查询过滤、字段脱敏细则（手机号已全员脱敏）、审批额度分级待权限矩阵签字后接入，当前不冒充已完成。",
    status: "待签字",
  },
];

/** 角色的默认数据范围与开账号要求(与后端 sales-assignment 逻辑一致) */
function roleScopeHint(role: Role): string {
  if (role.code === "ADMIN" || role.code === "BOSS") return "默认范围：全公司";
  if (
    role.code === "SALES" ||
    (!role.isSystem && role.permissions.includes("sales:write"))
  ) {
    return "默认范围：门店 · 开账号须划分门店+仓库";
  }
  return "默认范围：个人";
}

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
  const toast = useToast();
  const confirm = useConfirm();
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

  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null);
  const [holdersByRole, setHoldersByRole] = useState<
    Record<string, RoleAccount[]>
  >({});
  const [holdersLoading, setHoldersLoading] = useState(false);

  const refresh = useCallback(() => {
    setHoldersByRole({});
    setExpandedRoleId(null);
    setRetryTick((value) => value + 1);
  }, []);

  /** 展开角色卡片查看持有账号(懒加载,已加载的直接展示) */
  const toggleHolders = useCallback(
    async (role: Role) => {
      if (expandedRoleId === role.id) {
        setExpandedRoleId(null);
        return;
      }
      setExpandedRoleId(role.id);
      if (holdersByRole[role.id]) return;
      setHoldersLoading(true);
      try {
        const raw = await fetchJson(`/api/org/roles/${role.id}/accounts`);
        const list = RoleAccountListSchema.parse(raw);
        setHoldersByRole((current) => ({ ...current, [role.id]: list.items }));
      } catch (loadError) {
        toast.error(messageOf(loadError));
        setExpandedRoleId(null);
      } finally {
        setHoldersLoading(false);
      }
    },
    [expandedRoleId, holdersByRole, toast],
  );

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
      toast.success(
        editor.mode === "create"
          ? `角色「${formName.trim()}」已创建`
          : `角色「${formName.trim()}」已保存`,
      );
    } catch (saveError) {
      setFormError(messageOf(saveError));
    } finally {
      setBusy(false);
    }
  }, [editor, formCode, formName, formPermissions, permissionIdByCode, refresh, toast]);

  const archiveRole = useCallback(
    async (role: Role) => {
      const confirmed = await confirm({
        title: `停用角色「${role.name}」？`,
        description: "停用后不能再分配给账号，已有账号的角色无法停用；可随时恢复。",
        confirmLabel: "停用角色",
        tone: "danger",
      });
      if (!confirmed) return;
      setBusy(true);
      try {
        await fetchJson(`/api/org/roles/${role.id}/archive`, { method: "POST" });
        setEditor(null);
        refresh();
        toast.success(`角色「${role.name}」已停用`);
      } catch (archiveError) {
        toast.error(messageOf(archiveError));
      } finally {
        setBusy(false);
      }
    },
    [refresh, confirm, toast],
  );

  const restoreRole = useCallback(
    async (role: Role) => {
      setBusy(true);
      try {
        await fetchJson(`/api/org/roles/${role.id}/restore`, { method: "POST" });
        refresh();
        toast.success(`角色「${role.name}」已恢复`);
      } catch (restoreError) {
        toast.error(messageOf(restoreError));
      } finally {
        setBusy(false);
      }
    },
    [refresh, toast],
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
  // 钱账分离:配权时即时提示,提交前拦截(服务端同样校验)
  const moneyConflict =
    formPermissions.has("procurement:write") &&
    formPermissions.has("procurement:pay");

  return (
    <div className="roles-viewer">
      {/* 权限边界规则：每条"已强制"均有服务端校验与测试兜底；未签字维度明确标注 */}
      <section className="panel roles-notice">
        <div className="section-heading">
          <div>
            <p className="eyebrow">边界规则</p>
            <h2>权限划分边界（服务端逐请求强制）</h2>
            <p>
              以下规则写死在服务端校验里，管理台和接口绕不过去；标注「待签字」的维度不冒充已完成。
            </p>
          </div>
        </div>
        <div className="boundary-grid">
          {BOUNDARY_RULES.map((rule) => (
            <article className="boundary-card" key={rule.title}>
              <div className="boundary-card-head">
                <strong>{rule.title}</strong>
                <span
                  className={`status-badge ${rule.status === "已强制" ? "status-active" : "status-preview"}`}
                >
                  {rule.status}
                </span>
              </div>
              <p>{rule.detail}</p>
            </article>
          ))}
        </div>
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
                权限 {role.permissions.length} / {permissions.length} 项
                {role.permissions.length === permissions.length ? "（全部）" : ""}
              </small>
              <small className="role-scope-hint">{roleScopeHint(role)}</small>
              <div className="role-card-actions">
                <button
                  className="text-button"
                  disabled={role.accountCount === 0}
                  type="button"
                  onClick={() => void toggleHolders(role)}
                >
                  {expandedRoleId === role.id
                    ? "收起账号"
                    : `账号 ${role.accountCount} 个`}
                </button>
                {canWrite && !role.isSystem ? (
                  role.archivedAt ? (
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
                  )
                ) : null}
              </div>
              {expandedRoleId === role.id ? (
                <div className="role-holders">
                  {holdersLoading && !holdersByRole[role.id] ? (
                    <small>正在加载持有账号…</small>
                  ) : (
                    (holdersByRole[role.id] ?? []).map((holder) => (
                      <div className="role-holder-row" key={holder.accountId}>
                        <span>
                          {holder.employeeName}
                          <small className="mono"> {holder.username}</small>
                        </span>
                        <small>
                          {holder.storeName ?? "未归属门店"}
                          {holder.isFrozen ? " · 已冻结" : ""}
                        </small>
                      </div>
                    ))
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
              「role:write」仅内置系统管理员持有，自定义角色不可勾选；「采购单据/审批」与「付款执行」受钱账分离约束，不能同时勾选。
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
                        {PERMISSION_INFO[permission.code] ??
                          ACTION_LABELS[permission.action] ??
                          permission.action}
                      </small>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {moneyConflict ? (
            <div className="alert error">
              钱账分离：「采购单据/审批（procurement:write）」与「付款执行（procurement:pay）」不能配给同一个角色，请去掉其中一项。
            </div>
          ) : null}
          {formError ? <div className="alert error">{formError}</div> : null}

          <div className="role-editor-actions">
            <button
              className="button primary"
              disabled={
                busy ||
                moneyConflict ||
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
            <small>
              {PERMISSION_INFO[permission.code] ??
                ACTION_LABELS[permission.action] ??
                permission.action}
            </small>
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
