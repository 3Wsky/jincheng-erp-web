"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string | string[];
        user?: { employeeName?: string };
      };
      if (!response.ok) {
        const message = Array.isArray(payload.message)
          ? payload.message[0]
          : payload.message;
        setError(message || "登录失败，请稍后重试");
        return;
      }
      const next = searchParams.get("next");
      router.push(next && next.startsWith("/") ? next : "/");
      router.refresh();
    } catch {
      setError("无法连接登录服务，请确认后端已启动");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <header className="login-brand">
          <span className="login-brand-mark">JC</span>
          <div>
            <h1>锦程 ERP</h1>
            <p>企业经营管理平台</p>
          </div>
        </header>

        <form className="login-form" onSubmit={submit}>
          <label>
            <span>登录账号</span>
            <input
              autoComplete="username"
              autoFocus
              maxLength={100}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="请输入账号"
              required
              value={username}
            />
          </label>
          <label>
            <span>登录密码</span>
            <input
              autoComplete="current-password"
              maxLength={200}
              minLength={6}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="请输入密码"
              required
              type="password"
              value={password}
            />
          </label>

          {error ? (
            <p className="login-error" role="alert">
              {error}
            </p>
          ) : null}

          <button className="login-submit" disabled={busy} type="submit">
            {busy ? "正在登录…" : "登 录"}
          </button>
        </form>

        <footer className="login-footer">
          <span>账号或密码错误时连续失败会触发安全限制</span>
        </footer>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
