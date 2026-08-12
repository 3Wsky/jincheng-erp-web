"use client";

import {
  CatalogProductListSchema,
  InventoryOverviewSchema,
  PurchaseOrderDetailSchema,
  PurchaseOrderListSchema,
  SupplierListSchema,
  SupplierSchema,
  type PurchaseApprovalStatusValue,
  type PurchaseOrderDetail,
  type PurchaseOrderList,
  type Supplier,
  type WarehouseOverviewItem,
} from "@jincheng/contracts";
import { useCallback, useEffect, useState } from "react";

const PAGE_SIZE = 20;

/** 审批维度中文与徽章配色 */
const APPROVAL_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  SUBMITTED: "待审批",
  APPROVED: "已审批",
  REJECTED: "已拒绝",
  CANCELLED: "已取消",
};

const APPROVAL_BADGE_CLASS: Record<string, string> = {
  DRAFT: "status-inactive",
  SUBMITTED: "status-preview",
  APPROVED: "status-info",
  REJECTED: "status-danger",
  CANCELLED: "status-inactive",
};

/** 付款维度中文与徽章配色 */
const PAYMENT_LABELS: Record<string, string> = {
  UNPAID: "未付款",
  PARTIALLY_PAID: "部分付款",
  PAID: "已付清",
};

const PAYMENT_BADGE_CLASS: Record<string, string> = {
  UNPAID: "status-inactive",
  PARTIALLY_PAID: "status-preview",
  PAID: "status-active",
};

/** 收货维度中文与徽章配色 */
const RECEIPT_LABELS: Record<string, string> = {
  NOT_RECEIVED: "未收货",
  PARTIALLY_RECEIVED: "部分收货",
  RECEIVED: "已收货",
};

const RECEIPT_BADGE_CLASS: Record<string, string> = {
  NOT_RECEIVED: "status-inactive",
  PARTIALLY_RECEIVED: "status-preview",
  RECEIVED: "status-active",
};

/** 付款方式选项(预付/超付规则待签字,当前仅登记方式) */
const PAYMENT_METHODS: Array<{ value: string; label: string }> = [
  { value: "BANK", label: "银行转账" },
  { value: "CASH", label: "现金" },
  { value: "OTHER", label: "其他" },
];

/** 列表审批状态过滤 tabs */
const FILTER_TABS: Array<{
  value: PurchaseApprovalStatusValue | "";
  label: string;
}> = [
  { value: "", label: "全部" },
  { value: "DRAFT", label: "草稿" },
  { value: "SUBMITTED", label: "待审批" },
  { value: "APPROVED", label: "已审批" },
  { value: "REJECTED", label: "已拒绝" },
  { value: "CANCELLED", label: "已取消" },
];

/** 金额输入格式:最多两位小数 */
const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

/** 新建抽屉中的明细行编辑状态(数量/单价以字符串暂存,提交前校验) */
interface DraftLine {
  skuId: string;
  skuCode: string;
  skuName: string;
  productLabel: string;
  quantity: string;
  unitPrice: string;
}

/** SKU 搜索候选项 */
interface SkuOption {
  skuId: string;
  skuCode: string;
  skuName: string;
  productLabel: string;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "请求失败，请稍后重试";
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store", ...init });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string | string[];
    };
    const message = Array.isArray(payload.message)
      ? payload.message[0]
      : payload.message;
    throw new Error(message || `请求失败(HTTP ${response.status})`);
  }
  return response.json();
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function productLabel(brand: string | null, model: string | null): string {
  const parts = [brand, model].filter(
    (part): part is string => Boolean(part) && part!.trim() !== "",
  );
  if (parts.length === 2 && parts[1]!.startsWith(parts[0]!)) return parts[1]!;
  return parts.join(" ") || "—";
}

/** 金额展示:字符串直出,避免浮点转换 */
function formatAmount(value: string): string {
  return `¥${value}`;
}

export function ProcurementManager() {
  // ---- 列表状态 ----
  const [list, setList] = useState<PurchaseOrderList | null>(null);
  const [statusFilter, setStatusFilter] = useState<
    PurchaseApprovalStatusValue | ""
  >("");
  const [page, setPage] = useState(1);
  const [listError, setListError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // ---- 详情抽屉 ----
  const [detail, setDetail] = useState<PurchaseOrderDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  // 付款表单
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("BANK");
  const [payNote, setPayNote] = useState("");
  // 扫码收货表单:选行 + 一行一个 IMEI
  const [receiptLineId, setReceiptLineId] = useState("");
  const [imeiText, setImeiText] = useState("");

  // ---- 新建采购单 ----
  const [showCreate, setShowCreate] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [warehouses, setWarehouses] = useState<WarehouseOverviewItem[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [remark, setRemark] = useState("");
  const [skuSearch, setSkuSearch] = useState("");
  const [skuOptions, setSkuOptions] = useState<SkuOption[]>([]);
  const [skuLoading, setSkuLoading] = useState(false);
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);
  // 内联快捷创建供应商
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [newSupplierCode, setNewSupplierCode] = useState("");
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierPhone, setNewSupplierPhone] = useState("");

  /** 加载采购单列表(状态/分页变化或手动刷新时) */
  useEffect(() => {
    let active = true;
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          const params = new URLSearchParams({
            page: String(page),
            pageSize: String(PAGE_SIZE),
          });
          if (statusFilter) params.set("approvalStatus", statusFilter);
          const payload = PurchaseOrderListSchema.parse(
            await fetchJson(`/api/procurement/purchase-orders?${params}`),
          );
          if (active) {
            setList(payload);
            setListError(null);
          }
        } catch (loadError) {
          if (active) setListError(messageOf(loadError));
        }
      })();
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [statusFilter, page, refreshTick]);

  const refresh = useCallback(() => setRefreshTick((value) => value + 1), []);

  /** 打开详情抽屉 */
  const openDetail = useCallback(async (id: string) => {
    setDetailOpen(true);
    setDetail(null);
    setDetailError(null);
    setActionError(null);
    setShowReject(false);
    setRejectReason("");
    setPayAmount("");
    setPayNote("");
    setReceiptLineId("");
    setImeiText("");
    setDetailLoading(true);
    try {
      const payload = PurchaseOrderDetailSchema.parse(
        await fetchJson(`/api/procurement/purchase-orders/${id}`),
      );
      setDetail(payload);
    } catch (loadError) {
      setDetailError(messageOf(loadError));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  /** 执行状态机命令并刷新详情与列表 */
  const runCommand = useCallback(
    async (key: string, path: string, body?: unknown) => {
      if (!detail) return;
      setBusy(key);
      setActionError(null);
      try {
        const payload = PurchaseOrderDetailSchema.parse(
          await fetchJson(`/api/procurement/purchase-orders/${detail.id}${path}`, {
            method: "POST",
            headers: body ? { "content-type": "application/json" } : undefined,
            body: body ? JSON.stringify(body) : undefined,
          }),
        );
        setDetail(payload);
        setShowReject(false);
        setRejectReason("");
        setPayAmount("");
        setPayNote("");
        setImeiText("");
        refresh();
      } catch (commandError) {
        setActionError(messageOf(commandError));
      } finally {
        setBusy(null);
      }
    },
    [detail, refresh],
  );

  /** 打开新建面板时加载供应商与仓库 */
  const openCreate = useCallback(async () => {
    setShowCreate(true);
    setCreateError(null);
    setSupplierId("");
    setWarehouseId("");
    setRemark("");
    setSkuSearch("");
    setSkuOptions([]);
    setDraftLines([]);
    setShowNewSupplier(false);
    try {
      const [supplierPayload, inventoryPayload] = await Promise.all([
        fetchJson("/api/procurement/suppliers?pageSize=100&status=ACTIVE"),
        fetchJson("/api/inventory/overview"),
      ]);
      const supplierList = SupplierListSchema.parse(supplierPayload);
      const overview = InventoryOverviewSchema.parse(inventoryPayload);
      setSuppliers(supplierList.items);
      setWarehouses(overview.warehouses);
    } catch (loadError) {
      setCreateError(messageOf(loadError));
    }
  }, []);

  /** SKU 搜索(防抖,复用货品中心接口;清空搜索词时同步清空候选) */
  useEffect(() => {
    if (!showCreate) return;
    let active = true;
    const handle = window.setTimeout(() => {
      void (async () => {
        if (skuSearch.trim() === "") {
          if (active) setSkuOptions([]);
          return;
        }
        if (active) setSkuLoading(true);
        try {
          const params = new URLSearchParams({
            page: "1",
            pageSize: "5",
            search: skuSearch.trim(),
          });
          const payload = CatalogProductListSchema.parse(
            await fetchJson(`/api/catalog/products?${params}`),
          );
          if (active) {
            setSkuOptions(
              payload.items.flatMap((product) =>
                product.skus
                  .filter((sku) => sku.status === "ACTIVE")
                  .map((sku) => ({
                    skuId: sku.id,
                    skuCode: sku.code,
                    skuName: sku.name,
                    productLabel: productLabel(product.brand, product.modelName),
                  })),
              ),
            );
          }
        } catch {
          if (active) setSkuOptions([]);
        } finally {
          if (active) setSkuLoading(false);
        }
      })();
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [showCreate, skuSearch]);

  /** 内联快捷创建供应商 */
  const createSupplier = useCallback(async () => {
    setBusy("supplier");
    setCreateError(null);
    try {
      const payload = SupplierSchema.parse(
        await fetchJson("/api/procurement/suppliers", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            code: newSupplierCode.trim(),
            name: newSupplierName.trim(),
            contactPhone: newSupplierPhone.trim() || undefined,
          }),
        }),
      );
      setSuppliers((current) => [payload, ...current]);
      setSupplierId(payload.id);
      setShowNewSupplier(false);
      setNewSupplierCode("");
      setNewSupplierName("");
      setNewSupplierPhone("");
    } catch (submitError) {
      setCreateError(messageOf(submitError));
    } finally {
      setBusy(null);
    }
  }, [newSupplierCode, newSupplierName, newSupplierPhone]);

  /** 校验明细行输入是否合法 */
  const lineIssue = (line: DraftLine): string | null => {
    const quantity = Number(line.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) {
      return "数量应为 1~9999 的整数";
    }
    if (!AMOUNT_PATTERN.test(line.unitPrice)) {
      return "单价应为最多两位小数的数字";
    }
    return null;
  };

  const draftIssues = draftLines.map(lineIssue);
  const draftValid =
    draftLines.length > 0 && draftIssues.every((issue) => issue === null);
  const draftTotal = draftValid
    ? draftLines
        .reduce(
          (sum, line) => sum + Number(line.quantity) * Number(line.unitPrice),
          0,
        )
        .toFixed(2)
    : null;

  /** 创建采购草稿 */
  const createOrder = useCallback(async () => {
    setBusy("create");
    setCreateError(null);
    try {
      const payload = PurchaseOrderDetailSchema.parse(
        await fetchJson("/api/procurement/purchase-orders", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            supplierId,
            warehouseId,
            remark: remark.trim() || undefined,
            lines: draftLines.map((line) => ({
              skuId: line.skuId,
              quantity: Number(line.quantity),
              unitPrice: line.unitPrice,
            })),
          }),
        }),
      );
      setShowCreate(false);
      refresh();
      setDetail(payload);
      setDetailOpen(true);
    } catch (submitError) {
      setCreateError(messageOf(submitError));
    } finally {
      setBusy(null);
    }
  }, [supplierId, warehouseId, remark, draftLines, refresh]);

  /** 提交扫码收货(textarea 一行一个 IMEI,按选中行提交) */
  const submitReceipt = useCallback(() => {
    const imeis = [
      ...new Set(
        imeiText
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line !== ""),
      ),
    ];
    if (!receiptLineId || imeis.length === 0) return;
    void runCommand("receipt", "/receipts", {
      items: [{ purchaseLineId: receiptLineId, imeis }],
    });
  }, [imeiText, receiptLineId, runCommand]);

  const isCompleted = Boolean(detail?.completedAt);
  const canPay =
    detail &&
    detail.approvalStatus === "APPROVED" &&
    detail.paymentStatus !== "PAID" &&
    !isCompleted;
  const canReceive =
    detail &&
    detail.approvalStatus === "APPROVED" &&
    detail.receiptStatus !== "RECEIVED" &&
    !isCompleted;
  const canComplete =
    detail &&
    detail.approvalStatus === "APPROVED" &&
    detail.paymentStatus === "PAID" &&
    detail.receiptStatus === "RECEIVED" &&
    !isCompleted;
  const receivableLines = detail
    ? detail.lines.filter((line) => line.receivedQuantity < line.quantity)
    : [];

  return (
    <div className="transfer-manager procurement-manager">
      {/* 工具栏:审批状态过滤 + 新建 */}
      <section className="panel transfer-toolbar-panel">
        <div className="status-chips" role="tablist" aria-label="按审批状态筛选">
          {FILTER_TABS.map((tab) => (
            <button
              className={`status-chip ${statusFilter === tab.value ? "active" : ""}`}
              key={tab.value || "all"}
              role="tab"
              type="button"
              onClick={() => {
                setStatusFilter(tab.value);
                setPage(1);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          className="button primary"
          type="button"
          onClick={() => void openCreate()}
        >
          新建采购单
        </button>
      </section>

      {/* 列表 */}
      {listError ? (
        <div className="alert error">
          {listError}
          <button className="button small" type="button" onClick={refresh}>
            重试
          </button>
        </div>
      ) : !list ? (
        <section className="panel search-guide">
          <strong>正在加载采购单…</strong>
        </section>
      ) : list.items.length === 0 ? (
        <section className="panel search-guide">
          <strong>
            暂无
            {statusFilter ? `「${APPROVAL_LABELS[statusFilter]}」状态的` : ""}
            采购单
          </strong>
          <small>点击右上角「新建采购单」发起采购;审批通过后可登记付款与扫码收货。</small>
        </section>
      ) : (
        <section className="panel search-results">
          <div className="sku-table-wrap">
            <table className="sku-table search-table">
              <thead>
                <tr>
                  <th>单号</th>
                  <th>供应商</th>
                  <th>收货仓</th>
                  <th>金额(已付)</th>
                  <th>收货进度</th>
                  <th>审批状态</th>
                  <th>创建时间</th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((item) => (
                  <tr
                    className="search-row"
                    key={item.id}
                    onClick={() => void openDetail(item.id)}
                  >
                    <td className="mono">{item.code}</td>
                    <td>
                      {item.supplier.name}
                      <small className="search-sub">{item.supplier.code}</small>
                    </td>
                    <td>{item.warehouse.name}</td>
                    <td>
                      {formatAmount(item.totalAmount)}
                      <small className="search-sub">
                        已付 {formatAmount(item.paidAmount)} ·{" "}
                        {PAYMENT_LABELS[item.paymentStatus]}
                      </small>
                    </td>
                    <td>
                      {item.receivedQuantitySum}/{item.orderedQuantitySum} 台
                      <small className="search-sub">
                        {RECEIPT_LABELS[item.receiptStatus]}
                      </small>
                    </td>
                    <td>
                      <span
                        className={`status-badge ${APPROVAL_BADGE_CLASS[item.approvalStatus] ?? "status-inactive"}`}
                      >
                        {APPROVAL_LABELS[item.approvalStatus] ?? item.approvalStatus}
                      </span>
                      {item.completedAt ? (
                        <small className="search-sub">已完成</small>
                      ) : null}
                    </td>
                    <td>{formatDateTime(item.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {list.totalPages > 1 ? (
            <div className="search-pagination">
              <button
                className="button small"
                disabled={page <= 1}
                type="button"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                上一页
              </button>
              <span>
                第 {list.page} / {list.totalPages} 页 · 共 {list.total} 单
              </span>
              <button
                className="button small"
                disabled={page >= list.totalPages}
                type="button"
                onClick={() => setPage((value) => value + 1)}
              >
                下一页
              </button>
            </div>
          ) : null}
        </section>
      )}

      {/* 新建采购抽屉 */}
      {showCreate ? (
        <div
          className="drawer-overlay"
          onClick={() => setShowCreate(false)}
          role="presentation"
        >
          <aside
            aria-label="新建采购单"
            className="warehouse-drawer transfer-drawer"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="drawer-head">
              <div>
                <h2>新建采购单</h2>
                <small>选择供应商、收货仓,按 SKU 添加数量与单价</small>
              </div>
              <button
                aria-label="关闭"
                className="drawer-close"
                onClick={() => setShowCreate(false)}
                type="button"
              >
                ✕
              </button>
            </header>

            <div className="transfer-form">
              <label>
                <span>供应商</span>
                <select
                  value={supplierId}
                  onChange={(event) => setSupplierId(event.target.value)}
                >
                  <option value="">请选择</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}（{supplier.code}）
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="button ghost small"
                type="button"
                onClick={() => setShowNewSupplier((value) => !value)}
              >
                {showNewSupplier ? "收起快捷创建" : "＋ 快捷创建供应商"}
              </button>
              {showNewSupplier ? (
                <div className="proc-new-supplier">
                  <input
                    maxLength={50}
                    placeholder="编码(唯一,如 SUP-001)"
                    value={newSupplierCode}
                    onChange={(event) => setNewSupplierCode(event.target.value)}
                  />
                  <input
                    maxLength={100}
                    placeholder="名称"
                    value={newSupplierName}
                    onChange={(event) => setNewSupplierName(event.target.value)}
                  />
                  <input
                    maxLength={30}
                    placeholder="联系电话(选填)"
                    value={newSupplierPhone}
                    onChange={(event) => setNewSupplierPhone(event.target.value)}
                  />
                  <button
                    className="button small"
                    disabled={
                      busy === "supplier" ||
                      newSupplierCode.trim() === "" ||
                      newSupplierName.trim() === ""
                    }
                    type="button"
                    onClick={() => void createSupplier()}
                  >
                    {busy === "supplier" ? "创建中…" : "创建并选中"}
                  </button>
                </div>
              ) : null}
              <label>
                <span>收货仓</span>
                <select
                  value={warehouseId}
                  onChange={(event) => setWarehouseId(event.target.value)}
                >
                  <option value="">请选择</option>
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>备注</span>
                <input
                  maxLength={500}
                  placeholder="选填"
                  value={remark}
                  onChange={(event) => setRemark(event.target.value)}
                />
              </label>

              <label>
                <span>添加明细（按商品名称 / SKU 编码搜索）</span>
                <input
                  placeholder="输入商品名称或编码"
                  value={skuSearch}
                  onChange={(event) => setSkuSearch(event.target.value)}
                />
              </label>
              {skuLoading ? (
                <p className="drawer-empty">正在搜索…</p>
              ) : skuOptions.length > 0 ? (
                <ul className="transfer-serial-options">
                  {skuOptions.map((option) => {
                    const added = draftLines.some(
                      (line) => line.skuId === option.skuId,
                    );
                    return (
                      <li key={option.skuId}>
                        <div>
                          <b>{option.productLabel}</b>
                          <small>
                            {option.skuName} · {option.skuCode}
                          </small>
                        </div>
                        <button
                          className="button small"
                          disabled={added}
                          type="button"
                          onClick={() =>
                            setDraftLines((current) =>
                              added
                                ? current
                                : [
                                    ...current,
                                    {
                                      skuId: option.skuId,
                                      skuCode: option.skuCode,
                                      skuName: option.skuName,
                                      productLabel: option.productLabel,
                                      quantity: "1",
                                      unitPrice: "",
                                    },
                                  ],
                            )
                          }
                        >
                          {added ? "已添加" : "添加"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}

              {draftLines.length > 0 ? (
                <div className="proc-line-editor">
                  <span>已添加 {draftLines.length} 行</span>
                  <table>
                    <thead>
                      <tr>
                        <th>商品</th>
                        <th>数量</th>
                        <th>单价(元)</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {draftLines.map((line, index) => (
                        <tr key={line.skuId}>
                          <td>
                            {line.productLabel}
                            <small className="search-sub">{line.skuName}</small>
                            {draftIssues[index] ? (
                              <small className="proc-line-issue">
                                {draftIssues[index]}
                              </small>
                            ) : null}
                          </td>
                          <td>
                            <input
                              inputMode="numeric"
                              value={line.quantity}
                              onChange={(event) =>
                                setDraftLines((current) =>
                                  current.map((entry) =>
                                    entry.skuId === line.skuId
                                      ? { ...entry, quantity: event.target.value }
                                      : entry,
                                  ),
                                )
                              }
                            />
                          </td>
                          <td>
                            <input
                              inputMode="decimal"
                              placeholder="0.00"
                              value={line.unitPrice}
                              onChange={(event) =>
                                setDraftLines((current) =>
                                  current.map((entry) =>
                                    entry.skuId === line.skuId
                                      ? { ...entry, unitPrice: event.target.value }
                                      : entry,
                                  ),
                                )
                              }
                            />
                          </td>
                          <td>
                            <button
                              aria-label="移除"
                              type="button"
                              onClick={() =>
                                setDraftLines((current) =>
                                  current.filter(
                                    (entry) => entry.skuId !== line.skuId,
                                  ),
                                )
                              }
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {draftTotal ? (
                    <span className="proc-line-total">
                      预计总额 {formatAmount(draftTotal)}
                    </span>
                  ) : null}
                </div>
              ) : null}

              {createError ? <div className="alert error">{createError}</div> : null}

              <button
                className="button primary"
                disabled={
                  busy === "create" || !supplierId || !warehouseId || !draftValid
                }
                type="button"
                onClick={() => void createOrder()}
              >
                {busy === "create"
                  ? "创建中…"
                  : `创建采购草稿（${draftLines.length} 行）`}
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      {/* 详情抽屉 */}
      {detailOpen ? (
        <div
          className="drawer-overlay"
          onClick={() => setDetailOpen(false)}
          role="presentation"
        >
          <aside
            aria-label="采购单详情"
            className="warehouse-drawer transfer-drawer"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="drawer-head">
              <div>
                <h2 className="mono">{detail?.code ?? "采购单"}</h2>
                <small>
                  {detail
                    ? `${detail.supplier.name} → ${detail.warehouse.name}`
                    : "正在加载…"}
                </small>
              </div>
              <button
                aria-label="关闭"
                className="drawer-close"
                onClick={() => setDetailOpen(false)}
                type="button"
              >
                ✕
              </button>
            </header>

            {detailLoading ? (
              <p className="drawer-empty">正在加载采购单…</p>
            ) : detailError ? (
              <p className="drawer-empty error">{detailError}</p>
            ) : detail ? (
              <>
                {/* 三维度状态徽章(docs/12:付款和收货不强制同步) */}
                <div className="drawer-stats proc-stats">
                  <div>
                    <span>审批</span>
                    <strong>
                      <span
                        className={`status-badge ${APPROVAL_BADGE_CLASS[detail.approvalStatus] ?? "status-inactive"}`}
                      >
                        {APPROVAL_LABELS[detail.approvalStatus] ??
                          detail.approvalStatus}
                      </span>
                    </strong>
                  </div>
                  <div>
                    <span>付款</span>
                    <strong>
                      <span
                        className={`status-badge ${PAYMENT_BADGE_CLASS[detail.paymentStatus] ?? "status-inactive"}`}
                      >
                        {PAYMENT_LABELS[detail.paymentStatus] ?? detail.paymentStatus}
                      </span>
                    </strong>
                  </div>
                  <div>
                    <span>收货</span>
                    <strong>
                      <span
                        className={`status-badge ${RECEIPT_BADGE_CLASS[detail.receiptStatus] ?? "status-inactive"}`}
                      >
                        {RECEIPT_LABELS[detail.receiptStatus] ?? detail.receiptStatus}
                      </span>
                    </strong>
                  </div>
                </div>

                {/* 已付未到/到货未付原始数展示 */}
                <div className="proc-facts">
                  <div>
                    <span>付款进度</span>
                    <b>
                      已付 {formatAmount(detail.paidAmount)} / 总额{" "}
                      {formatAmount(detail.totalAmount)}
                    </b>
                  </div>
                  <div>
                    <span>收货进度</span>
                    <b>
                      已收 {detail.receivedQuantitySum} / 共{" "}
                      {detail.orderedQuantitySum} 台
                    </b>
                  </div>
                  {isCompleted ? (
                    <div>
                      <span>完成时间</span>
                      <b>{formatDateTime(detail.completedAt)}</b>
                    </div>
                  ) : null}
                </div>

                {detail.rejectedReason ? (
                  <div className="alert error transfer-alert">
                    拒绝原因：{detail.rejectedReason}
                  </div>
                ) : null}
                {detail.remark ? (
                  <p className="transfer-remark">备注：{detail.remark}</p>
                ) : null}

                {/* 操作区:按三维度状态渲染可执行命令 */}
                {actionError ? (
                  <div className="alert error transfer-alert">{actionError}</div>
                ) : null}
                <div className="transfer-actions">
                  {detail.approvalStatus === "DRAFT" ? (
                    <>
                      <button
                        className="button primary"
                        disabled={busy !== null}
                        type="button"
                        onClick={() => void runCommand("submit", "/submit")}
                      >
                        提交审批
                      </button>
                      <button
                        className="button secondary"
                        disabled={busy !== null}
                        type="button"
                        onClick={() => void runCommand("cancel", "/cancel")}
                      >
                        取消
                      </button>
                    </>
                  ) : null}
                  {detail.approvalStatus === "SUBMITTED" ? (
                    <>
                      <button
                        className="button primary"
                        disabled={busy !== null}
                        type="button"
                        onClick={() => void runCommand("approve", "/approve")}
                      >
                        审批通过
                      </button>
                      <button
                        className="button secondary"
                        disabled={busy !== null}
                        type="button"
                        onClick={() => setShowReject((value) => !value)}
                      >
                        拒绝
                      </button>
                      <button
                        className="button ghost"
                        disabled={busy !== null}
                        type="button"
                        onClick={() => void runCommand("cancel", "/cancel")}
                      >
                        撤回
                      </button>
                    </>
                  ) : null}
                  {canComplete ? (
                    <button
                      className="button primary"
                      disabled={busy !== null}
                      type="button"
                      onClick={() => void runCommand("complete", "/complete")}
                    >
                      完成采购单
                    </button>
                  ) : null}
                </div>

                {showReject ? (
                  <div className="transfer-inline-form">
                    <input
                      maxLength={500}
                      placeholder="填写拒绝原因（必填）"
                      value={rejectReason}
                      onChange={(event) => setRejectReason(event.target.value)}
                    />
                    <button
                      className="button small"
                      disabled={busy !== null || rejectReason.trim() === ""}
                      type="button"
                      onClick={() =>
                        void runCommand("reject", "/reject", {
                          reason: rejectReason.trim(),
                        })
                      }
                    >
                      确认拒绝
                    </button>
                  </div>
                ) : null}

                {/* 登记付款(仅审批通过且未付清) */}
                {canPay ? (
                  <>
                    <div className="drawer-section">
                      <h3>登记付款</h3>
                    </div>
                    <div className="transfer-inline-form">
                      <input
                        inputMode="decimal"
                        placeholder={`金额(剩余应付以总额为限)`}
                        value={payAmount}
                        onChange={(event) => setPayAmount(event.target.value)}
                      />
                      <select
                        value={payMethod}
                        onChange={(event) => setPayMethod(event.target.value)}
                      >
                        {PAYMENT_METHODS.map((method) => (
                          <option key={method.value} value={method.value}>
                            {method.label}
                          </option>
                        ))}
                      </select>
                      <input
                        maxLength={500}
                        placeholder="备注(选填)"
                        value={payNote}
                        onChange={(event) => setPayNote(event.target.value)}
                      />
                      <button
                        className="button small"
                        disabled={
                          busy !== null || !AMOUNT_PATTERN.test(payAmount.trim())
                        }
                        type="button"
                        onClick={() =>
                          void runCommand("payment", "/payments", {
                            amount: payAmount.trim(),
                            method: payMethod,
                            note: payNote.trim() || undefined,
                          })
                        }
                      >
                        登记付款
                      </button>
                    </div>
                  </>
                ) : null}

                {/* 扫码收货(仅审批通过且未收满) */}
                {canReceive && receivableLines.length > 0 ? (
                  <>
                    <div className="drawer-section">
                      <h3>扫码收货</h3>
                    </div>
                    <div className="proc-receipt-form">
                      <select
                        value={receiptLineId}
                        onChange={(event) => setReceiptLineId(event.target.value)}
                      >
                        <option value="">选择明细行</option>
                        {receivableLines.map((line) => (
                          <option key={line.id} value={line.id}>
                            {productLabel(line.productBrand, line.productModel)} ·{" "}
                            {line.skuName}（已收 {line.receivedQuantity}/
                            {line.quantity}）
                          </option>
                        ))}
                      </select>
                      <textarea
                        placeholder={"一行一个 IMEI,扫码枪可连续录入\n例:\n990000000000001\n990000000000002"}
                        rows={4}
                        value={imeiText}
                        onChange={(event) => setImeiText(event.target.value)}
                      />
                      <button
                        className="button small"
                        disabled={
                          busy !== null ||
                          !receiptLineId ||
                          imeiText.trim() === ""
                        }
                        type="button"
                        onClick={submitReceipt}
                      >
                        提交收货（生成序列号并入库）
                      </button>
                    </div>
                  </>
                ) : null}

                {/* 明细行 */}
                <div className="drawer-section">
                  <h3>明细（{detail.lines.length} 行）</h3>
                </div>
                <div className="drawer-table-wrap">
                  <table className="drawer-table">
                    <thead>
                      <tr>
                        <th>商品</th>
                        <th>数量</th>
                        <th>单价</th>
                        <th>小计</th>
                        <th>收货进度</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.lines.map((line) => (
                        <tr key={line.id}>
                          <td>
                            {productLabel(line.productBrand, line.productModel)}
                            <small className="search-sub">
                              {line.skuName} · {line.skuCode}
                            </small>
                          </td>
                          <td>{line.quantity}</td>
                          <td>{formatAmount(line.unitPrice)}</td>
                          <td>{formatAmount(line.lineTotal)}</td>
                          <td>
                            {line.receivedQuantity}/{line.quantity}
                            {line.receivedQuantity >= line.quantity ? (
                              <small className="search-sub">已收满</small>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 付款记录 */}
                <div className="drawer-section">
                  <h3>付款记录（{detail.payments.length} 笔）</h3>
                </div>
                {detail.payments.length === 0 ? (
                  <p className="drawer-empty">暂无付款记录</p>
                ) : (
                  <ul className="proc-records">
                    {detail.payments.map((payment) => (
                      <li key={payment.id}>
                        <div>
                          <b>{formatAmount(payment.amount)}</b>
                          <small>
                            {PAYMENT_METHODS.find(
                              (method) => method.value === payment.method,
                            )?.label ?? payment.method}
                            {payment.note ? ` · ${payment.note}` : ""}
                          </small>
                        </div>
                        <small>
                          {formatDateTime(payment.paidAt)}
                          {payment.createdByName ? ` · ${payment.createdByName}` : ""}
                        </small>
                      </li>
                    ))}
                  </ul>
                )}

                {/* 收货批次 */}
                <div className="drawer-section">
                  <h3>收货批次（{detail.receipts.length} 批）</h3>
                </div>
                {detail.receipts.length === 0 ? (
                  <p className="drawer-empty">暂无收货记录</p>
                ) : (
                  <ul className="proc-records">
                    {detail.receipts.map((receipt) => (
                      <li key={receipt.id}>
                        <div>
                          <b className="mono">{receipt.code}</b>
                          <small>
                            {receipt.itemCount} 台 ·{" "}
                            {receipt.items
                              .slice(0, 3)
                              .map((item) => item.imeiPrimary)
                              .join("、")}
                            {receipt.itemCount > 3 ? " 等" : ""}
                          </small>
                        </div>
                        <small>
                          {formatDateTime(receipt.receivedAt)}
                          {receipt.receivedByName
                            ? ` · ${receipt.receivedByName}`
                            : ""}
                        </small>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : null}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
