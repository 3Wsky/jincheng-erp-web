"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ErpIcon } from "./erp-icon";
import { navigationGroups } from "@/lib/erp-navigation";

export function ErpShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push("/search");
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
          <div className="system-state">
            <span className="state-dot" />
            <span>
              <strong>网站端运行正常</strong>
              <small>数据库等待连接</small>
            </span>
          </div>
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
              <input aria-label="全局搜索" placeholder="搜索商品、SKU、IMEI、客户或单据" />
              <kbd>⌘ K</kbd>
            </form>
          </div>
          <div className="topbar-actions">
            <Link className="topbar-create" href="/tasks">
              <ErpIcon name="plus" size={17} />
              新建业务
            </Link>
            <Link aria-label="消息与异常" className="icon-button has-dot" href="/notifications">
              <ErpIcon name="bell" />
            </Link>
            <button className="profile-button" type="button">
              <span className="avatar">管</span>
              <span className="profile-copy">
                <strong>系统管理员</strong>
                <small>总部 · 管理员</small>
              </span>
              <ErpIcon name="chevron" size={14} />
            </button>
          </div>
        </header>
        <div className="erp-page-stage">{children}</div>
      </div>
    </div>
  );
}
