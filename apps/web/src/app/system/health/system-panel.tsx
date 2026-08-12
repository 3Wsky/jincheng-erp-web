"use client";

import { useEffect, useState } from "react";
import { z } from "zod";

/**
 * 系统设置页专用 zod 契约：直接定义在组件文件内。
 * （packages/contracts 是并行任务的编辑区，本任务不改共享契约。）
 */
const SystemHealthSchema = z.object({
  service: z.string(),
  status: z.string(),
  time: z.iso.datetime(),
  startedAt: z.iso.datetime().optional(),
});

const OutboxPendingSchema = z.object({
  pending: z.number().int().nonnegative(),
});

/** 审计日志结构与 apps/api audit.service.ts 的 listAuditLogs 返回对应 */
const AuditLogItemSchema = z.object({
  id: z.string(),
  actorUserId: z.string().nullable(),
  actorName: z.string().nullable(),
  actorUsername: z.string().nullable(),
  action: z.string(),
  resource: z.string(),
  resourceId: z.string(),
  requestId: z.string().nullable(),
  ipAddress: z.string().nullable().optional(),
  beforeData: z.unknown().optional(),
  afterData: z.unknown().optional(),
  createdAt: z.iso.datetime(),
});

const AuditLogListSchema = z.object({
  items: z.array(AuditLogItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

type SystemHealth = z.infer<typeof SystemHealthSchema>;
type AuditLogList = z.infer<typeof AuditLogListSchema>;

const PAGE_SIZE = 20;
/** 过滤输入停顿多少毫秒后自动查询 */
const FILTER_DEBOUNCE_MS = 400;

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

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** 前后值 JSON 展示：null/undefined 显示占位符 */
function jsonText(value: unknown): string {
  if (value === null || value === undefined) return "—（无记录）";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function SystemPanel() {
  // ---- 健康与 Outbox ----
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [outboxPending, setOutboxPending] = useState<number | null>(null);
  const [outboxError, setOutboxError] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  /** 健康区失败重试计数 */
  const [statusRetryTick, setStatusRetryTick] = useState(0);

  // ---- 审计日志 ----
  const [audit, setAudit] = useState<AuditLogList | null>(null);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState("");
  const [resourceFilter, setResourceFilter] = useState("");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  /** 审计区失败重试计数 */
  const [auditRetryTick, setAuditRetryTick] = useState(0);

  /** 加载健康检查与 Outbox 计数；回调在定时器内执行，不属于 effect 内同步 setState */
  useEffect(() => {
    let active = true;
    const handle = window.setTimeout(() => {
      void (async () => {
        if (active) setStatusLoading(true);
        const [healthResult, outboxResult] = await Promise.allSettled([
          fetchJson("/api/system/health"),
          fetchJson("/api/system/audit/outbox/pending"),
        ]);
        if (!active) return;
        if (healthResult.status === "fulfilled") {
          try {
            setHealth(SystemHealthSchema.parse(healthResult.value));
            setHealthError(null);
          } catch (parseError) {
            setHealthError(messageOf(parseError));
          }
        } else {
          setHealthError(messageOf(healthResult.reason));
        }
        if (outboxResult.status === "fulfilled") {
          try {
            setOutboxPending(OutboxPendingSchema.parse(outboxResult.value).pending);
            setOutboxError(null);
          } catch (parseError) {
            setOutboxError(messageOf(parseError));
          }
        } else {
          setOutboxError(messageOf(outboxResult.reason));
        }
        setStatusLoading(false);
      })();
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [statusRetryTick]);

  /** 防抖查询审计日志（过滤条件/页码变化后统一走这里） */
  useEffect(() => {
    let active = true;
    const handle = window.setTimeout(() => {
      void (async () => {
        if (active) setAuditLoading(true);
        try {
          const params = new URLSearchParams({
            page: String(page),
            pageSize: String(PAGE_SIZE),
          });
          const action = actionFilter.trim();
          const resource = resourceFilter.trim();
          if (action) params.set("action", action);
          if (resource) params.set("resource", resource);
          const payload = AuditLogListSchema.parse(
            await fetchJson(`/api/system/audit/logs?${params}`),
          );
          if (active) {
            setAudit(payload);
            setAuditError(null);
            setExpandedId(null);
          }
        } catch (loadError) {
          if (active) setAuditError(messageOf(loadError));
        } finally {
          if (active) setAuditLoading(false);
        }
      })();
    }, FILTER_DEBOUNCE_MS);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [actionFilter, resourceFilter, page, auditRetryTick]);

  const apiOnline = health?.status === "ok";
  /** 数据库在线状态经由审计查询结果推断（/health 本身不探数据库） */
  const databaseOnline = audit !== null && auditError === null;

  return (
    <div className="system-panel">
      {/* 系统健康 + Outbox 卡片 */}
      <div className="system-cards">
        <article className="panel system-card">
          <div className="system-card-head">
            <strong>系统健康</strong>
            {statusLoading ? (
              <span className="status-badge status-preview">检查中…</span>
            ) : apiOnline ? (
              <span className="status-badge status-active">正常</span>
            ) : (
              <span className="status-badge status-danger">异常</span>
            )}
          </div>
          {healthError ? (
            <div className="alert error">
              健康检查失败：{healthError}
              <button
                className="button small"
                type="button"
                onClick={() => setStatusRetryTick((value) => value + 1)}
              >
                重试
              </button>
            </div>
          ) : (
            <dl className="system-facts">
              <div>
                <dt>服务名</dt>
                <dd className="mono">{health?.service ?? "…"}</dd>
              </div>
              <div>
                <dt>检查时间</dt>
                <dd>{health ? formatDateTime(health.time) : "…"}</dd>
              </div>
              <div>
                <dt>进程启动于</dt>
                <dd>{health?.startedAt ? formatDateTime(health.startedAt) : "—"}</dd>
              </div>
            </dl>
          )}
          <ul className="system-status-list">
            <li>
              <span>API 服务</span>
              <OnlineBadge loading={statusLoading} online={apiOnline} />
            </li>
            <li>
              <span>Web 服务</span>
              {/* 本页面由 Next.js 渲染并成功响应，Web 服务必然在线 */}
              <OnlineBadge loading={false} online />
            </li>
            <li>
              <span>数据库（经审计查询推断）</span>
              <OnlineBadge loading={auditLoading && audit === null} online={databaseOnline} />
            </li>
          </ul>
        </article>

        <article className="panel system-card">
          <div className="system-card-head">
            <strong>Outbox 待发布事件</strong>
            <span className="status-badge status-info">事件先落库</span>
          </div>
          {outboxError ? (
            <div className="alert error">
              Outbox 查询失败：{outboxError}
              <button
                className="button small"
                type="button"
                onClick={() => setStatusRetryTick((value) => value + 1)}
              >
                重试
              </button>
            </div>
          ) : (
            <>
              <strong className="system-big-number">
                {outboxPending === null ? "…" : outboxPending.toLocaleString("zh-CN")}
              </strong>
              <p className="system-card-note">
                业务写入与事件在同一事务落库；发布 Worker 尚未上线，
                事件暂存待发布队列（docs/19 已知项）。
              </p>
            </>
          )}
        </article>
      </div>

      {/* 审计日志查询 */}
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">审计查询</p>
            <h2>
              审计日志
              {audit ? ` · 共 ${audit.total.toLocaleString("zh-CN")} 条` : ""}
            </h2>
            <p>按动作与资源过滤，点击任意一行查看前后值 JSON 与请求上下文。</p>
          </div>
        </div>

        <div className="audit-filters">
          <input
            aria-label="按动作过滤"
            placeholder="按 action 过滤，如 auth.login"
            value={actionFilter}
            onChange={(event) => {
              setActionFilter(event.target.value);
              setPage(1);
            }}
          />
          <input
            aria-label="按资源过滤"
            placeholder="按 resource 过滤，如 Product / TransferOrder"
            value={resourceFilter}
            onChange={(event) => {
              setResourceFilter(event.target.value);
              setPage(1);
            }}
          />
        </div>

        {auditError ? (
          <div className="alert error">
            审计日志加载失败：{auditError}
            <button
              className="button small"
              type="button"
              onClick={() => setAuditRetryTick((value) => value + 1)}
            >
              重试
            </button>
          </div>
        ) : !audit ? (
          <p className="audit-empty">正在加载审计日志…</p>
        ) : audit.items.length === 0 ? (
          <p className="audit-empty">
            没有匹配的审计记录，请调整过滤条件。
          </p>
        ) : (
          <div className="sku-table-wrap">
            <table className="sku-table audit-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>操作人</th>
                  <th>动作</th>
                  <th>资源</th>
                  <th>资源 ID</th>
                  <th>Request ID</th>
                </tr>
              </thead>
              <tbody>
                {audit.items.map((item) => (
                  <AuditRow
                    expanded={expandedId === item.id}
                    item={item}
                    key={item.id}
                    onToggle={() =>
                      setExpandedId((current) =>
                        current === item.id ? null : item.id,
                      )
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {audit && audit.totalPages > 1 ? (
          <div className="search-pagination">
            <button
              className="button small"
              disabled={page <= 1 || auditLoading}
              type="button"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              上一页
            </button>
            <span>
              第 {audit.page} / {audit.totalPages} 页 · 共{" "}
              {audit.total.toLocaleString("zh-CN")} 条
            </span>
            <button
              className="button small"
              disabled={page >= audit.totalPages || auditLoading}
              type="button"
              onClick={() => setPage((value) => value + 1)}
            >
              下一页
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function OnlineBadge({ loading, online }: { loading: boolean; online: boolean }) {
  if (loading) {
    return <span className="status-badge status-preview">检查中…</span>;
  }
  return online ? (
    <span className="status-badge status-active">在线</span>
  ) : (
    <span className="status-badge status-danger">离线</span>
  );
}

function AuditRow({
  expanded,
  item,
  onToggle,
}: {
  expanded: boolean;
  item: z.infer<typeof AuditLogItemSchema>;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className={`audit-row ${expanded ? "expanded" : ""}`} onClick={onToggle}>
        <td>{formatDateTime(item.createdAt)}</td>
        <td>
          {item.actorName ?? "系统"}
          {item.actorUsername ? (
            <small className="audit-sub mono">{item.actorUsername}</small>
          ) : null}
        </td>
        <td className="mono">{item.action}</td>
        <td>{item.resource}</td>
        <td className="mono audit-clip">{item.resourceId}</td>
        <td className="mono audit-clip">{item.requestId ?? "—"}</td>
      </tr>
      {expanded ? (
        <tr className="audit-detail-row">
          <td colSpan={6}>
            <div className="audit-detail">
              <div>
                <strong>变更前（beforeData）</strong>
                <pre className="audit-json">{jsonText(item.beforeData)}</pre>
              </div>
              <div>
                <strong>变更后（afterData）</strong>
                <pre className="audit-json">{jsonText(item.afterData)}</pre>
              </div>
              <small>
                IP：{item.ipAddress ?? "—"} · 操作人 ID：{item.actorUserId ?? "—"}
              </small>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
