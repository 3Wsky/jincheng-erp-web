"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ErpIcon } from "./erp-icon";

interface MePayload {
  employeeName?: string;
  storeName?: string | null;
  organizationName?: string;
  roles?: Array<{ roleName: string }>;
}

/**
 * 顶部用户信息：从 /api/auth/me 读取当前登录账号。
 * 未登录或会话失效时展示默认状态，并提供退出登录入口。
 */
export function UserMenu() {
  const router = useRouter();
  const [user, setUser] = useState<MePayload | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: MePayload | null) => {
        if (active && payload) setUser(payload);
      })
      .catch(() => {
        // 后端不可用时保持默认展示
      });
    return () => {
      active = false;
    };
  }, []);

  async function logout() {
    setMenuOpen(false);
    await fetch("/api/auth/logout", { method: "POST", cache: "no-store" });
    router.push("/login");
    router.refresh();
  }

  const roleName = user?.roles?.[0]?.roleName ?? "管理员";
  const scope = [user?.storeName, user?.organizationName]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="user-menu">
      <button
        aria-expanded={menuOpen}
        aria-label="账号菜单"
        className="profile-button"
        onClick={() => setMenuOpen((open) => !open)}
        type="button"
      >
        <span className="avatar">
          {(user?.employeeName ?? "系").slice(0, 1)}
        </span>
        <span className="profile-copy">
          <strong>{user?.employeeName ?? "未登录"}</strong>
          <small>{scope ? `${roleName} · ${scope}` : roleName}</small>
        </span>
        <ErpIcon name="chevron" size={14} />
      </button>

      {menuOpen ? (
        <>
          <button
            aria-label="关闭账号菜单"
            className="user-menu-overlay"
            onClick={() => setMenuOpen(false)}
            type="button"
          />
          <div className="user-dropdown">
            <div className="user-dropdown-head">
              <strong>{user?.employeeName ?? "未登录用户"}</strong>
              <small>{user?.organizationName ?? "锦程 ERP"}</small>
            </div>
            <button
              onClick={() => {
                setMenuOpen(false);
                router.push("/account/password");
              }}
              type="button"
            >
              修改密码
            </button>
            <button className="danger" onClick={logout} type="button">
              退出登录
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
