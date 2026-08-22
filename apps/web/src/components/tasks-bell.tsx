"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ErpIcon } from "./erp-icon";

/** 后台轮询间隔:待办数量不要求秒级实时,1 分钟足够 */
const REFRESH_MS = 60_000;

/**
 * 顶栏待办铃铛:显示当前用户真实待处理数量(来自 /tasks/summary,
 * 服务端按权限过滤)。未登录/无数据时只显示铃铛不显示徽章,不造假红点。
 * 路由切换时立即刷新,处理完单据回到列表数字即更新。
 */
export function TasksBell() {
  const pathname = usePathname();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/tasks/summary", { cache: "no-store" });
        if (!response.ok) {
          if (active) setCount(null);
          return;
        }
        const payload = (await response.json()) as { totalCount?: number };
        if (active) {
          setCount(
            typeof payload.totalCount === "number" ? payload.totalCount : null,
          );
        }
      } catch {
        if (active) setCount(null);
      }
    }
    const kickoff = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      active = false;
      window.clearTimeout(kickoff);
      window.clearInterval(timer);
    };
  }, [pathname]);

  return (
    <Link
      aria-label={count ? `我的待办(${count} 项待处理)` : "我的待办"}
      className="icon-button tasks-bell"
      href="/tasks"
    >
      <ErpIcon name="bell" />
      {count ? (
        <span aria-hidden className="bell-count">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
