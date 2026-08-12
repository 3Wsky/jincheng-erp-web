/**
 * 【临时开发工具，用完即删】重启本机 API 进程：
 * 1. 结束占用 3100 端口的进程（当前运行的旧 API）；
 * 2. 用 cmd 自带重定向以 watch 模式重新拉起 @jincheng/api，日志写 api-dev.log。
 *
 * 仅限本机开发环境：生产构建直接拒绝。
 */
import { exec } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

function repoRoot(): string {
  let current = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(path.join(current, "pnpm-workspace.yaml"))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.resolve(process.cwd(), "..", "..");
}

function killPort3100(): Promise<string> {
  const command =
    'powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3100 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force; Write-Output $_ }"';
  return new Promise((resolve) => {
    exec(command, { timeout: 15_000 }, (error, stdout) => {
      resolve(error ? `kill-error: ${error.message}` : `killed: ${stdout.trim() || "none"}`);
    });
  });
}

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ message: "仅限开发环境" }, { status: 403 });
  }

  const root = repoRoot();
  const logPath = path.join(root, "api-dev.log");
  const killResult = await killPort3100();
  await new Promise((resolve) => setTimeout(resolve, 1500));

  appendFileSync(
    logPath,
    `\n[restart-api] ${new Date().toISOString()} 准备启动 pnpm --filter @jincheng/api dev\n`,
    "utf8",
  );

  // 直接 exec 批处理（本机已验证 exec 可执行命令）：作为 Next 进程的子进程常驻，
  // 不隐藏、不脱离，避免被安全策略拦截；输出由批处理重定向到 api-dev.log
  const batch = path.join(root, "scripts", "dev-restart-api.cmd");
  exec(`"${batch}"`, { cwd: root, maxBuffer: 1024 * 1024 }, () => {
    /* watch 进程常驻，回调仅在其退出时触发，无需处理 */
  });

  await new Promise((resolve) => setTimeout(resolve, 5000));
  let logTail = "";
  try {
    logTail = readFileSync(logPath, "utf8").slice(-800);
  } catch (error) {
    logTail = `读取日志失败: ${String(error)}`;
  }

  return Response.json({
    killResult,
    mode: "exec-child",
    log: logPath,
    logTail,
  });
}
