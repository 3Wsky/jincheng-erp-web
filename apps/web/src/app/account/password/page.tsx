import type { Metadata } from "next";
import { Suspense } from "react";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = {
  title: "修改密码",
  description: "修改登录密码；修改后旧会话立即失效，需要重新登录",
};

export default function PasswordPage() {
  return (
    <main className="catalog-page">
      <header className="page-heading">
        <div>
          <div className="breadcrumb">
            <span>账号</span>
            <b>/</b>
            <strong>修改密码</strong>
          </div>
          <h1>修改密码</h1>
          <p>
            修改成功后，所有旧登录会话（含本次）立即失效，需要用新密码重新登录。
          </p>
        </div>
      </header>
      <Suspense>
        <PasswordForm />
      </Suspense>
    </main>
  );
}
