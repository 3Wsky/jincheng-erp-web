#!/usr/bin/env bash
# 宝塔终端一键发布：拉 main → 本机构建 → 交给 server-deploy.sh（PM2 + 迁移 + 健康检查）
# 不会覆盖 shared/.env、shared/data、backups。
set -Eeuo pipefail

deploy_root="${ERP_PATH:-/www/wwwroot/our/jincheng-erp}"
repo_url="${ERP_REPO_URL:-https://github.com/3Wsky/jincheng-erp-web.git}"
src_dir="$deploy_root/src"
shared_dir="$deploy_root/shared"
env_file="$shared_dir/.env"

mkdir -p "$shared_dir/data" "$deploy_root/backups" "$deploy_root/releases"
chmod 700 "$deploy_root/backups"

if [[ -f "$env_file" ]]; then
  while IFS= read -r env_line || [[ -n "$env_line" ]]; do
    env_line="${env_line%$'\r'}"
    [[ -z "$env_line" || "$env_line" == \#* ]] && continue
    env_key="${env_line%%=*}"
    env_value="${env_line#*=}"
    [[ "$env_key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    export "$env_key=$env_value"
  done < "$env_file"
  if [[ -n "${ERP_NODE_BIN:-}" ]]; then
    export PATH="$(dirname "$ERP_NODE_BIN"):$PATH"
  fi
fi

for command_name in git node pnpm; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "服务器缺少命令：$command_name。请在宝塔安装 Node 24、pnpm 11 和 Git。" >&2
    exit 4
  fi
done

node_major="$(node -p "process.versions.node.split('.')[0]")"
if (( node_major < 24 )); then
  echo "锦程 ERP 要求 Node.js 24+，当前为 $(node -v)。可在 .env 设置 ERP_NODE_BIN。" >&2
  exit 5
fi

if [[ ! -d "$src_dir/.git" ]]; then
  git clone --branch main --depth 1 "$repo_url" "$src_dir"
else
  git -C "$src_dir" fetch --depth 1 origin main
  git -C "$src_dir" checkout -B main origin/main
fi

cd "$src_dir"

if [[ ! -f "$env_file" ]]; then
  cp "$src_dir/deploy/.env.production.example" "$shared_dir/.env.example"
  chmod 600 "$shared_dir/.env.example"
  echo "第一次部署已停在配置步骤。"
  echo "请在宝塔「文件」打开 $shared_dir/.env.example，填好域名和 DATABASE_URL 后另存为 .env，权限设为 600。"
  echo "然后在宝塔终端再执行同一条一键命令。"
  exit 6
fi

release_id="$(git rev-parse --short HEAD)-$(date -u +%Y%m%dT%H%M%SZ)"
release_dir="$deploy_root/releases/$release_id"

echo "安装依赖并构建 $release_id"
pnpm install --frozen-lockfile
pnpm db:generate
pnpm build

mkdir -p "$release_dir/apps/api" "$release_dir/apps/web" \
  "$release_dir/packages/contracts" "$release_dir/packages/database" \
  "$release_dir/scripts" "$release_dir/deploy"

copy_item() {
  local from="$1"
  local to="$2"
  mkdir -p "$(dirname "$to")"
  cp -a "$from" "$to"
}

copy_item "$src_dir/package.json" "$release_dir/package.json"
copy_item "$src_dir/pnpm-lock.yaml" "$release_dir/pnpm-lock.yaml"
copy_item "$src_dir/pnpm-workspace.yaml" "$release_dir/pnpm-workspace.yaml"
copy_item "$src_dir/tsconfig.base.json" "$release_dir/tsconfig.base.json"
copy_item "$src_dir/ecosystem.config.cjs" "$release_dir/ecosystem.config.cjs"
copy_item "$src_dir/deploy/." "$release_dir/deploy/"
copy_item "$src_dir/scripts/server-deploy.sh" "$release_dir/scripts/server-deploy.sh"
copy_item "$src_dir/apps/api/package.json" "$release_dir/apps/api/package.json"
copy_item "$src_dir/apps/api/dist" "$release_dir/apps/api/dist"
copy_item "$src_dir/apps/web/package.json" "$release_dir/apps/web/package.json"
copy_item "$src_dir/apps/web/.next/standalone" "$release_dir/apps/web/.next/standalone"
copy_item "$src_dir/packages/contracts/package.json" "$release_dir/packages/contracts/package.json"
copy_item "$src_dir/packages/contracts/dist" "$release_dir/packages/contracts/dist"
copy_item "$src_dir/packages/database/package.json" "$release_dir/packages/database/package.json"
copy_item "$src_dir/packages/database/dist" "$release_dir/packages/database/dist"
copy_item "$src_dir/packages/database/prisma" "$release_dir/packages/database/prisma"
copy_item "$src_dir/packages/database/prisma.config.ts" "$release_dir/packages/database/prisma.config.ts"

chmod +x "$release_dir/scripts/server-deploy.sh"
"$release_dir/scripts/server-deploy.sh" "$deploy_root" "$release_dir" "$release_id"
