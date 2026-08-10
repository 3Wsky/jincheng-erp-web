#!/usr/bin/env bash
set -Eeuo pipefail

deploy_root="${1:-/www/wwwroot/our/jincheng-erp}"
release_dir="${2:?缺少发布目录}"
release_id="${3:?缺少发布版本}"

shared_dir="$deploy_root/shared"
env_file="$shared_dir/.env"
backup_dir="$deploy_root/backups"
current_link="$deploy_root/current"
lock_file="$deploy_root/.deploy.lock"

if [[ "$release_dir" != "$deploy_root"/releases/* ]]; then
  echo "发布目录不在允许范围：$release_dir" >&2
  exit 2
fi

mkdir -p "$shared_dir" "$backup_dir" "$deploy_root/releases"
chmod 700 "$backup_dir"

exec 9>"$lock_file"
if ! flock -n 9; then
  echo "已有另一个 ERP 部署正在执行，本次停止。" >&2
  exit 3
fi

required_commands=(node pnpm pm2 curl pg_dump)
for command_name in "${required_commands[@]}"; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "服务器缺少命令：$command_name" >&2
    exit 4
  fi
done

node_major="$(node -p "process.versions.node.split('.')[0]")"
if (( node_major < 24 )); then
  echo "锦程 ERP 要求 Node.js 24 或更高版本，当前为 $(node -v)。" >&2
  exit 5
fi

if [[ ! -f "$env_file" ]]; then
  if [[ -f "$release_dir/deploy/.env.production.example" ]]; then
    cp "$release_dir/deploy/.env.production.example" "$shared_dir/.env.example"
    chmod 600 "$shared_dir/.env.example"
  fi
  echo "服务器缺少 $env_file" >&2
  echo "已生成 $shared_dir/.env.example，请在宝塔中填写后另存为 .env 并设置 chmod 600。" >&2
  exit 6
fi

chmod 600 "$env_file"
ln -sfn "$env_file" "$release_dir/.env"

while IFS= read -r env_line || [[ -n "$env_line" ]]; do
  env_line="${env_line%$'\r'}"
  [[ -z "$env_line" || "$env_line" == \#* ]] && continue
  env_key="${env_line%%=*}"
  env_value="${env_line#*=}"
  if [[ ! "$env_key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    echo "生产 .env 包含无效变量名：$env_key" >&2
    exit 7
  fi
  export "$env_key=$env_value"
done < "$env_file"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "生产 .env 缺少 DATABASE_URL，停止部署。" >&2
  exit 10
fi

previous_release=""
if [[ -L "$current_link" ]]; then
  previous_release="$(readlink -f "$current_link")"
fi

cd "$release_dir"
pnpm install --frozen-lockfile

backup_stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_path="$backup_dir/jincheng-erp-$backup_stamp-$release_id.dump"
partial_backup="$backup_path.partial"

echo "部署前备份 PostgreSQL：$backup_path"
if ! pg_dump --format=custom --file="$partial_backup" "$DATABASE_URL"; then
  rm -f "$partial_backup"
  echo "数据库备份失败，未执行迁移，也未切换应用版本。" >&2
  exit 8
fi
mv "$partial_backup" "$backup_path"
chmod 600 "$backup_path"

echo "执行 Prisma 生产迁移"
pnpm --filter @jincheng/database exec prisma migrate deploy

next_link="$deploy_root/.current-$release_id"
ln -sfn "$release_dir" "$next_link"
mv -Tf "$next_link" "$current_link"

start_services() {
  local target="$1"
  cd "$target"
  pm2 startOrReload ecosystem.config.cjs --env production --update-env
}

check_url() {
  local url="$1"
  for _ in $(seq 1 20); do
    if curl -fsS --max-time 5 "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

start_services "$current_link"

if ! check_url "http://127.0.0.1:3101/api/v1/health" || ! check_url "http://127.0.0.1:3001/"; then
  echo "新版本健康检查失败。" >&2
  pm2 logs jincheng-erp-api --nostream --lines 60 || true
  pm2 logs jincheng-erp-web --nostream --lines 60 || true

  if [[ -n "$previous_release" && -d "$previous_release" ]]; then
    echo "应用回滚到：$previous_release" >&2
    rollback_link="$deploy_root/.rollback-$release_id"
    ln -sfn "$previous_release" "$rollback_link"
    mv -Tf "$rollback_link" "$current_link"
    start_services "$current_link"
  fi

  echo "数据库迁移不做自动降级；需要使用前向修复迁移。" >&2
  exit 9
fi

pm2 save
printf '%s\n' "$release_id" > "$deploy_root/.deployed-release"
echo "锦程 ERP 发布成功：$release_id"
