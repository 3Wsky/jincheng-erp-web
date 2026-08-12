"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

/**
 * 修改密码表单:
 * - 首次登录/管理员重置后由登录页带 ?required=1 跳入,顶部显示强制改密提示;
 * - 改密成功后旧令牌全部失效(后端按 passwordChangedAt 吊销),引导重新登录。
 */
export function PasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const required = searchParams.get("required") === "1";

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致");
      return;
    }
    if (newPassword === oldPassword) {
      setError("新密码不能与原密码相同");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/password", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ oldPassword, newPassword }),
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          message?: string | string[];
        };
        const message = Array.isArray(payload.message)
          ? payload.message[0]
          : payload.message;
        setError(message || "修改失败，请稍后重试");
        return;
      }
      setDone(true);
      // 旧令牌已失效,清 Cookie 并回登录页
      await fetch("/api/auth/logout", { method: "POST", cache: "no-store" }).catch(
        () => undefined,
      );
      window.setTimeout(() => {
        router.push("/login");
        router.refresh();
      }, 1500);
    } catch {
      setError("无法连接服务，请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <section className="panel search-guide">
        <strong>密码修改成功</strong>
        <small>旧会话已全部失效，正在跳转登录页，请用新密码登录…</small>
      </section>
    );
  }

  return (
    <section className="panel password-panel">
      {required ? (
        <div className="alert error">
          出于账号安全，首次登录（或管理员重置密码后）必须修改密码才能继续使用系统。
        </div>
      ) : null}
      <form className="password-form" onSubmit={submit}>
        <label>
          <span>原密码</span>
          <input
            autoComplete="current-password"
            autoFocus
            maxLength={200}
            minLength={6}
            required
            type="password"
            value={oldPassword}
            onChange={(event) => setOldPassword(event.target.value)}
          />
        </label>
        <label>
          <span>新密码（至少 8 位）</span>
          <input
            autoComplete="new-password"
            maxLength={100}
            minLength={8}
            required
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </label>
        <label>
          <span>确认新密码</span>
          <input
            autoComplete="new-password"
            maxLength={100}
            minLength={8}
            required
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </label>
        {error ? (
          <p className="login-error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="button primary" disabled={busy} type="submit">
          {busy ? "正在提交…" : "修改密码"}
        </button>
      </form>
    </section>
  );
}
