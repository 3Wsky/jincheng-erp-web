#!/usr/bin/env bash
# =============================================================================
# 锦程 ERP 宝塔首次部署脚本（幂等，可重复运行以更新代码）
#
# 用途：在「已安装宝塔面板」的服务器上，以 root 在宝塔终端执行，完成首次部署：
#   - 建立受控目录（shared/.env、shared/data、backups 永不覆盖）
#   - 拉取/更新代码，构建，打 release 包，调用 scripts/server-deploy.sh
#     （由它完成 pg_dump 备份 → Prisma 迁移 → PM2 切换 → 健康检查）
#   - 写宝塔 Nginx vhost 反向代理，以后在宝塔「网站」里管理域名和 SSL
#
# 使用方法（宝塔面板 → 终端）：
#   chmod +x scripts/baota-first-deploy.sh
#   ./scripts/baota-first-deploy.sh
#   # 可选环境变量：
#   #   ERP_PATH=/www/wwwroot/our/jincheng-erp   部署根目录
#   #   ERP_DOMAIN=erp.xjshunwei.cn              宝塔站点域名
#   #   ERP_GIT_URL=https://github.com/3Wsky/jincheng-erp-web.git  首次 clone 地址
#   #   ERP_GIT_BRANCH=main                      部署分支
#   #   ERP_NODE_BIN=/www/server/nodejs/v24.x.x/bin/node  ERP 专用 Node 24
#   # 例：ERP_DOMAIN=erp.example.com ERP_GIT_URL=... ./scripts/baota-first-deploy.sh
#
# 如果仓库还不在服务器上，最短路径二选一：
#   A. 宝塔 → 网站 → Git（或任意目录）拉取仓库后，进入仓库目录运行本脚本；
#   B. 在宝塔终端执行：
#        export ERP_GIT_URL=https://github.com/3Wsky/jincheng-erp-web.git
#        curl -fsSL 或 手动把本脚本粘贴保存为 /root/baota-first-deploy.sh
#        bash /root/baota-first-deploy.sh
#      脚本会自动 clone 到 $ERP_PATH/repo。
#
# 首次运行会在生成 shared/.env 后安全停止，等你在宝塔 PostgreSQL 建库并
# 填好 DATABASE_URL 之后再跑一次即可完成部署。
#
# 本脚本不会：替换系统全局 Node（fzlsaas 可能在用 Node 22）、删除或修改
# 其他站点、申请 SSL（请在宝塔面板操作）、把任何密钥打印到日志。
# =============================================================================
set -euo pipefail

# 全部逻辑放进 main()，结尾一行调用：避免脚本自更新（git pull 覆盖自身）时
# bash 读到半新半旧的文件。
main() {
  local ERP_PATH="${ERP_PATH:-/www/wwwroot/our/jincheng-erp}"
  local ERP_DOMAIN="${ERP_DOMAIN:-erp.xjshunwei.cn}"
  local ERP_GIT_BRANCH="${ERP_GIT_BRANCH:-main}"
  local DEFAULT_ERP_PATH="/www/wwwroot/our/jincheng-erp"

  local shared_dir="$ERP_PATH/shared"
  local env_file="$shared_dir/.env"
  local repo_dir="$ERP_PATH/repo"

  log()  { printf '\n[锦程ERP部署] %s\n' "$*"; }
  warn() { printf '\n[锦程ERP部署][警告] %s\n' "$*" >&2; }
  die()  { printf '\n[锦程ERP部署][错误] %s\n' "$*" >&2; exit 1; }

  # ---------------------------------------------------------------- 前置检查
  if [[ "$(id -u)" -ne 0 ]]; then
    die "请以 root 在宝塔终端运行本脚本（需要写 /www/server/panel/vhost 和 PM2）。"
  fi

  if [[ ! -d /www/server/panel ]]; then
    die "未找到 /www/server/panel。请在已安装宝塔面板的服务器上运行本脚本；本机不是宝塔环境。"
  fi

  # ---------------------------------------------------------------- 受控目录
  # mkdir -p 只补缺，永不覆盖已有 shared/.env、shared/data、backups 内容。
  mkdir -p "$shared_dir/data" "$ERP_PATH/backups" "$ERP_PATH/releases"
  chmod 700 "$ERP_PATH/backups"

  # ---------------------------------------------------------------- Node 环境
  # 优先级：环境变量 ERP_NODE_BIN > shared/.env 里的 ERP_NODE_BIN > 系统 node。
  # 绝不卸载/替换系统 Node（其他项目如 fzlsaas 可能依赖 Node 22）。
  local node_bin="${ERP_NODE_BIN:-}"
  if [[ -z "$node_bin" && -f "$env_file" ]]; then
    node_bin="$(grep -E '^ERP_NODE_BIN=' "$env_file" | tail -n 1 | cut -d= -f2- | tr -d '\r' || true)"
  fi
  if [[ -n "$node_bin" ]]; then
    [[ -x "$node_bin" ]] || die "ERP_NODE_BIN 不可执行：$node_bin"
    export ERP_NODE_BIN="$node_bin"
    export PATH="$(dirname "$node_bin"):$PATH"
    log "使用 ERP 专用 Node：$node_bin"
  fi

  suggest_node24() {
    local candidate
    for candidate in /www/server/nodejs/v24*/bin/node "$HOME"/.nvm/versions/node/v24*/bin/node; do
      if [[ -x "$candidate" ]]; then
        printf '检测到本机已有 Node 24：%s\n' "$candidate"
        printf '可执行：export ERP_NODE_BIN=%s 后重跑本脚本。\n' "$candidate"
        return 0
      fi
    done
    printf '可在宝塔「Node.js 版本管理器」或 nvm 安装 Node 24（不要卸载系统 Node 22），\n'
    printf '然后 export ERP_NODE_BIN=<node24 绝对路径> 重跑本脚本。\n'
    return 0
  }

  command -v node >/dev/null 2>&1 || die "未找到 node。$(suggest_node24)"
  local node_major
  node_major="$(node -p 'process.versions.node.split(".")[0]')"
  if (( node_major < 24 )); then
    die "锦程 ERP 需要 Node.js 24+，当前 $(node -v)。请勿替换全局 Node（fzlsaas 可能在用）。$(suggest_node24)"
  fi
  log "Node 版本：$(node -v)"

  # ---------------------------------------------------------------- 依赖命令
  command -v pnpm >/dev/null 2>&1 \
    || die "未找到 pnpm。可用 Node 24 对应的 npm 安装：npm install -g pnpm@11.16.0"
  command -v pm2 >/dev/null 2>&1 \
    || die "未找到 pm2。可安装：npm install -g pm2（或在宝塔安装 PM2 管理器）"
  command -v pg_dump >/dev/null 2>&1 \
    || die "未找到 pg_dump（部署前必须能备份 PostgreSQL）。请在宝塔软件商店安装 PostgreSQL，或安装 postgresql 客户端。"
  command -v openssl >/dev/null 2>&1 || die "未找到 openssl（用于生成密钥）。"
  command -v git >/dev/null 2>&1 || die "未找到 git。请先安装：yum install -y git 或 apt install -y git"
  command -v curl >/dev/null 2>&1 || die "未找到 curl（用于健康检查）。"

  local nginx_bin=""
  if command -v nginx >/dev/null 2>&1; then
    nginx_bin="$(command -v nginx)"
  elif [[ -x /www/server/nginx/sbin/nginx ]]; then
    nginx_bin="/www/server/nginx/sbin/nginx"
  else
    warn "未找到 nginx，将跳过宝塔站点反代配置；请在宝塔软件商店安装 Nginx 后重跑。"
  fi
  log "依赖检查通过：pnpm $(pnpm -v)、pm2 $(pm2 -v 2>/dev/null | tail -n 1)、pg_dump 可用。"

  # ---------------------------------------------------------------- 代码来源
  # 优先已有代码：1) 脚本自身所在的仓库；2) $ERP_PATH/repo；3) ERP_GIT_URL clone。
  local script_dir script_repo=""
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [[ -f "$script_dir/../pnpm-workspace.yaml" && -d "$script_dir/../.git" ]]; then
    script_repo="$(cd "$script_dir/.." && pwd)"
  fi

  if [[ -n "$script_repo" && "$script_repo" != "$repo_dir" && ! -d "$repo_dir/.git" ]]; then
    log "检测到脚本位于仓库 $script_repo，直接使用该仓库作为代码来源。"
    repo_dir="$script_repo"
  fi

  if [[ -d "$repo_dir/.git" ]]; then
    log "更新已有仓库：$repo_dir（分支 $ERP_GIT_BRANCH）"
    if git -C "$repo_dir" fetch origin "$ERP_GIT_BRANCH"; then
      git -C "$repo_dir" checkout "$ERP_GIT_BRANCH"
      git -C "$repo_dir" pull --ff-only origin "$ERP_GIT_BRANCH"
    else
      warn "git fetch 失败（网络或凭据问题），继续使用服务器上已有代码部署。"
    fi
  elif [[ -n "${ERP_GIT_URL:-}" ]]; then
    log "clone 仓库到 $repo_dir"
    if ! git clone --branch "$ERP_GIT_BRANCH" "$ERP_GIT_URL" "$repo_dir"; then
      die "clone 失败。私有仓库请改用宝塔「网站 → Git」拉取，或在 GitHub 配置部署密钥（Deploy Key）后重试；不要把 token 写进脚本或仓库。"
    fi
  else
    die "服务器上还没有代码。请二选一后重跑：
  A. 用宝塔「网站 → Git」把仓库拉到 $repo_dir（或任意目录后进入该目录运行本脚本）；
  B. export ERP_GIT_URL=https://github.com/3Wsky/jincheng-erp-web.git 后重跑本脚本。"
  fi

  [[ -f "$repo_dir/deploy/.env.production.example" ]] \
    || die "仓库缺少 deploy/.env.production.example，请确认拉取的是 jincheng-erp-web 完整仓库。"

  # ---------------------------------------------------------------- 生产 .env
  if [[ ! -f "$env_file" ]]; then
    log "首次运行：生成 $env_file（已自动填入随机 SESSION_SECRET / CATALOG_WRITE_KEY）"
    cp "$repo_dir/deploy/.env.production.example" "$shared_dir/.env.example"
    cp "$repo_dir/deploy/.env.production.example" "$env_file"
    chmod 600 "$shared_dir/.env.example" "$env_file"

    local session_secret catalog_key
    session_secret="$(openssl rand -hex 32)"
    catalog_key="$(openssl rand -hex 32)"
    sed -i \
      -e "s/replace_with_at_least_32_random_characters/${session_secret}/" \
      -e "s/replace_with_a_different_random_secret/${catalog_key}/" \
      "$env_file"
    if [[ "$ERP_PATH" != "$DEFAULT_ERP_PATH" ]]; then
      sed -i "s|$DEFAULT_ERP_PATH|$ERP_PATH|g" "$env_file"
    fi

    cat <<EOF

============================================================
 第一阶段完成，本次部署到此安全停止（这是预期行为）。
============================================================
 已写入 $env_file（权限 600），
 SESSION_SECRET 和 CATALOG_WRITE_KEY 已自动生成，无需改动。

 你还需要做两件事，然后重跑本脚本：

 1. 宝塔 → 数据库 → PostgreSQL：创建数据库 jincheng_erp
    和同名最小权限账号（随机强密码，不复用其他项目）。
 2. 宝塔 → 文件 → $env_file：
    把 DATABASE_URL 改成真实连接串，例如
    postgresql://jincheng_erp:密码@127.0.0.1:5432/jincheng_erp
    （密码中的 @ : / # 等字符需 URL 编码）。

 完成后再执行一次本脚本即可自动完成构建、迁移和上线。
============================================================
EOF
    exit 0
  fi

  chmod 600 "$env_file"
  local db_url_line
  db_url_line="$(grep -E '^DATABASE_URL=' "$env_file" | tail -n 1 || true)"
  if [[ -z "$db_url_line" ]]; then
    die "$env_file 缺少 DATABASE_URL。请在宝塔文件管理中补充后重跑。"
  fi
  if [[ "$db_url_line" == *replace_with* ]]; then
    die "$env_file 的 DATABASE_URL 仍是占位符。
请先在宝塔 PostgreSQL 创建数据库 jincheng_erp，并在宝塔文件管理中把
DATABASE_URL 改成真实连接串，然后重跑本脚本。"
  fi

  # ---------------------------------------------------------------- 构建
  log "开始构建（pnpm install / db:generate / build，首次可能需要十几分钟）"
  cd "$repo_dir"
  pnpm install --frozen-lockfile
  pnpm db:generate
  pnpm build

  # ---------------------------------------------------------------- 打 release 包
  # 内容与 .github/workflows/deploy-production.yml 的 tar 清单保持一致，
  # 之后交给 scripts/server-deploy.sh（备份 → 迁移 → PM2 → 健康检查 → 失败回滚）。
  local release_id release_dir
  release_id="baota-$(date -u +%Y%m%dT%H%M%SZ)-$(git -C "$repo_dir" rev-parse --short HEAD 2>/dev/null || echo nogit)"
  release_dir="$ERP_PATH/releases/$release_id"
  log "打包 release：$release_dir"
  mkdir -p "$release_dir"
  tar -cf - \
    package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json \
    ecosystem.config.cjs deploy scripts/server-deploy.sh \
    apps/api/package.json apps/api/dist \
    apps/web/package.json apps/web/.next/standalone \
    packages/contracts/package.json packages/contracts/dist \
    packages/database/package.json packages/database/dist \
    packages/database/prisma packages/database/prisma.config.ts \
    | tar -xf - -C "$release_dir"

  chmod +x "$release_dir/scripts/server-deploy.sh"
  log "调用 server-deploy.sh（自动备份数据库、执行迁移、PM2 上线、健康检查）"
  bash "$release_dir/scripts/server-deploy.sh" "$ERP_PATH" "$release_dir" "$release_id"

  # ---------------------------------------------------------------- 宝塔 Nginx
  local nginx_note="未配置（本机无 nginx）"
  if [[ -n "$nginx_bin" ]]; then
    local vhost_dir="/www/server/panel/vhost/nginx"
    local vhost_conf="$vhost_dir/${ERP_DOMAIN}.conf"
    mkdir -p "$vhost_dir" /www/wwwlogs

    if [[ -f "$vhost_conf" ]] && grep -q 'proxy_pass http://127.0.0.1:3001' "$vhost_conf"; then
      log "宝塔 vhost 已存在且已配置 ERP 反代，不覆盖：$vhost_conf"
      nginx_note="已存在，未改动：$vhost_conf"
    else
      local vhost_backup=""
      if [[ -f "$vhost_conf" ]]; then
        vhost_backup="$vhost_conf.bak.$(date -u +%Y%m%dT%H%M%SZ)"
        cp "$vhost_conf" "$vhost_backup"
        warn "$vhost_conf 已存在但未配置 ERP 反代，原文件备份为 $vhost_backup。若该站点在宝塔里配过 SSL，请从备份合并回 SSL 段或在面板重新部署证书。"
      fi
      log "写入宝塔 vhost：$vhost_conf"
      {
        printf 'server {\n'
        printf '    listen 80;\n'
        printf '    server_name %s;\n' "$ERP_DOMAIN"
        printf '    access_log /www/wwwlogs/%s.log;\n' "$ERP_DOMAIN"
        printf '    error_log /www/wwwlogs/%s.error.log;\n\n' "$ERP_DOMAIN"
        cat "$repo_dir/deploy/nginx-jincheng-erp.conf.example"
        printf '}\n'
      } > "$vhost_conf"

      if "$nginx_bin" -t; then
        "$nginx_bin" -s reload || /etc/init.d/nginx reload || systemctl reload nginx
        nginx_note="已写入并重载：$vhost_conf"
      else
        mv "$vhost_conf" "$vhost_conf.rejected.$(date -u +%Y%m%dT%H%M%SZ)"
        [[ -n "$vhost_backup" ]] && cp "$vhost_backup" "$vhost_conf"
        warn "nginx -t 校验失败，已撤回本次 vhost 改动（应用本身已部署成功）。请检查 nginx 配置后手工加反代。"
        nginx_note="写入失败已撤回，请手工处理"
      fi
    fi
  fi

  # ---------------------------------------------------------------- 总结
  cat <<EOF

============================================================
 锦程 ERP 部署完成（release: $release_id）
============================================================
 目录
   部署根目录   $ERP_PATH
   当前版本     $ERP_PATH/current -> releases/$release_id
   生产配置     $env_file（宝塔 → 文件 可查看/修改，权限 600）
   管家婆文件   $shared_dir/data/
   数据库备份   $ERP_PATH/backups/（每次迁移前自动 pg_dump）
   代码仓库     $repo_dir

 进程与端口（只监听本机，不要在安全组开放）
   PM2: jincheng-erp-api  -> 127.0.0.1:3101
   PM2: jincheng-erp-web  -> 127.0.0.1:3001

 健康检查
   curl -fsS http://127.0.0.1:3101/api/v1/health
   curl -fsS http://127.0.0.1:3001/

 宝塔面板后续操作
   网站       Nginx 反代 $nginx_note
              （如需在「网站」列表中管理，可添加站点 $ERP_DOMAIN，
                根目录指向 $ERP_PATH 或 $ERP_PATH/current，
                再把 deploy/nginx-jincheng-erp.conf.example 粘入配置）
   SSL        宝塔 → 网站 → $ERP_DOMAIN → SSL → 申请 Let's Encrypt
              （需 DNS 已解析到本机；脚本不自动申请）
   文件       查看/修改 $env_file
   PM2        宝塔 PM2 管理器可见 jincheng-erp-api / jincheng-erp-web
              （首次使用 PM2 建议执行 pm2 startup 配置开机自启）
   PostgreSQL 数据库 jincheng_erp；备份在 $ERP_PATH/backups

 日常更新：重跑本脚本（自动 git pull + 构建 + 迁移 + 切换），
 或配置 GitHub Secrets 后走 Actions 自动部署（docs/19-宝塔GitHub自动部署.md）。
============================================================
EOF
}

main "$@"
exit $?
