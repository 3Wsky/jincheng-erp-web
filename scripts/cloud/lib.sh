#!/usr/bin/env bash
# 锦程 ERP Cloud Agent 环境公共函数。
# 仅用于 Cursor Cloud Agent 环境初始化脚本，不参与业务运行时。
set -euo pipefail

# 选择 Node.js 24（工程 engines 要求 >=24）。
# Cloud Agent 的 /exec-daemon/node 可能是更低版本并抢占 PATH，这里显式前置 Node 24。
select_node24() {
  local bin
  bin="$(ls -d /home/ubuntu/.nvm/versions/node/v24.*/bin 2>/dev/null | sort -V | tail -1 || true)"
  if [ -z "${bin}" ] && [ -x /usr/bin/node ]; then
    bin="/usr/bin"
  fi
  export PATH="${bin:-/usr/bin}:${PATH}"
  corepack enable >/dev/null 2>&1 || true
  corepack prepare pnpm@11.16.0 --activate >/dev/null 2>&1 || true
}

# PostgreSQL 主集群版本目录（如 16）。
pg_major() {
  ls /usr/lib/postgresql 2>/dev/null | sort -V | tail -1
}
