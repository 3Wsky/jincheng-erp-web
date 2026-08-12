"use client";

import {
  InventoryOverviewSchema,
  TransferDetailSchema,
  TransferListSchema,
  WarehouseSerialListSchema,
  type TransferDetail,
  type TransferExceptionTypeValue,
  type TransferList,
  type TransferStatusValue,
  type WarehouseOverviewItem,
  type WarehouseSerialItem,
} from "@jincheng/contracts";
import { useCallback, useEffect, useState } from "react";

const PAGE_SIZE = 20;

/** 主单状态中文与徽章配色 */
const STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  SUBMITTED: "待审批",
  APPROVED: "已审批",
  REJECTED: "已拒绝",
  LOCKED: "已锁库",
  IN_TRANSIT: "在途",
  PARTIALLY_RECEIVED: "部分接收",
  RECEIVED: "已接收",
  EXCEPTION: "差异",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  DRAFT: "status-inactive",
  SUBMITTED: "status-preview",
  APPROVED: "status-info",
  REJECTED: "status-danger",
  LOCKED: "status-info",
  IN_TRANSIT: "status-preview",
  PARTIALLY_RECEIVED: "status-preview",
  RECEIVED: "status-active",
  EXCEPTION: "status-danger",
  COMPLETED: "status-active",
  CANCELLED: "status-inactive",
};

/** 明细行状态中文 */
const LINE_STATUS_LABELS: Record<string, string> = {
  PENDING: "待锁定",
  LOCKED: "已锁定",
  SHIPPED: "在途",
  RECEIVED: "已接收",
  EXCEPTION: "差异",
};

const EXCEPTION_LABELS: Record<TransferExceptionTypeValue, string> = {
  MISSING: "少货",
  WRONG_ITEM: "错货/串号",
  DAMAGED: "损坏",
  REJECTED: "拒收",
  TIMEOUT: "超时未收",
};

/** 列表状态过滤 tabs(全部 + 常用状态) */
const FILTER_TABS: Array<{ value: TransferStatusValue | ""; label: string }> = [
  { value: "", label: "全部" },
  { value: "DRAFT", label: "草稿" },
  { value: "SUBMITTED", label: "待审批" },
  { value: "APPROVED", label: "已审批" },
  { value: "LOCKED", label: "已锁库" },
  { value: "IN_TRANSIT", label: "在途" },
  { value: "PARTIALLY_RECEIVED", label: "部分接收" },
  { value: "RECEIVED", label: "已接收" },
  { value: "EXCEPTION", label: "差异" },
  { value: "COMPLETED", label: "已完成" },
];

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

export function TransferManager() {
  // ---- 列表状态 ----
  const [list, setList] = useState<TransferList | null>(null);
  const [statusFilter, setStatusFilter] = useState<TransferStatusValue | "">("");
  const [page, setPage] = useState(1);
  const [listError, setListError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // ---- 详情抽屉 ----
  const [detail, setDetail] = useState<TransferDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [checkedSerials, setCheckedSerials] = useState<Set<string>>(new Set());
  const [exceptionType, setExceptionType] =
    useState<TransferExceptionTypeValue>("MISSING");
  const [exceptionNote, setExceptionNote] = useState("");
  const [showException, setShowException] = useState(false);

  // ---- 新建调拨 ----
  const [showCreate, setShowCreate] = useState(false);
  const [warehouses, setWarehouses] = useState<WarehouseOverviewItem[]>([]);
  const [fromWarehouseId, setFromWarehouseId] = useState("");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [remark, setRemark] = useState("");
  const [serialSearch, setSerialSearch] = useState("");
  const [serialOptions, setSerialOptions] = useState<WarehouseSerialItem[]>([]);
  const [serialLoading, setSerialLoading] = useState(false);
  const [picked, setPicked] = useState<WarehouseSerialItem[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);

  /** 加载调拨列表(状态/分页变化或手动刷新时) */
  useEffect(() => {
    let active = true;
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          const params = new URLSearchParams({
            page: String(page),
            pageSize: String(PAGE_SIZE),
          });
          if (statusFilter) params.set("status", statusFilter);
          const payload = TransferListSchema.parse(
            await fetchJson(`/api/transfers?${params}`),
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
    setShowException(false);
    setCheckedSerials(new Set());
    setDetailLoading(true);
    try {
      const payload = TransferDetailSchema.parse(
        await fetchJson(`/api/transfers/${id}`),
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
        const payload = TransferDetailSchema.parse(
          await fetchJson(`/api/transfers/${detail.id}${path}`, {
            method: "POST",
            headers: body ? { "content-type": "application/json" } : undefined,
            body: body ? JSON.stringify(body) : undefined,
          }),
        );
        setDetail(payload);
        setCheckedSerials(new Set());
        setShowReject(false);
        setShowException(false);
        setRejectReason("");
        setExceptionNote("");
        refresh();
      } catch (commandError) {
        setActionError(messageOf(commandError));
      } finally {
        setBusy(null);
      }
    },
    [detail, refresh],
  );

  /** 打开新建面板时加载仓库列表 */
  const openCreate = useCallback(async () => {
    setShowCreate(true);
    setCreateError(null);
    setPicked([]);
    setSerialOptions([]);
    setSerialSearch("");
    setRemark("");
    try {
      const payload = InventoryOverviewSchema.parse(
        await fetchJson("/api/inventory/overview"),
      );
      setWarehouses(payload.warehouses);
      setFromWarehouseId(payload.warehouses.find((w) => w.serialCount > 0)?.id ?? "");
      setToWarehouseId("");
    } catch (loadError) {
      setCreateError(messageOf(loadError));
    }
  }, []);

  /** 调出仓设备搜索(防抖) */
  useEffect(() => {
    if (!showCreate || !fromWarehouseId) {
      return;
    }
    let active = true;
    const handle = window.setTimeout(() => {
      void (async () => {
        if (active) setSerialLoading(true);
        try {
          const params = new URLSearchParams({ page: "1", pageSize: "10" });
          if (serialSearch.trim()) params.set("search", serialSearch.trim());
          const payload = WarehouseSerialListSchema.parse(
            await fetchJson(
              `/api/inventory/warehouses/${fromWarehouseId}/serials?${params}`,
            ),
          );
          if (active) {
            setSerialOptions(
              payload.items.filter((item) => item.status === "NORMAL"),
            );
          }
        } catch {
          if (active) setSerialOptions([]);
        } finally {
          if (active) setSerialLoading(false);
        }
      })();
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [showCreate, fromWarehouseId, serialSearch]);

  /** 创建调拨草稿 */
  const createTransfer = useCallback(async () => {
    setBusy("create");
    setCreateError(null);
    try {
      const payload = TransferDetailSchema.parse(
        await fetchJson("/api/transfers", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            fromWarehouseId,
            toWarehouseId,
            serialIds: picked.map((item) => item.id),
            remark: remark.trim() || undefined,
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
  }, [fromWarehouseId, toWarehouseId, picked, remark, refresh]);

  const toggleChecked = useCallback((serialId: string) => {
    setCheckedSerials((current) => {
      const next = new Set(current);
      if (next.has(serialId)) next.delete(serialId);
      else next.add(serialId);
      return next;
    });
  }, []);

  const shippedLines = detail
    ? detail.lines.filter((line) => line.status === "SHIPPED")
    : [];
  const receivable =
    detail &&
    (detail.status === "IN_TRANSIT" || detail.status === "PARTIALLY_RECEIVED");

  /** 握手时间线节点 */
  const timeline = detail
    ? [
        { label: "创建", at: detail.createdAt, by: detail.createdByName },
        { label: "提交", at: detail.submittedAt, by: detail.createdByName },
        detail.status === "REJECTED"
          ? { label: "拒绝", at: detail.approvedAt, by: detail.approvedByName }
          : { label: "审批", at: detail.approvedAt, by: detail.approvedByName },
        { label: "锁库", at: detail.lockedAt, by: null },
        { label: "发出", at: detail.shippedAt, by: detail.shippedByName },
        { label: "接收", at: detail.receivedAt, by: null },
        detail.status === "CANCELLED"
          ? { label: "取消", at: detail.cancelledAt, by: null }
          : { label: "完成", at: detail.completedAt, by: null },
      ]
    : [];

  return (
    <div className="transfer-manager">
      {/* 工具栏:状态过滤 + 新建 */}
      <section className="panel transfer-toolbar-panel">
        <div className="status-chips" role="tablist" aria-label="按状态筛选">
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
          新建调拨
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
          <strong>正在加载调拨单…</strong>
        </section>
      ) : list.items.length === 0 ? (
        <section className="panel search-guide">
          <strong>暂无{statusFilter ? `「${STATUS_LABELS[statusFilter]}」状态的` : ""}调拨单</strong>
          <small>点击右上角「新建调拨」发起仓库间的序列号商品调拨。</small>
        </section>
      ) : (
        <section className="panel search-results">
          <div className="sku-table-wrap">
            <table className="sku-table search-table">
              <thead>
                <tr>
                  <th>单号</th>
                  <th>调出 → 调入</th>
                  <th>台数</th>
                  <th>状态</th>
                  <th>申请人</th>
                  <th>创建时间</th>
                  <th>发出 / 接收</th>
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
                      {item.fromWarehouse.name}
                      <small className="search-sub">→ {item.toWarehouse.name}</small>
                    </td>
                    <td>{item.lineCount}</td>
                    <td>
                      <span
                        className={`status-badge ${STATUS_BADGE_CLASS[item.status] ?? "status-inactive"}`}
                      >
                        {STATUS_LABELS[item.status] ?? item.status}
                      </span>
                    </td>
                    <td>{item.createdByName ?? "—"}</td>
                    <td>{formatDateTime(item.createdAt)}</td>
                    <td>
                      {formatDateTime(item.shippedAt)}
                      <small className="search-sub">
                        收 {formatDateTime(item.receivedAt)}
                      </small>
                    </td>
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

      {/* 新建调拨抽屉 */}
      {showCreate ? (
        <div
          className="drawer-overlay"
          onClick={() => setShowCreate(false)}
          role="presentation"
        >
          <aside
            aria-label="新建调拨"
            className="warehouse-drawer transfer-drawer"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="drawer-head">
              <div>
                <h2>新建调拨</h2>
                <small>选择调出仓、调入仓并逐台添加序列号商品</small>
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
                <span>调出仓</span>
                <select
                  value={fromWarehouseId}
                  onChange={(event) => {
                    setFromWarehouseId(event.target.value);
                    setPicked([]);
                    setSerialOptions([]);
                  }}
                >
                  <option value="">请选择</option>
                  {warehouses
                    .filter((warehouse) => warehouse.serialCount > 0)
                    .map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.name}（{warehouse.serialCount} 台）
                      </option>
                    ))}
                </select>
              </label>
              <label>
                <span>调入仓</span>
                <select
                  value={toWarehouseId}
                  onChange={(event) => setToWarehouseId(event.target.value)}
                >
                  <option value="">请选择</option>
                  {warehouses
                    .filter((warehouse) => warehouse.id !== fromWarehouseId)
                    .map((warehouse) => (
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
                <span>添加设备（按 IMEI / SKU 搜索调出仓正常库存）</span>
                <input
                  disabled={!fromWarehouseId}
                  placeholder={fromWarehouseId ? "输入 IMEI 或商品名称" : "请先选择调出仓"}
                  value={serialSearch}
                  onChange={(event) => setSerialSearch(event.target.value)}
                />
              </label>
              {serialLoading ? (
                <p className="drawer-empty">正在搜索…</p>
              ) : serialOptions.length > 0 ? (
                <ul className="transfer-serial-options">
                  {serialOptions.map((item) => {
                    const added = picked.some((entry) => entry.id === item.id);
                    return (
                      <li key={item.id}>
                        <div>
                          <b className="mono">{item.imeiPrimary}</b>
                          <small>
                            {productLabel(item.productBrand, item.productModel)}
                          </small>
                        </div>
                        <button
                          className="button small"
                          disabled={added}
                          type="button"
                          onClick={() =>
                            setPicked((current) =>
                              added ? current : [...current, item],
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

              {picked.length > 0 ? (
                <div className="transfer-picked">
                  <span>已选 {picked.length} 台</span>
                  <ul>
                    {picked.map((item) => (
                      <li key={item.id}>
                        <b className="mono">{item.imeiPrimary}</b>
                        <button
                          aria-label="移除"
                          type="button"
                          onClick={() =>
                            setPicked((current) =>
                              current.filter((entry) => entry.id !== item.id),
                            )
                          }
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {createError ? <div className="alert error">{createError}</div> : null}

              <button
                className="button primary"
                disabled={
                  busy === "create" ||
                  !fromWarehouseId ||
                  !toWarehouseId ||
                  picked.length === 0
                }
                type="button"
                onClick={() => void createTransfer()}
              >
                {busy === "create" ? "创建中…" : `创建调拨单（${picked.length} 台）`}
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
            aria-label="调拨单详情"
            className="warehouse-drawer transfer-drawer"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="drawer-head">
              <div>
                <h2 className="mono">{detail?.code ?? "调拨单"}</h2>
                <small>
                  {detail
                    ? `${detail.fromWarehouse.name} → ${detail.toWarehouse.name} · ${detail.lines.length} 台`
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
              <p className="drawer-empty">正在加载调拨单…</p>
            ) : detailError ? (
              <p className="drawer-empty error">{detailError}</p>
            ) : detail ? (
              <>
                <div className="drawer-stats transfer-stats">
                  <div>
                    <span>当前状态</span>
                    <strong>
                      <span
                        className={`status-badge ${STATUS_BADGE_CLASS[detail.status] ?? "status-inactive"}`}
                      >
                        {STATUS_LABELS[detail.status] ?? detail.status}
                      </span>
                    </strong>
                  </div>
                  <div>
                    <span>申请人</span>
                    <strong>{detail.createdByName ?? "—"}</strong>
                  </div>
                </div>

                {detail.rejectedReason ? (
                  <div className="alert error transfer-alert">
                    拒绝原因：{detail.rejectedReason}
                  </div>
                ) : null}
                {detail.remark ? (
                  <p className="transfer-remark">备注：{detail.remark}</p>
                ) : null}

                {/* 握手时间线 */}
                <div className="drawer-section">
                  <h3>握手时间线</h3>
                </div>
                <ol className="transfer-steps">
                  {timeline.map((step) => (
                    <li className={step.at ? "done" : ""} key={step.label}>
                      <b>{step.label}</b>
                      <small>
                        {step.at ? formatDateTime(step.at) : "—"}
                        {step.by ? ` · ${step.by}` : ""}
                      </small>
                    </li>
                  ))}
                </ol>

                {/* 操作区:按状态渲染可执行命令 */}
                {actionError ? (
                  <div className="alert error transfer-alert">{actionError}</div>
                ) : null}
                <div className="transfer-actions">
                  {detail.status === "DRAFT" ? (
                    <>
                      <button
                        className="button primary"
                        disabled={busy !== null}
                        type="button"
                        onClick={() => void runCommand("submit", "/submit")}
                      >
                        提交申请
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
                  {detail.status === "SUBMITTED" ? (
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
                  {detail.status === "APPROVED" ? (
                    <button
                      className="button primary"
                      disabled={busy !== null}
                      type="button"
                      onClick={() => void runCommand("lock", "/lock")}
                    >
                      锁定来源库存
                    </button>
                  ) : null}
                  {detail.status === "LOCKED" ? (
                    <button
                      className="button primary"
                      disabled={busy !== null}
                      type="button"
                      onClick={() => void runCommand("ship", "/ship")}
                    >
                      确认发出
                    </button>
                  ) : null}
                  {receivable && shippedLines.length > 0 ? (
                    <>
                      <button
                        className="button primary"
                        disabled={busy !== null || checkedSerials.size === 0}
                        type="button"
                        onClick={() =>
                          void runCommand("receive", "/receive", {
                            serialIds: [...checkedSerials],
                          })
                        }
                      >
                        接收选中（{checkedSerials.size}）
                      </button>
                      <button
                        className="button secondary"
                        disabled={busy !== null || checkedSerials.size === 0}
                        type="button"
                        onClick={() => setShowException((value) => !value)}
                      >
                        登记差异
                      </button>
                    </>
                  ) : null}
                  {detail.status === "RECEIVED" ? (
                    <button
                      className="button primary"
                      disabled={busy !== null}
                      type="button"
                      onClick={() => void runCommand("complete", "/complete")}
                    >
                      对账完成
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

                {showException ? (
                  <div className="transfer-inline-form">
                    <select
                      value={exceptionType}
                      onChange={(event) =>
                        setExceptionType(
                          event.target.value as TransferExceptionTypeValue,
                        )
                      }
                    >
                      {Object.entries(EXCEPTION_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <input
                      maxLength={500}
                      placeholder="差异说明（选填）"
                      value={exceptionNote}
                      onChange={(event) => setExceptionNote(event.target.value)}
                    />
                    <button
                      className="button small"
                      disabled={busy !== null || checkedSerials.size === 0}
                      type="button"
                      onClick={() =>
                        void runCommand("exception", "/exceptions", {
                          exceptions: [...checkedSerials].map((serialId) => ({
                            serialId,
                            type: exceptionType,
                            note: exceptionNote.trim() || undefined,
                          })),
                        })
                      }
                    >
                      对选中 {checkedSerials.size} 台登记差异
                    </button>
                  </div>
                ) : null}

                {/* 明细行 */}
                <div className="drawer-section">
                  <h3>明细（{detail.lines.length} 台）</h3>
                </div>
                <div className="drawer-table-wrap">
                  <table className="drawer-table">
                    <thead>
                      <tr>
                        {receivable ? <th /> : null}
                        <th>IMEI</th>
                        <th>商品</th>
                        <th>行状态</th>
                        <th>接收</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.lines.map((line) => (
                        <tr key={line.id}>
                          {receivable ? (
                            <td>
                              {line.status === "SHIPPED" ? (
                                <input
                                  aria-label={`选中 ${line.imeiPrimary}`}
                                  checked={checkedSerials.has(line.serialId)}
                                  type="checkbox"
                                  onChange={() => toggleChecked(line.serialId)}
                                />
                              ) : null}
                            </td>
                          ) : null}
                          <td className="mono">{line.imeiPrimary}</td>
                          <td>
                            {productLabel(line.productBrand, line.productModel)}
                            <small className="search-sub">{line.skuName}</small>
                          </td>
                          <td>
                            <span className="drawer-status">
                              {LINE_STATUS_LABELS[line.status] ?? line.status}
                              {line.exceptionType
                                ? ` · ${EXCEPTION_LABELS[line.exceptionType]}`
                                : ""}
                            </span>
                            {line.exceptionNote ? (
                              <small className="search-sub">{line.exceptionNote}</small>
                            ) : null}
                          </td>
                          <td>
                            {line.receivedAt ? (
                              <>
                                {formatDateTime(line.receivedAt)}
                                <small className="search-sub">
                                  {line.receivedByName ?? ""}
                                </small>
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
