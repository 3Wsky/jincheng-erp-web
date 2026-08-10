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
| API-INV-001~020  | 库存与查货 | `/inventory/search`、`/serial-items/:id`、`/stocktakes`      |    2 | AC-F-004~007  |
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

货品写接口在开发环境可本机调试；生产环境必须配置 `CATALOG_WRITE_KEY`，否则默认关闭。该密钥只是登录/RBAC 完成前的部署保护，不替代 Role × DataScope × Action × Field × Approval；RBAC 接入完成前不得把接口标记为“已验收”。

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
