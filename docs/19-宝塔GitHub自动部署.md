# 锦程 ERP 宝塔与 GitHub 自动部署

## 1. 部署结论

本项目有两条部署路径，目标目录、端口、PM2 进程和安全约束完全一致：

- **路径 A（GitHub Actions 自动部署）**：复用 `jingcheng-saas/fzlsaas` 已验证的发布模式，需要仓库配置 SSH Secrets（见第 3 节）。
- **路径 B（宝塔终端首次部署）**：仓库还没有配置 SSH Secrets 时，由运维在宝塔终端直接运行 `scripts/baota-first-deploy.sh` 完成首次上线（见第 3.1 节）。

路径 A 的流程：

```text
本地 main → GitHub Actions 质量门禁 → SSH 上传发布包
→ 宝塔服务器备份 PostgreSQL → Prisma migrate deploy
→ PM2 切换 API/Web → 本机健康检查 → 宝塔 Nginx/SSL 对外服务
```

GitHub 只保存代码、Prisma 模型和迁移文件。真实 PostgreSQL 数据、生产 `.env`、数据库备份和管家婆文件全部保存在服务器受控目录，不上传 GitHub。

注意：云端开发 Agent 在未提供 SSH 密钥时无法登录服务器，也不允许使用历史记录中的连接信息；服务器上的操作只能由持有宝塔面板/SSH 权限的运维执行。GitHub Actions 自动部署（路径 A）同样必须先在仓库配置 Secrets 才会生效。

## 2. 固定端口与目录

| 项目       | 默认值                          | 说明                              |
| ---------- | ------------------------------- | --------------------------------- |
| Web        | `127.0.0.1:3001`                | Next.js，由宝塔 Nginx 反向代理    |
| API        | `127.0.0.1:3101`                | NestJS，健康接口 `/api/v1/health` |
| PM2 Web    | `jincheng-erp-web`              | 与现有 fzlsaas 进程不冲突         |
| PM2 API    | `jincheng-erp-api`              | 与现有 shunwei-api 不冲突         |
| 部署根目录 | `/www/wwwroot/our/jincheng-erp` | 可用 GitHub Secret 覆盖           |
| 生产配置   | `shared/.env`                   | 发布不会覆盖                      |
| 管家婆文件 | `shared/data/table_m.cds`       | 不进入 GitHub                     |
| 数据库备份 | `backups/*.dump`                | 每次迁移前生成，不自动删除        |

## 3. GitHub Secrets

新仓库 `3Wsky/jincheng-erp-web` 当前没有 Actions Secrets。需要在仓库 `Settings → Secrets and variables → Actions` 中增加：

| Secret            | 是否可复用 fzlsaas | 说明                                       |
| ----------------- | ------------------ | ------------------------------------------ |
| `SERVER_HOST`     | 是                 | 同一台宝塔服务器                           |
| `SERVER_PORT`     | 是                 | SSH 端口                                   |
| `SERVER_USER`     | 是                 | SSH 用户                                   |
| `SERVER_SSH_KEY`  | 是                 | SSH 私钥全文                               |
| `ERP_DEPLOY_PATH` | 新增，可选         | 不填时使用 `/www/wwwroot/our/jincheng-erp` |

GitHub 不允许读取旧仓库 Secret 的明文，因此需要从原安全记录重新填入新仓库，或改为组织级 Secret 后授权两个仓库。

## 3.1 路径 B：无 GitHub SSH Secrets 时，在宝塔终端首次部署

仓库尚未配置 `SERVER_HOST` / `SERVER_USER` / `SERVER_SSH_KEY` 时，用 `scripts/baota-first-deploy.sh` 在服务器上直接完成首次部署。脚本幂等，之后每次重跑都会自动 `git pull` 更新代码并走同一套「备份 → 迁移 → PM2 → 健康检查」流程（内部复用 `scripts/server-deploy.sh`）。

**第一步：把仓库和脚本弄上服务器（最短路径二选一）**

- 宝塔 → 网站 → Git（或任意目录）拉取 `https://github.com/3Wsky/jincheng-erp-web.git`，进入仓库目录运行脚本；
- 或在宝塔终端直接让脚本自己 clone：先把 `scripts/baota-first-deploy.sh` 内容粘贴保存为服务器上任意文件（例如 `/root/baota-first-deploy.sh`），然后：

```bash
export ERP_GIT_URL=https://github.com/3Wsky/jincheng-erp-web.git
bash /root/baota-first-deploy.sh
```

私有仓库 clone 失败时，改用宝塔 Git 功能或 GitHub Deploy Key，不要把 token 写进脚本或仓库。

**第二步：在宝塔终端以 root 运行**

```bash
cd /path/to/jincheng-erp-web
chmod +x scripts/baota-first-deploy.sh
# 可选：ERP_DOMAIN=erp.example.com ERP_GIT_URL=... ./scripts/baota-first-deploy.sh
./scripts/baota-first-deploy.sh
```

首次运行会在生成 `shared/.env`（自动填入随机 `SESSION_SECRET` / `CATALOG_WRITE_KEY`）后**安全停止**，提示你：

1. 宝塔 → 数据库 → PostgreSQL 创建数据库 `jincheng_erp` 和同名账号；
2. 宝塔 → 文件 → `shared/.env` 把 `DATABASE_URL` 改成真实连接串。

完成后再跑一次脚本，即自动构建、备份数据库、执行迁移、PM2 上线并写入宝塔 Nginx 反代（`/www/server/panel/vhost/nginx/域名.conf`，已有 ERP 反代配置时不覆盖）。SSL 不由脚本申请，部署完成后到宝塔 → 网站 → 该站点 → SSL 申请 Let's Encrypt。

脚本的安全约束：永不覆盖已存在的 `shared/.env`、`shared/data`、`backups`；不替换系统全局 Node（fzlsaas 可能在用 Node 22，需要时在宝塔或 nvm 单独装 Node 24 并 `export ERP_NODE_BIN=<绝对路径>`）；不删除或修改其他站点；不打印任何密钥明文。

**以后日常运维（都在宝塔面板里）**

- 配置：文件管理查看/修改 `shared/.env`（权限 600）。
- 站点：网站管理 Nginx 反代和 SSL 证书。
- 进程：PM2 管理器查看 `jincheng-erp-web` / `jincheng-erp-api`。
- 数据库：PostgreSQL 管理 `jincheng_erp`；迁移前备份在 `backups/`。
- 更新上线：重跑 `scripts/baota-first-deploy.sh`，或配好第 3 节的 Secrets 后走 GitHub Actions（路径 A）。
- 健康检查：宝塔终端执行 `curl -fsS http://127.0.0.1:3101/api/v1/health`。

## 4. 宝塔服务器一次性准备

在宝塔终端执行以下只读检查，并确认版本：

```bash
node -v
pnpm -v
pm2 -v
pg_dump --version
```

要求：Node.js 24+、pnpm 11、PM2、PostgreSQL 客户端 `pg_dump`。不要为了 ERP 替换正在运行的 fzlsaas Node 22 环境；可以通过宝塔 Node 项目管理器或 nvm 为 ERP 单独安装 Node 24，并在生产 `.env` 的 `ERP_NODE_BIN` 填入 Node 24 可执行文件绝对路径。PM2 会只对锦程 ERP 使用该解释器。

在宝塔 PostgreSQL 中创建独立数据库和最小权限账号，例如：

- 数据库：`jincheng_erp`
- 用户：`jincheng_erp`
- 密码：随机强密码，不复用其他项目

生产数据库执行任何迁移前必须可成功运行 `pg_dump`。如果服务器没有 PostgreSQL，可在宝塔软件商店安装，或提供单独 PostgreSQL 实例；不要改用现有 MySQL 代替。

建立生产目录：

```bash
mkdir -p /www/wwwroot/our/jincheng-erp/shared/data
mkdir -p /www/wwwroot/our/jincheng-erp/backups
```

第一次运行 Workflow 时，如果正式配置不存在，部署会安全停止并自动生成 `shared/.env.example`。在宝塔文件管理中填写域名、数据库连接、`SESSION_SECRET` 和 `CATALOG_WRITE_KEY`，另存为 `shared/.env`，权限设为 `600`，再重新运行 Workflow。不要把正式 `.env` 发到聊天或提交 GitHub。

## 5. 宝塔站点

生产域名使用 `erp.xjshunwei.cn`：

1. DNS 解析到现有服务器。
2. 宝塔创建对应站点并申请 SSL。
3. 将 `deploy/nginx-jincheng-erp.conf.example` 的 location 配置加入站点。
4. 不在安全组开放 3001、3101，它们只监听本机。

## 6. 本地发布命令

代码合并到 `main` 后，在项目根目录执行：

```powershell
pnpm release:prod
```

该命令会拒绝脏工作区和非 `main` 分支，依次执行数据库校验、生成、lint、类型检查、测试和构建，然后推送 `main`。GitHub 收到 push 后自动部署。也可以在 GitHub Actions 页面手工运行 `Deploy Jincheng ERP`。

## 7. 安全与回滚

- 每次 Prisma 迁移前生成 PostgreSQL custom-format 备份；备份失败则停止发布。
- 新版本使用独立 release 目录，健康检查通过后才视为成功。
- 健康检查失败时，PM2 应用切回上一 release。
- 数据库迁移不自动向下回滚，使用前向修复迁移，避免破坏已经产生的业务事实。
- 自动部署永不覆盖服务器 `.env`、`shared/data` 和 `backups`。
