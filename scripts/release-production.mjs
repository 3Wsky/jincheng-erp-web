import { execFileSync, spawnSync } from "node:child_process";
import { chdir } from "node:process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
chdir(projectRoot);

const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function read(command, args) {
  return execFileSync(command, args, { encoding: "utf8" }).trim();
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`命令执行失败：${command} ${args.join(" ")}`);
  }
}

try {
  const branch = read("git", ["branch", "--show-current"]);
  if (branch !== "main") {
    throw new Error(
      `生产发布只能从 main 分支触发。当前分支：${branch}。请先合并并切换到 main。`,
    );
  }

  if (read("git", ["status", "--porcelain"])) {
    throw new Error(
      "工作区存在未提交文件。请先检查并提交，避免把不完整修改发布到生产环境。",
    );
  }

  const checks = [
    "db:validate",
    "db:generate",
    "lint",
    "typecheck",
    "test",
    "build",
  ];

  for (const check of checks) {
    console.log(`\n执行 pnpm ${check}`);
    run(pnpmCommand, [check]);
  }

  run("git", ["fetch", "origin", "main"]);
  const behind = Number(
    read("git", ["rev-list", "--count", "HEAD..origin/main"]),
  );
  if (behind > 0) {
    throw new Error(
      `本地 main 落后 GitHub ${behind} 个提交，请先执行 git pull --ff-only。`,
    );
  }

  console.log("\n质量门禁通过，正在推送 main 并触发 GitHub 自动部署。");
  run("git", ["push", "origin", "main"]);
  console.log(
    "发布已触发。请在 GitHub Actions 的 Deploy Jincheng ERP 页面查看进度。",
  );
} catch (error) {
  console.error(
    `\n发布未触发：${error instanceof Error ? error.message : error}`,
  );
  process.exitCode = 1;
}
