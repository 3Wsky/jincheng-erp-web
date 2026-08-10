# 锦程 ERP Web

面向手机数码/3C、多门店、多员工场景的公司内部 ERP。项目采用“网站先行、API 复用、模块化单体起步”的路线，优先替换容易卡死且功能不足的旧管家婆工作流。

## 当前状态

- 已建立网站端、API、共享契约和数据库包的工程骨架。
- 已把原始产品蓝图纳入 `docs/source/`，并形成项目章程、总体架构、验收标准、路线图、待确认事项与需求追踪矩阵。
- 已建立开发交接索引，并补充业务口径、页面/API 清单、数据字典、权限矩阵、状态机、测试、运维、迭代任务和外部集成文档。
- 已落下第一批确认的数据模型：组织、门店、员工、账号、角色权限、商品/SKU、仓库、序列号、库存流水、审计日志、事务发件箱。
- 销售单最终模型保持开放，必须先完成销售业务访谈和旧系统数据盘点。

## 技术路线

- Web：Next.js + TypeScript，响应式设计，首期兼顾电脑、平板和手机浏览器。
- API：NestJS REST API + OpenAPI；未来桌面端、APP、小程序统一复用。
- 数据：PostgreSQL；Redis 用于队列、短时缓存和幂等控制；对象存储用于附件与导入文件。
- 部署：Linux + Docker；试点期用 Docker Compose，前置反向代理；暂不上 Kubernetes。
- 架构：模块化单体 + 独立 Worker。业务稳定、负载或团队边界明确后再拆服务。

## 目录

```text
apps/web                 网站端
apps/api                 后端 API
packages/contracts       跨端共享契约
packages/database        Prisma/PostgreSQL 数据模型
docs                     立项、架构、验收与需求资料
infra                    本地与试点部署配置
scripts                  开发、迁移、运维脚本
```

开发前先阅读 `docs/README.md`。Markdown 是持续维护的权威版本，DOCX 是立项查阅快照。

## 本地启动

1. 复制 `.env.example` 为 `.env`，更换所有示例密码。
2. 执行 `docker compose -f infra/docker-compose.yml up -d` 启动 PostgreSQL、Redis 和对象存储。
3. 执行 `pnpm install`、`pnpm db:validate`、`pnpm db:generate`。
4. 执行 `pnpm dev`。
5. 网站默认地址 `http://localhost:3000`，API 文档默认地址 `http://localhost:3100/docs`。

## 开发前必须确认

销售单来源、扣库存时点、IMEI 扫描时点、收款确认、支付方式、分期/以旧换新、优惠券/小程序订单、退换货、多人业绩分配和毛利口径。详见 `docs/04-待确认问题.md`。
