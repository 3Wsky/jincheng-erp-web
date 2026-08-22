"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { ErpIcon } from "./erp-icon";
import { TasksBell } from "./tasks-bell";
import { UserMenu } from "./user-menu";
import { navigationGroups, type ErpIconName } from "@/lib/erp-navigation";

/** 顶栏「新建业务」快捷入口：跳转对应模块并直接打开新建表单（?new=1） */
const QUICK_CREATE_ITEMS: Array<{
  href: string;
  icon: ErpIconName;
  label: string;
  hint: string;
}> = [
  { href: "/transfers?new=1", icon: "transfer", label: "新建调拨单", hint: "仓库间调货，双向握手" },
  { href: "/procurement/orders?new=1", icon: "procurement", label: "新建采购单", hint: "供应商进货与扫码收货" },
  { href: "/inventory/stocktakes?new=1", icon: "inventory", label: "新建盘点单", hint: "整仓封存盘库" },
  { href: "/inventory/personal?new=1", icon: "catalog", label: "个人库存单", hint: "领用 / 归还 / 转交" },
  { href: "/crm/customers?new=1", icon: "crm", label: "客户建档", hint: "新客户档案与回访" },
];

export function ErpShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  // 快捷键标签按平台显示;SSR 阶段固定 Ctrl,挂载后按实际平台修正,避免水合不一致
  const [hotkeyLabel, setHotkeyLabel] = useState("Ctrl K");
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (/Mac|iPhone|iPad/.test(window.navigator.userAgent)) {
        setHotkeyLabel("⌘ K");
      }
    }, 0);
    return () => window.clearTimeout(handle);
  }, []);

  // Ctrl/⌘ + K 聚焦顶栏全局搜索（登录页无外壳，安全跳过）
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // 登录页使用独立布局，不渲染 ERP 外壳
  if (pathname === "/login") {
    return <>{children}</>;
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const keyword = searchRef.current?.value.trim() ?? "";
    searchRef.current?.blur();
    router.push(keyword ? `/search?q=${encodeURIComponent(keyword)}` : "/search");
  }

  return (
    <div className="erp-shell">
      <button
        aria-label="关闭导航"
        className={`sidebar-overlay ${mobileOpen ? "visible" : ""}`}
        onClick={() => setMobileOpen(false)}
        type="button"
      />
      <aside className={`erp-sidebar ${mobileOpen ? "mobile-open" : ""}`}>
        <Link className="brand" href="/" onClick={() => setMobileOpen(false)}>
          <span className="brand-mark">JC</span>
          <span className="brand-copy">
            <strong>锦程 ERP</strong>
            <small>企业经营管理平台</small>
          </span>
        </Link>

        <div className="workspace-switcher">
          <span className="workspace-logo">锦</span>
          <span>
            <small>当前组织</small>
            <strong>锦程科技 · 总部</strong>
          </span>
          <ErpIcon name="chevron" size={15} />
        </div>

        <nav className="erp-nav" aria-label="ERP 主导航">
          {navigationGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.items.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    className={`nav-link ${active ? "active" : ""}`}
                    href={item.href}
                    key={item.href}
                    onClick={() => setMobileOpen(false)}
                  >
                    <ErpIcon name={item.icon} />
                    <span>{item.label}</span>
                    {item.badge ? (
                      <small className={`nav-badge ${item.status === "blocked" ? "warning" : ""}`}>
                        {item.badge}
                      </small>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <Link
            className="system-state"
            href="/system/health"
            onClick={() => setMobileOpen(false)}
          >
            <span className="state-dot" />
            <span>
              <strong>系统健康检查</strong>
              <small>查看 API / 数据库 / 审计状态</small>
            </span>
          </Link>
          <span className="version">JINCHENG ERP · V0.2.0</span>
        </div>
      </aside>

      <div className="erp-main">
        <header className="erp-topbar">
          <div className="topbar-left">
            <button
              aria-label="打开导航"
              className="mobile-menu-button"
              onClick={() => setMobileOpen(true)}
              type="button"
            >
              <span />
              <span />
              <span />
            </button>
            <form className="global-search" onSubmit={submitSearch}>
              <ErpIcon name="search" size={18} />
              <input
                aria-label="全局搜索"
                placeholder="搜索商品、SKU、IMEI、客户或单据"
                ref={searchRef}
              />
              <kbd>{hotkeyLabel}</kbd>
            </form>
          </div>
          <div className="topbar-actions">
            <div className="quick-create">
              <button
                aria-expanded={createOpen}
                aria-haspopup="menu"
                className="topbar-create"
                onClick={() => setCreateOpen((open) => !open)}
                type="button"
              >
                <ErpIcon name="plus" size={17} />
                新建业务
              </button>
              {createOpen ? (
                <>
                  <button
                    aria-label="关闭快捷创建菜单"
                    className="quick-create-overlay"
                    onClick={() => setCreateOpen(false)}
                    type="button"
                  />
                  <nav aria-label="快捷创建" className="quick-create-menu">
                    {QUICK_CREATE_ITEMS.map((item) => (
                      <Link
                        href={item.href}
                        key={item.href}
                        onClick={() => setCreateOpen(false)}
                      >
                        <ErpIcon name={item.icon} size={17} />
                        <span>{item.label}</span>
                        <small>{item.hint}</small>
                      </Link>
                    ))}
                  </nav>
                </>
              ) : null}
            </div>
            <TasksBell />
            <UserMenu />
          </div>
        </header>
        <div className="erp-page-stage">{children}</div>
      </div>
    </div>
  );
}
