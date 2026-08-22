"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { isTopLayer, pushLayer, removeLayer } from "./layer-stack";

/* ============ Toast（全局操作反馈） ============ */

type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastApi {
  /** 操作成功提示（约 3.2 秒自动消失） */
  success: (message: string) => void;
  /** 失败提示（停留更久，点击可关闭） */
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** 各类型停留时长：错误信息需要更长阅读时间 */
const TOAST_TTL_MS: Record<ToastType, number> = {
  success: 3200,
  info: 4000,
  error: 6500,
};

const TOAST_ICONS: Record<ToastType, string> = {
  success: "✓",
  error: "✕",
  info: "i",
};

/* ============ Confirm（统一确认对话框，替代 window.confirm） ============ */

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger 时确认按钮为红色（作废/停用等破坏性操作） */
  tone?: "default" | "danger";
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface PendingConfirm {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
}

/**
 * 全局反馈层：Toast + 确认对话框。
 * 挂载在根布局，业务组件通过 useToast() / useConfirm() 使用，
 * 替代 window.alert / window.confirm，保证全站反馈样式一致。
 */
export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextIdRef = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const push = useCallback(
    (type: ToastType, message: string) => {
      const id = nextIdRef.current++;
      setToasts((current) => [...current.slice(-4), { id, type, message }]);
      window.setTimeout(() => dismiss(id), TOAST_TTL_MS[type]);
    },
    [dismiss],
  );

  const toastApi = useMemo<ToastApi>(
    () => ({
      success: (message) => push("success", message),
      error: (message) => push("error", message),
      info: (message) => push("info", message),
    }),
    [push],
  );

  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      setPending({ options, resolve });
    });
  }, []);

  const settle = useCallback(
    (value: boolean) => {
      pending?.resolve(value);
      setPending(null);
    },
    [pending],
  );

  return (
    <ToastContext.Provider value={toastApi}>
      <ConfirmContext.Provider value={confirm}>
        {children}
        <div aria-live="polite" className="toast-stack">
          {toasts.map((toast) => (
            <button
              className={`toast toast-${toast.type}`}
              key={toast.id}
              onClick={() => dismiss(toast.id)}
              type="button"
            >
              <span aria-hidden className="toast-icon">
                {TOAST_ICONS[toast.type]}
              </span>
              <span className="toast-message">{toast.message}</span>
            </button>
          ))}
        </div>
        {pending ? (
          <ConfirmDialog options={pending.options} onSettle={settle} />
        ) : null}
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}

function ConfirmDialog({
  options,
  onSettle,
}: {
  options: ConfirmOptions;
  onSettle: (value: boolean) => void;
}) {
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    // 层级栈保证:确认框叠在抽屉上时,Esc 只关确认框不误关下层抽屉
    const layer = pushLayer();
    confirmRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && isTopLayer(layer)) {
        event.preventDefault();
        onSettle(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      removeLayer(layer);
    };
  }, [onSettle]);

  return (
    <div className="confirm-overlay" role="presentation" onClick={() => onSettle(false)}>
      <div
        aria-label={options.title}
        aria-modal="true"
        className="confirm-dialog"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <strong className="confirm-title">{options.title}</strong>
        {options.description ? (
          <p className="confirm-description">{options.description}</p>
        ) : null}
        <div className="confirm-actions">
          <button className="button ghost" type="button" onClick={() => onSettle(false)}>
            {options.cancelLabel ?? "取消"}
          </button>
          <button
            className={`button ${options.tone === "danger" ? "danger" : "primary"}`}
            ref={confirmRef}
            type="button"
            onClick={() => onSettle(true)}
          >
            {options.confirmLabel ?? "确认"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast 必须在 FeedbackProvider 内使用");
  return api;
}

export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext);
  if (!fn) throw new Error("useConfirm 必须在 FeedbackProvider 内使用");
  return fn;
}
