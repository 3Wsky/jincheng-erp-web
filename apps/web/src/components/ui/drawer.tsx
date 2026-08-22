"use client";

import { useEffect, useRef } from "react";
import { isTopLayer, pushLayer, removeLayer } from "./layer-stack";

interface DrawerProps {
  /** 无障碍名称（如「调拨单详情」） */
  ariaLabel: string;
  /** 追加在抽屉容器上的业务样式类（如 transfer-drawer / customer-drawer） */
  className?: string;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * 统一右侧详情抽屉：遮罩点击 / Esc 关闭（仅最顶层浮层响应），
 * 打开时锁定背景滚动，关闭后焦点归还原元素。
 * 视觉沿用 globals.css 的 .drawer-overlay / .warehouse-drawer。
 */
export function Drawer({ ariaLabel, className, onClose, children }: DrawerProps) {
  const asideRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const layer = pushLayer();
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    asideRef.current?.focus({ preventScroll: true });

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && isTopLayer(layer)) {
        event.preventDefault();
        onCloseRef.current();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      removeLayer(layer);
      previousFocus?.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div
      className="drawer-overlay"
      role="presentation"
      onClick={() => onCloseRef.current()}
    >
      <aside
        aria-label={ariaLabel}
        aria-modal="true"
        className={`warehouse-drawer${className ? ` ${className}` : ""}`}
        ref={asideRef}
        role="dialog"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </aside>
    </div>
  );
}
