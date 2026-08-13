"use client";

import { TaskSummarySchema, type TaskSummary } from "@jincheng/contracts";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

/** 分组图标(按 key 前缀映射,与业务域一致) */
const GROUP_ICONS: Record<string, string> = {
  transfer: "🔁",
  purchase: "🛒",
  stocktake: "📋",
  abnormal: "⚠️",
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "请求失败，请稍后重试";
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function TasksBoard() {
  const [summary, setSummary] = useState<TaskSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let active = true;
    const handle = window.setTimeout(() => {
      void (async () => {
        if (active) setLoading(true);
        try {
          const response = await fetch("/api/tasks/summary", {
            cache: "no-store",
          });
          if (!response.ok) {
            const payload = (await response.json().catch(() => ({}))) as {
              message?: string;
            };
            throw new Error(payload.message || "加载待办失败");
          }
          const payload = TaskSummarySchema.parse(await response.json());
          if (active) {
            setSummary(payload);
            setError(null);
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
  }, [refreshTick]);

  const refresh = useCallback(() => setRefreshTick((value) => value + 1), []);

  if (loading && !summary) {
    return (
      <section className="panel search-guide">
        <strong>正在汇总你的待办…</strong>
      </section>
    );
  }
  if (error) {
    return (
      <div className="alert error">
        {error}
        <button className="button small" type="button" onClick={refresh}>
          重试
        </button>
      </div>
    );
  }
  if (!summary) return null;

  if (summary.groups.length === 0) {
    return (
      <section className="panel search-guide">
        <strong>太好了，当前没有需要你处理的事项</strong>
        <small>
          调拨、采购、盘点产生的待办会按你的岗位权限自动出现在这里。
        </small>
      </section>
    );
  }

  return (
    <div className="tasks-board">
      <div className="search-summary-meta">
        共 <b>{summary.totalCount}</b> 项待处理 · {summary.groups.length} 类
        {loading ? " · 正在刷新…" : ""}
        <button className="button small tasks-refresh" type="button" onClick={refresh}>
          刷新
        </button>
      </div>
      <div className="tasks-grid">
        {summary.groups.map((group) => {
          const icon =
            GROUP_ICONS[group.key.split("-")[0] ?? ""] ?? "📌";
          return (
            <section className="panel task-group" key={group.key}>
              <Link className="task-group-head" href={group.route}>
                <span className="task-group-icon" aria-hidden="true">
                  {icon}
                </span>
                <strong>{group.label}</strong>
                <b className="task-group-count">{group.count}</b>
              </Link>
              <ul>
                {group.items.map((item) => (
                  <li key={item.id}>
                    <Link href={group.route}>
                      <span className="mono task-item-code">{item.code}</span>
                      <span className="task-item-title">{item.title}</span>
                      <time>{formatDateTime(item.at)}</time>
                    </Link>
                  </li>
                ))}
              </ul>
              {group.count > group.items.length ? (
                <Link className="task-group-more" href={group.route}>
                  查看全部 {group.count} 项 →
                </Link>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
