#!/usr/bin/env bash
# Cloud Agent start 阶段：每次启动做运行时初始化（幂等，可重复执行）。
# 启动 PostgreSQL -> 确保角色/库 -> 应用迁移 -> 种子数据。
set -euo pipefail
cd "$(dirname "$0")/../.."

# shellcheck source=scripts/cloud/lib.sh
source scripts/cloud/lib.sh
select_node24

PG_VER="$(pg_major)"
PG_VER="${PG_VER:-16}"

# 启动数据库集群（已在运行则跳过）。
if ! sudo -u postgres pg_isready -q 2>/dev/null; then
  sudo pg_ctlcluster "${PG_VER}" main start || true
fi
for _ in $(seq 1 30); do
  if sudo -u postgres pg_isready -q 2>/dev/null; then break; fi
  sleep 1
done
if ! sudo -u postgres pg_isready -q 2>/dev/null; then
  echo "[start] PostgreSQL 未就绪" >&2
  exit 1
fi
echo "[start] PostgreSQL ${PG_VER} 已就绪"

# 确保业务角色与数据库存在（幂等）。
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='jincheng_erp'" | grep -q 1; then
  sudo -u postgres psql -c "CREATE ROLE jincheng_erp LOGIN PASSWORD 'change_me'"
fi
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='jincheng_erp'" | grep -q 1; then
  sudo -u postgres createdb -O jincheng_erp jincheng_erp
fi

# 应用迁移与种子（均为幂等）。业务数据只由单据/种子脚本驱动，不直接改余额。
pnpm --filter @jincheng/database exec prisma migrate deploy
pnpm db:seed

echo "[start] 完成"
