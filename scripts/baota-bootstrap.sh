#!/usr/bin/env bash
# 宝塔终端一键发布：拉 main → 本机构建 → 交给 server-deploy.sh（PM2 + 迁移 + 健康检查）
# 不会覆盖 shared/.env、shared/data、backups。
set -Eeuo pipefail

echo "锦程 ERP 宝塔发布开始 $(date '+%F %T')"

deploy_root="${ERP_PATH:-/www/wwwroot/our/jincheng-erp}"
repo_url="${ERP_REPO_URL:-https://github.com/3Wsky/jincheng-erp-web.git}"
src_dir="$deploy_root/src"
shared_dir="$deploy_root/shared"
env_file="$shared_dir/.env"

mkdir -p "$shared_dir/data" "$deploy_root/backups" "$deploy_root/releases"
chmod 700 "$deploy_root/backups"

# 宝塔常见软件路径（PostgreSQL / 面板安装的 Node）
export PATH="/www/server/pgsql/bin:/www/server/pgsql/14/bin:/www/server/pgsql/15/bin:/www/server/pgsql/16/bin:/usr/local/node24/bin:$PATH"

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

install_pkg() {
  local pkg="$1"
  if command -v yum >/dev/null 2>&1; then
    yum install -y "$pkg"
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y "$pkg"
  elif command -v apt-get >/dev/null 2>&1; then
    apt-get update -y
    apt-get install -y "$pkg"
  else
    echo "无法自动安装 $pkg，请在宝塔软件商店安装。" >&2
    return 1
  fi
}

ensure_git() {
  command -v git >/dev/null 2>&1 && return 0
  echo "未检测到 git，正在安装…"
  install_pkg git
}

ensure_node24() {
  if [[ -x /usr/local/node24/bin/node ]]; then
    export ERP_NODE_BIN=/usr/local/node24/bin/node
    export PATH="/usr/local/node24/bin:$PATH"
  fi
  if command -v node >/dev/null 2>&1; then
    local major
    major="$(node -p "process.versions.node.split('.')[0]")"
    if (( major >= 24 )); then
      return 0
    fi
    echo "当前 PATH 中的 Node 为 $(node -v)，锦程 ERP 需要 24+。将安装独立 Node 24，不替换现有版本。"
  else
    echo "未检测到 Node，正在安装独立 Node 24…"
  fi

  local arch node_arch ver prefix tarball url
  arch="$(uname -m)"
  case "$arch" in
    x86_64) node_arch=x64 ;;
    aarch64 | arm64) node_arch=arm64 ;;
    *)
      echo "不支持的 CPU 架构：$arch" >&2
      exit 5
      ;;
  esac
  # 使用当前 LTS 的 tar.gz：旧镜像地址的 .xz 经常下到 HTML，导致 xz: File format not recognized
  ver="v24.19.0"
  prefix="/usr/local/node24"
  tarball="node-${ver}-linux-${node_arch}.tar.gz"
  rm -rf "$prefix"
  mkdir -p "$prefix"
  rm -f "/tmp/${tarball}"
  for url in \
    "https://cdn.npmmirror.com/binaries/node/${ver}/${tarball}" \
    "https://npmmirror.com/mirrors/node/${ver}/${tarball}" \
    "https://nodejs.org/dist/${ver}/${tarball}"; do
    echo "下载 $url"
    if curl -fL --connect-timeout 15 --max-time 180 --retry 2 --progress-bar "$url" -o "/tmp/${tarball}"; then
      break
    fi
  done
  if [[ ! -s "/tmp/${tarball}" ]]; then
    echo "Node 24 安装包下载失败。" >&2
    exit 5
  fi
  if ! gzip -t "/tmp/${tarball}" 2>/dev/null; then
    echo "下载到的不是 gzip 包（多半是镜像返回了网页）。文件头：" >&2
    head -c 200 "/tmp/${tarball}" >&2 || true
    exit 5
  fi
  tar -xzf "/tmp/${tarball}" -C "$prefix" --strip-components=1
  rm -f "/tmp/${tarball}"
  if [[ ! -x "$prefix/bin/node" ]]; then
    echo "Node 24 解压后找不到 $prefix/bin/node" >&2
    exit 5
  fi
  export ERP_NODE_BIN="$prefix/bin/node"
  export PATH="$prefix/bin:$PATH"
  echo "已安装 Node $($prefix/bin/node -v)，路径 $ERP_NODE_BIN"
}

ensure_pnpm() {
  export COREPACK_NPM_REGISTRY="${COREPACK_NPM_REGISTRY:-https://registry.npmmirror.com}"
  export NPM_CONFIG_REGISTRY="${NPM_CONFIG_REGISTRY:-https://registry.npmmirror.com}"
  if command -v pnpm >/dev/null 2>&1; then
    return 0
  fi
  echo "未检测到 pnpm，改用国内镜像安装 pnpm 11…"

  if command -v npm >/dev/null 2>&1; then
    npm config set registry https://registry.npmmirror.com || true
    if npm install -g pnpm@11.16.0; then
      return 0
    fi
    echo "npm 全局安装 pnpm 失败，继续尝试其他方式…"
  fi

  if command -v corepack >/dev/null 2>&1; then
    corepack enable || true
    if corepack prepare pnpm@11.16.0 --activate; then
      return 0
    fi
    echo "corepack 安装 pnpm 失败，继续下载独立二进制…"
  fi

  local pnpm_bin="/usr/local/node24/bin/pnpm"
  mkdir -p "$(dirname "$pnpm_bin")"
  for url in \
    "https://cdn.npmmirror.com/binaries/pnpm/v11.16.0/pnpm-linuxstatic-x64" \
    "https://registry.npmmirror.com/-/binary/pnpm/v11.16.0/pnpm-linuxstatic-x64" \
    "https://github.com/pnpm/pnpm/releases/download/v11.16.0/pnpm-linux-x64"; do
    echo "下载 $url"
    if curl -fL --connect-timeout 15 --max-time 120 --progress-bar "$url" -o "$pnpm_bin"; then
      chmod +x "$pnpm_bin"
      break
    fi
  done

  command -v pnpm >/dev/null 2>&1 || {
    echo "pnpm 安装失败。请执行：npm config set registry https://registry.npmmirror.com && npm install -g pnpm@11.16.0" >&2
    exit 4
  }
}

ensure_git
ensure_node24
ensure_pnpm

for command_name in git node pnpm; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "服务器仍缺少命令：$command_name。" >&2
    exit 4
  fi
done

node_major="$(node -p "process.versions.node.split('.')[0]")"
if (( node_major < 24 )); then
  echo "锦程 ERP 要求 Node.js 24 或更高版本，当前为 $(node -v)。" >&2
  exit 5
fi

if [[ "${ERP_SKIP_GIT:-}" == "1" ]]; then
  echo "跳过 git 拉取（ERP_SKIP_GIT=1），使用现有 $src_dir"
elif [[ ! -d "$src_dir/.git" ]]; then
  echo "正在克隆仓库（国内若长时间无进度，用 Ctrl+C 后改走镜像）…"
  if ! git clone --branch main --depth 1 --progress "$repo_url" "$src_dir"; then
    echo "GitHub 直连失败，改用镜像…"
    git clone --branch main --depth 1 --progress \
      "https://gitclone.com/github.com/3Wsky/jincheng-erp-web.git" "$src_dir"
  fi
else
  echo "已有源码目录，拉取最新 main（最多等 45 秒）…"
  fetch_ok=0
  if command -v timeout >/dev/null 2>&1; then
    if GIT_HTTP_LOW_SPEED_LIMIT=1000 GIT_HTTP_LOW_SPEED_TIME=20 \
      timeout 45 git -C "$src_dir" fetch --depth 1 --progress origin main; then
      fetch_ok=1
    fi
  elif GIT_HTTP_LOW_SPEED_LIMIT=1000 GIT_HTTP_LOW_SPEED_TIME=20 \
    git -C "$src_dir" fetch --depth 1 --progress origin main; then
    fetch_ok=1
  fi
  if [[ "$fetch_ok" -eq 1 ]]; then
    git -C "$src_dir" checkout -B main origin/main
  else
    echo "git fetch 超时或失败，继续使用本地已有代码。"
  fi
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
export NPM_CONFIG_REGISTRY="${NPM_CONFIG_REGISTRY:-https://registry.npmmirror.com}"
pnpm config set registry https://registry.npmmirror.com
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
