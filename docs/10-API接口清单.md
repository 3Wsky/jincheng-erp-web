# 锦程 ERP Web API 接口清单

## 1. 契约规则

- 根路径 `/api/v1`；OpenAPI 是 Web、未来 PC/APP/小程序的可执行契约。
- 当前实际实现包含 `GET /api/v1/health` 和下述货品基础接口；其余接口仍为规划草案。
- 写请求使用 `Idempotency-Key`；响应携带 `request_id`；时间为 ISO 8601。
- 分页统一 `page`、`page_size`、`sort`；复杂导出返回异步任务编号。
- 权限在服务端按 Role × DataScope × Action × Field × Approval 检查。

## 2. 接口分组

| 编号范围         | 资源       | 代表接口                                                     | 阶段 | 主要验收      |
| ---------------- | ---------- | ------------------------------------------------------------ | ---: | ------------- |
| API-AUTH-001~010 | 身份与权限 | `/auth/sessions`、`/me`、`/roles`、`/permissions`            |    1 | AC-F-001~002  |
| API-ORG-001~010  | 组织员工   | `/stores`、`/employees`、`/handovers`                        | 1～4 | AC-F-001、020 |
| API-CAT-001~010  | 商品 SKU   | `/products`、`/skus`、`/barcodes`                            |    2 | AC-F-003      |
| API-INV-001~020  | 库存与查货 | `/inventory/search`、`/inventory/serials/:id`、`/stocktakes` |    2 | AC-F-004~006  |
| API-PST-001~007  | 个人库存   | `/personal-stock/mine`、`/orders`、`/:id/submit`、`/:id/confirm` |    2 | AC-F-007      |
| API-TRF-001~020  | 调拨       | `/transfers`、`/:id/ship`、`/:id/receive`、`/:id/exceptions` |    2 | AC-F-008~009  |
| API-PUR-001~020  | 采购       | `/purchase-orders`、`/:id/payments`、`/:id/receipts`         |    2 | AC-F-010~011  |
| API-SAL-001~030  | 销售退换   | `/sales-orders`、`/:id/payments`、`/sales-returns`           |    3 | AC-F-012~014  |
| API-CRM-001~020  | 客户回访   | `/customers`、`/:id/followups`、`/customer-merges`           | 3～4 | AC-F-015~016  |
| API-TASK-001~010 | 待办审批   | `/tasks`、`/:id/actions`、`/approvals`                       | 2～4 | AC-F-017      |
| API-INT-001~020  | 外部集成   | `/integrations`、`/sync-jobs`、`/webhooks/:platform`         |    6 | AC-F-018      |
| API-RPT-001~020  | 报表导出   | `/reports/daily`、`/reports/executive`、`/exports`           | 4～6 | AC-F-019      |
| API-SYS-001~010  | 系统运维   | `/health`、`/jobs`、`/audit-logs`                            | 1～6 | 安全与可靠性  |

## 2.1 已实现的货品基础接口

| 编号        | 方法与路径                               | 作用                                         | 当前状态 |
| ----------- | ---------------------------------------- | -------------------------------------------- | -------- |
| API-CAT-001 | `GET /catalog/products`                  | 按编码、名称、品牌、品类、SKU、条码分页搜索  | VERIFY   |
| API-CAT-002 | `POST /catalog/products`                 | 创建商品及首批 SKU/条码                      | VERIFY   |
| API-CAT-003 | `PATCH /catalog/products/{id}`           | 修改商品归类、名称和启停状态                 | VERIFY   |
| API-CAT-004 | `POST /catalog/products/{id}/skus`       | 给商品新增 SKU                               | VERIFY   |
| API-CAT-005 | `PATCH /catalog/skus/{id}`               | 修改 SKU、条码、颜色、容量、序列号规则和状态 | VERIFY   |
| API-CAT-006 | `POST /catalog/imports/bytestar/preview` | 只读解析配置的管家婆 CDS，生成幂等预校验批次 | VERIFY   |
| API-CAT-007 | `POST /catalog/imports/{id}/apply`       | 把有效行应用为待归类商品/SKU；不生成库存     | VERIFY   |
| API-CAT-008 | `GET /catalog/imports`                   | 查询最近导入批次及错误统计                   | VERIFY   |
| API-CAT-009 | `POST /catalog/prices/sync-from-feed`    | 同步官网零售价：读取价签项目（digital-price-tag-generator）products.json，按「型号+容量」归一化匹配 SKU 回填 `Sku.retailPrice`；演示机跳过；原始条目存 SkuExternalIdentity（sourceSystem=PRICE_TAG_FEED）；ERP 不含爬虫，采集职责在价签项目（2026-08-12 架构决定） | VERIFY   |

2026-08-11 起，货品全部接口要求 JWT 登录：读接口需 `catalog:read`，写接口需 `catalog:write`，写入审计日志记录操作人。写接口在权限之外保留 `CATALOG_WRITE_KEY` 共享密钥作为第二道防线（密钥仅存于服务端与 BFF，浏览器不可见）；生产环境必须配置，否则写接口默认关闭。字段级与审批维度尚未接入，接入前不得标记“已验收”。

## 2.2 已实现的认证、组织、库存接口

| 编号         | 方法与路径                                   | 作用                                           | 当前状态 |
| ------------ | -------------------------------------------- | ---------------------------------------------- | -------- |
| API-AUTH-001 | `POST /auth/login`                           | 账号密码登录，返回访问令牌与当前用户           | VERIFY   |
| API-AUTH-002 | `GET /auth/me`                               | 当前用户信息（含角色与权限）                   | VERIFY   |
| API-AUTH-003 | `PATCH /auth/password`                       | 修改当前账号密码                               | VERIFY   |
| API-AUTH-004 | `POST /auth/logout`                          | 登出并记录审计                                 | VERIFY   |
| API-ORG-001  | `GET /organizations`                         | 组织列表                                       | VERIFY   |
| API-ORG-002  | `POST /organizations`                        | 创建组织                                       | VERIFY   |
| API-ORG-003  | `PATCH /organizations/{id}`                  | 修改组织名称                                   | VERIFY   |
| API-ORG-004  | `GET /organizations/{id}/stores`             | 门店列表                                       | VERIFY   |
| API-ORG-005  | `POST /stores`                               | 创建门店；默认同时创建配套门店仓（type=STORE，code=`{门店编码}-WH`），`createWarehouse=false` 可只建门店；仓库编码冲突整笔事务失败（2026-08-22） | VERIFY   |
| API-ORG-006  | `PATCH /stores/{id}`                         | 修改门店                                       | VERIFY   |
| API-ORG-007  | `GET /organizations/{id}/employees`          | 分页查询员工                                   | VERIFY   |
| API-ORG-008  | `POST /employees`                            | 创建员工档案                                   | VERIFY   |
| API-ORG-009  | `PATCH /employees/{id}`                      | 修改员工                                       | VERIFY   |
| API-ORG-010  | `POST /accounts`                             | 为员工开通账号并分配角色；销售岗须同时划分门店和仓库；财务与出纳不可兼任（钱账分离 422） | VERIFY   |
| API-ORG-011  | `PATCH /accounts/{id}`                       | 冻结/解冻、重置密码、调整角色；销售岗可同步划分门店和仓库；财务与出纳不可兼任 | VERIFY   |
| API-ORG-012  | `GET /roles`                                 | 角色列表（含权限码）                           | VERIFY   |
| API-ORG-013  | `GET /permissions`                           | 权限清单                                       | VERIFY   |
| API-ORG-014  | `POST /organizations/{id}/stores/sync-from-warehouses` | 从门店类仓库同步门店主数据（幂等；总仓/售后/个人仓不参与） | VERIFY   |
| API-ORG-015  | `POST /roles`                                | 创建自定义角色（内置编码拒绝；不可授予 role:write；单据写入+付款执行组合 422） | VERIFY   |
| API-ORG-016  | `PATCH /roles/{id}`                          | 更新自定义角色名称/权限（内置角色 422；钱账分离组合 422） | VERIFY   |
| API-ORG-017  | `POST /roles/{id}/archive`                   | 停用自定义角色（有账号挂载时拒绝）             | VERIFY   |
| API-ORG-018  | `POST /roles/{id}/restore`                   | 恢复已停用自定义角色                           | VERIFY   |
| API-ORG-019  | `GET /organizations/{id}/warehouses`         | 地点清单：全部仓库（含个人仓），供组织页按类型分组 | VERIFY   |
| API-ORG-020  | `GET /roles/{id}/accounts`                   | 指定角色的持有账号清单（核对谁有该权限，role:read） | VERIFY   |
| API-ORG-021  | `POST /warehouses`                           | 创建仓库（organization:write，2026-08-22）：STORE 须关联本组织门店；PERSONAL 须归属本组织员工且一人一仓（422）；COMPANY/AFTER_SALES/ABNORMAL 不带门店/员工；编码公司范围唯一（409）；同事务审计 warehouse.create | VERIFY   |
| API-ORG-022  | `PATCH /warehouses/{id}`                     | 修改仓库（organization:write）：改名；门店仓可换关联门店；归属员工不可改（防抢占个人仓，调整走销售账号地点划分）；不提供物理删除 | VERIFY   |
| API-INV-001  | `GET /inventory/overview`                    | 仓库总览：按仓库聚合序列号，区分公司/个人      | VERIFY   |
| API-INV-002  | `GET /inventory/warehouses/{id}/serials`     | 指定仓库序列号明细（分页，支持 SKU/IMEI/SN 搜索） | VERIFY   |
| API-INV-003  | `GET /inventory/search`                      | 全局查货明细：一个关键字跨仓匹配 IMEI 主/副、SN、SKU 编码/名称、单/多条码、品牌与型号（支持连写容错：mate80promax 可命中 Mate 80 Pro Max）；支持状态/仓库/SKU 过滤，返回分页结果 + 全量状态分布聚合（AC-F-004） | VERIFY   |
| API-INV-004  | `GET /inventory/serials/{id}`                | 单机档案：序列号详情 + 全部 `InventoryMovement` 流水时间线（AC-F-005）；非 UUID 参数返回 400 | VERIFY   |
| API-INV-005  | `GET /inventory/search/summary`              | 查货聚合视图（找货第一步，2026-08-12 验收反馈）：按商品汇总各仓库可售/在途锁定/其他数量，可售数倒序，超 50 组截断提示 | VERIFY   |

登录/组织/库存接口均接入 JWT 认证（库存读接口需 `inventory:read`）；写接口落审计日志。库存期初迁移使用统一期初单据 + `InventoryMovement` 流水，不直接修改余额。查货结果的成本字段暂按 `inventory:read` 全量返回，字段级脱敏待权限矩阵（docs/11）签字后接入。

## 2.3 已实现的调拨接口（2026-08-12，docs/12 状态机）

| 编号        | 方法与路径                        | 作用                                                         | 当前状态 |
| ----------- | --------------------------------- | ------------------------------------------------------------ | -------- |
| API-TRF-001 | `GET /transfers`                  | 调拨单分页列表（状态/仓库/单号过滤）                         | VERIFY   |
| API-TRF-002 | `POST /transfers`                 | 创建调拨草稿：校验序列号在调出仓且状态正常，一机一行         | VERIFY   |
| API-TRF-003 | `GET /transfers/{id}`             | 详情：明细、握手时间线与各环节操作人                         | VERIFY   |
| API-TRF-004 | `POST /transfers/{id}/submit`     | 提交申请：DRAFT → SUBMITTED                                  | VERIFY   |
| API-TRF-005 | `POST /transfers/{id}/approve`    | 审批通过：SUBMITTED → APPROVED                               | VERIFY   |
| API-TRF-006 | `POST /transfers/{id}/reject`     | 审批拒绝（必填原因）：SUBMITTED → REJECTED                   | VERIFY   |
| API-TRF-007 | `POST /transfers/{id}/lock`       | 锁定来源库存：APPROVED → LOCKED；序列号 NORMAL → LOCKED 原子校验 | VERIFY   |
| API-TRF-008 | `POST /transfers/{id}/ship`       | 发出：LOCKED → IN_TRANSIT；写 TRANSFER_OUT 流水（一机一条）  | VERIFY   |
| API-TRF-009 | `POST /transfers/{id}/receive`    | 扫码接收（支持部分）：序列号落位调入仓 + TRANSFER_IN 流水；主单按明细聚合 | VERIFY   |
| API-TRF-010 | `POST /transfers/{id}/exceptions` | 差异登记（少货/错货/损坏/拒收/超时）：设备转 ABNORMAL 待差异闭环 | VERIFY   |
| API-TRF-011 | `POST /transfers/{id}/complete`   | 对账完成：RECEIVED → COMPLETED                               | VERIFY   |
| API-TRF-012 | `POST /transfers/{id}/cancel`     | 取消/撤回：DRAFT/SUBMITTED/APPROVED → CANCELLED（锁库后需先解锁退回，2026-08-13 扩展） | VERIFY   |
| API-TRF-013 | `POST /transfers/{id}/unlock`     | 解锁退回：LOCKED → APPROVED；序列号 LOCKED → NORMAL 计数校验，明细行回 PENDING（2026-08-13 新增） | VERIFY   |

调拨读接口需 `transfer:read`，全部命令需 `transfer:write`；每次状态转换 `updateMany + 前置状态条件` 原子执行（并发重复提交仅一次成功），同事务写审计（含前后状态与 request_id）。**待签字项**：审批金额/数量分级（docs/04 C.3，当前 `transfer:write` 即可审批）、差异闭环单据（EXCEPTION 后的报损/找回流程）、超时 SLA。数量商品调拨待数量库存模型上线后扩展。

## 2.4 已实现的采购接口（2026-08-12，docs/12 第 3 节三维度状态机）

| 编号        | 方法与路径                              | 作用                                                         | 当前状态 |
| ----------- | --------------------------------------- | ------------------------------------------------------------ | -------- |
| API-PUR-001 | `GET /suppliers`                        | 供应商分页列表（编码/名称搜索，状态过滤）                    | VERIFY   |
| API-PUR-002 | `POST /suppliers`                       | 创建供应商（编码唯一）                                       | VERIFY   |
| API-PUR-003 | `PATCH /suppliers/{id}`                 | 更新供应商（改名/联系人/停用）                               | VERIFY   |
| API-PUR-004 | `GET /purchase-orders`                  | 采购单分页列表（审批状态/供应商/单号过滤）                   | VERIFY   |
| API-PUR-005 | `POST /purchase-orders`                 | 创建采购草稿：SKU+数量+单价，校验供应商/仓库/SKU 启用，总额自动汇总 | VERIFY   |
| API-PUR-006 | `GET /purchase-orders/{id}`             | 详情：行、付款记录、收货批次、三维度状态与已付/已收原始数    | VERIFY   |
| API-PUR-007 | `POST /purchase-orders/{id}/submit`     | 提交审批：DRAFT → SUBMITTED                                  | VERIFY   |
| API-PUR-008 | `POST /purchase-orders/{id}/approve`    | 审批通过：SUBMITTED → APPROVED（审批分级待签字）             | VERIFY   |
| API-PUR-009 | `POST /purchase-orders/{id}/reject`     | 审批拒绝（必填原因）：SUBMITTED → REJECTED                   | VERIFY   |
| API-PUR-010 | `POST /purchase-orders/{id}/cancel`     | 取消：DRAFT/SUBMITTED → CANCELLED（审批通过后不可取消）      | VERIFY   |
| API-PUR-011 | `POST /purchase-orders/{id}/payments`   | 登记付款：付款单据 + paidAmount 同事务累加 + 付款状态重算；超付拒绝 | VERIFY   |
| API-PUR-012 | `POST /purchase-orders/{id}/receipts`   | 扫码收货：逐台生成 SerialItem + PURCHASE_RECEIPT 流水 + 行进度累加；超收拒绝 | VERIFY   |
| API-PUR-013 | `POST /purchase-orders/{id}/complete`   | 完成：校验审批+付款+收货三维度全满足后写 completedAt          | VERIFY   |

采购读接口需 `procurement:read`，全部命令需 `procurement:write`；付款/收货互不强制同步（docs/12 第 3 节），系统持续返回 paidAmount/totalAmount 与已收/订购台数供前端展示已付未到、到货未付。**待签字项**：审批金额分级（当前 `procurement:write` 即可审批）、成本分摊（当前按行单价暂记 SerialItem.unitCost）、超付/超收容差（当前一律拒绝，422）、采购差异单据（少收/错货处理）。

## 2.5 已实现的盘点接口（2026-08-12，docs/12 第 6 节）

| 编号        | 方法与路径                      | 作用                                                          | 当前状态 |
| ----------- | ------------------------------- | ------------------------------------------------------------- | -------- |
| API-STK-001 | `GET /stocktakes`               | 盘点单分页列表（状态/仓库过滤）                               | VERIFY   |
| API-STK-002 | `POST /stocktakes`              | 创建盘点草稿（同仓库不允许并存未完结盘点单）                  | VERIFY   |
| API-STK-003 | `GET /stocktakes/{id}`          | 详情：账面/已扫/匹配进度与差异清单                            | VERIFY   |
| API-STK-004 | `POST /stocktakes/{id}/start`   | 开始盘点：DRAFT → COUNTING，仓库进入封存（禁调拨/出入库）并记账面快照 | VERIFY   |
| API-STK-005 | `POST /stocktakes/{id}/scan`    | 批量录入实盘 IMEI（按主/副 IMEI 匹配档案，单内自动去重）      | VERIFY   |
| API-STK-006 | `POST /stocktakes/{id}/submit`  | 提交：COUNTING → SUBMITTED，计算差异快照（盘亏/盘盈/串仓）    | VERIFY   |
| API-STK-007 | `POST /stocktakes/{id}/approve` | 审批通过：SUBMITTED → APPROVED                                | VERIFY   |
| API-STK-008 | `POST /stocktakes/{id}/reject`  | 驳回重盘：SUBMITTED → COUNTING（清差异快照，保持封存）        | VERIFY   |
| API-STK-009 | `POST /stocktakes/{id}/post`    | 过账：APPROVED → POSTED，盘亏转 ABNORMAL + STOCK_LOSS 流水，解除封存 | VERIFY   |
| API-STK-010 | `POST /stocktakes/{id}/cancel`  | 取消：DRAFT/COUNTING → CANCELLED，解除封存                    | VERIFY   |

盘点读接口需 `inventory:read`，全部命令需 `inventory:write`。**封存规则（2026-08-12 业务确认）**：盘点期间（COUNTING/SUBMITTED/APPROVED）该仓库禁止调拨（建单/锁定/发出/接收）、采购收货与个人库存领用/归还/转交，统一由 `StocktakeFreezeService` 在业务事务内拦截（422）。**待签字项**：审批分级、盘亏报损/找回闭环、盘盈补录流程、复盘次数上限。

## 2.6 已实现的待办接口（2026-08-13）

| 编号         | 方法与路径           | 作用                                                                 | 当前状态 |
| ------------ | -------------------- | -------------------------------------------------------------------- | -------- |
| API-TASK-001 | `GET /tasks/summary` | 待办汇总：由业务单据状态实时推导（不建任务表），按当前用户权限过滤分组——调拨待审批/锁库/发出/接收（transfer:write）、采购待审批/收货（procurement:write）、采购待付款（procurement:pay）、盘点进行中（inventory:write）、个人库存领用/归还待确认（inventory:write）、转交待接收（接收方本人）、客户回访到期（customer:read）、异常设备待处理（inventory:read） | VERIFY   |

登录即可访问，分组在服务端按权限过滤（出纳仅见待付款等）；审批流单据化（/approvals，含转交/催办/审批链）待审批矩阵签字后设计。

## 2.7 已实现的客户接口（2026-08-13，AC-F-015/016）

| 编号        | 方法与路径                        | 作用                                                         | 当前状态 |
| ----------- | --------------------------------- | ------------------------------------------------------------ | -------- |
| API-CRM-001 | `GET /customers`                  | 客户分页列表：姓名/手机号搜索（尾号可查），手机号一律脱敏返回 | VERIFY   |
| API-CRM-002 | `POST /customers`                 | 建档：同组织同手机号未作废客户存在时返回 409 + 已有客户摘要；`allowDuplicate` 显式放行（受控识别，合并单据待去重规则签字） | VERIFY   |
| API-CRM-003 | `GET /customers/{id}`             | 详情：档案 + 外部身份映射 + 回访时间线                       | VERIFY   |
| API-CRM-004 | `PATCH /customers/{id}`           | 更新基础资料（已作废客户拒绝修改）                           | VERIFY   |
| API-CRM-005 | `POST /customers/{id}/archive`    | 作废（软删）：回访历史保留可追溯                             | VERIFY   |
| API-CRM-006 | `POST /customers/{id}/followups`  | 添加回访：结果为 REQ-PEOPLE-010 的 8 个标准枚举；结果=有意向时可填意向商品；nextFollowupAt 到期自动进待办 | VERIFY   |

读接口需 `customer:read`，写接口需 `customer:write`（seed：销售/店长可写，财务/老板/运营脱敏查）。**手机号脱敏规则**：11 位保留前 3 后 4（138\*\*\*\*5678），全员一律脱敏——明文可见角色待 Field 维度签字（docs/11），包括管理员。**待签字项**：客户去重匹配键与合并策略（docs/15，合并接口 /customer-merges 未实现）、来源渠道枚举（当前自由文本）、企微/小程序会员身份映射（BLOCKED 于平台权限）、回访方式枚举。

## 2.8 已实现的个人库存接口（2026-08-16，AC-F-007）

| 编号        | 方法与路径                                 | 作用                                                                 | 当前状态 |
| ----------- | ------------------------------------------ | -------------------------------------------------------------------- | -------- |
| API-PST-001 | `GET /personal-stock/mine`                 | 我的库存：按个人仓列出在库设备（含期初仍为 NORMAL 的个人仓货物）；销售本人、店长本店、ADMIN/BOSS/组织范围全部 | VERIFY   |
| API-PST-002 | `GET /personal-stock/orders`               | 个人库存单据分页（类型/状态过滤，按可见范围）                        | VERIFY   |
| API-PST-003 | `POST /personal-stock/orders`              | 创建草稿：领用=门店/总仓→个人仓；归还=个人仓→门店/总仓；转交=个人仓→他人个人仓 | VERIFY   |
| API-PST-004 | `GET /personal-stock/orders/{id}`          | 单据详情（明细 + 握手时间）                                          | VERIFY   |
| API-PST-005 | `POST /personal-stock/orders/{id}/submit`  | 提交并锁库：DRAFT → SUBMITTED；序列号 NORMAL/PERSONAL → LOCKED     | VERIFY   |
| API-PST-006 | `POST /personal-stock/orders/{id}/confirm` | 确认落位：SUBMITTED → CONFIRMED；写 PERSONAL_ISSUE/RETURN 流水     | VERIFY   |
| API-PST-007 | `POST /personal-stock/orders/{id}/cancel`  | 取消：DRAFT 直接作废；SUBMITTED 解锁并恢复锁库前状态                 | VERIFY   |

全部接口登录 + `inventory:read`。**确认规则**：领用/归还确认需 `inventory:write`（库管）；转交确认必须 `toEmployeeId` 为当前员工（接收方握手，AC-F-007）。销售仅能对自己的个人仓建单；库管可代领用。提交/确认接入 `StocktakeFreezeService`。**不新增 MovementType**；转交流水 `movementType=PERSONAL_ISSUE`、`documentType=PERSONAL_HANDOVER`。

## 3. 关键命令接口草案

| 动作         | 方法与路径                            | 幂等 | 备注                     |
| ------------ | ------------------------------------- | ---- | ------------------------ |
| 发出调拨     | `POST /transfers/{id}/ship`           | 必须 | 校验来源库存与发出人权限 |
| 接收调拨     | `POST /transfers/{id}/receive`        | 必须 | 支持逐码、部分接收和差异 |
| 确认采购付款 | `POST /purchase-orders/{id}/payments` | 必须 | 财务权限和额度审批       |
| 确认采购收货 | `POST /purchase-orders/{id}/receipts` | 必须 | 库存、成本和差异同事务   |
| 确认销售     | `POST /sales-orders/{id}/confirm`     | 必须 | 最终时点待业务签字       |
| 确认收款     | `POST /sales-orders/{id}/payments`    | 必须 | 支持多方式和多次收款     |
| 发起退换货   | `POST /sales-orders/{id}/returns`     | 必须 | 必须关联原单             |
| 处理待办     | `POST /tasks/{id}/actions`            | 必须 | 必须推进真实业务状态     |

## 4. 错误响应

```json
{
  "code": "INVENTORY_SERIAL_ALREADY_LOCKED",
  "message": "该序列号已被其他单据锁定",
  "request_id": "req_...",
  "details": {
    "serial_id": "...",
    "document_id": "..."
  }
}
```

- `400` 参数或业务前置条件错误；`401` 未登录；`403` 越权；`404` 不存在或按权限不可见；`409` 并发/幂等冲突；`422` 状态转换不允许；`429` 限流；`5xx` 服务故障。
- 不向客户端返回堆栈、SQL、密钥或内部网络信息。

## 5. 接口完成定义

接口只有在 DTO 校验、权限反向测试、幂等、事务、审计、OpenAPI 示例、错误码、性能索引和至少一个集成测试全部完成后，才能标记为“已实现”。
