#!/usr/bin/env bash
# Cloud Agent install 阶段：检出源码后刷新依赖与生成物（幂等）。
# 不在此启动数据库或服务，也不跑迁移（迁移放到 start.sh，按启动执行）。
set -euo pipefail
cd "$(dirname "$0")/../.."

# shellcheck source=scripts/cloud/lib.sh
source scripts/cloud/lib.sh
select_node24

echo "[install] node $(node -v) / pnpm $(pnpm -v)"

# 本地开发环境变量：不存在时从示例生成，已存在则保留（不覆盖真实配置）。
if [ ! -f .env ]; then
  cp .env.example .env
  secret="$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 48)"
  sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=${secret}|" .env
  sed -i "s|^CATALOG_WRITE_KEY=.*|CATALOG_WRITE_KEY=local_dev_write_key|" .env
  echo "[install] 已从 .env.example 生成 .env"
fi

pnpm install --frozen-lockfile
pnpm db:generate

# 构建共享包，使 api/web 在运行时解析到编译产物（package exports 的 default 指向 dist）。
pnpm --filter @jincheng/contracts build
pnpm --filter @jincheng/database build

echo "[install] 完成"
