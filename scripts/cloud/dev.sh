#!/usr/bin/env bash
# Cloud Agent 开发终端：并行启动 web(3000) 与 api(3100) 开发服务器。
set -euo pipefail
cd "$(dirname "$0")/../.."

# shellcheck source=scripts/cloud/lib.sh
source scripts/cloud/lib.sh
select_node24

exec pnpm dev
