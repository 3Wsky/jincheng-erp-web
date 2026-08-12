"use client";

import {
  InventoryOverviewSchema,
  StocktakeDetailSchema,
  StocktakeListSchema,
  StocktakeScanResultSchema,
  WarehouseSerialListSchema,
  type StocktakeDetail,
  type StocktakeList,
  type StocktakeStatusValue,
  type WarehouseOverviewItem,
  type WarehouseSerialItem,
} from "@jincheng/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";

const PAGE_SIZE = 20;

/** 盘点状态中文与徽章配色 */
const STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  COUNTING: "盘点中·封存",
  SUBMITTED: "待审批·封存",
  APPROVED: "已审批·封存",
  POSTED: "已过账",
  CANCELLED: "已取消",
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  DRAFT: "status-inactive",
  COUNTING: "status-preview",
  SUBMITTED: "status-preview",
  APPROVED: "status-info",
  POSTED: "status-active",
  CANCELLED: "status-inactive",
};

const DIFFERENCE_LABELS: Record<string, string> = {
  MISSING: "盘亏",
  UNEXPECTED: "盘盈/串仓",
};

const FILTER_TABS: Array<{ value: StocktakeStatusValue | ""; label: string }> = [
  { value: "", label: "全部" },
  { value: "COUNTING", label: "盘点中" },
  { value: "SUBMITTED", label: "待审批" },
  { value: "APPROVED", label: "已审批" },
  { value: "POSTED", label: "已过账" },
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

export function StocktakeManager() {
  const [list, setList] = useState<StocktakeList | null>(null);
  const [statusFilter, setStatusFilter] = useState<StocktakeStatusValue | "">("");
  const [page, setPage] = useState(1);
  const [listError, setListError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const [detail, setDetail] = useState<StocktakeDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [scanInput, setScanInput] = useState("");
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  /** 录入方式:对照勾选(默认,无需扫码枪) / 扫码·粘贴 */
  const [entryMode, setEntryMode] = useState<"checklist" | "scan">("checklist");
  /** 对照盘点的账面清单(盘点仓库全部在库序列号,分页拉全) */
  const [bookSerials, setBookSerials] = useState<WarehouseSerialItem[]>([]);
  const [bookLoading, setBookLoading] = useState(false);
  /** 只看未盘 */
  const [pendingOnly, setPendingOnly] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [warehouses, setWarehouses] = useState<WarehouseOverviewItem[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [remark, setRemark] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  /** 加载盘点列表 */
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
          const payload = StocktakeListSchema.parse(
            await fetchJson(`/api/stocktakes?${params}`),
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

  const openDetail = useCallback(async (id: string) => {
    setDetailOpen(true);
    setDetail(null);
    setDetailError(null);
    setActionError(null);
    setScanNotice(null);
    setScanInput("");
    setShowReject(false);
    setDetailLoading(true);
    try {
      const payload = StocktakeDetailSchema.parse(
        await fetchJson(`/api/stocktakes/${id}`),
      );
      setDetail(payload);
    } catch (loadError) {
      setDetailError(messageOf(loadError));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  /** 执行状态机命令(返回详情) */
  const runCommand = useCallback(
    async (key: string, path: string, body?: unknown) => {
      if (!detail) return;
      setBusy(key);
      setActionError(null);
      try {
        const payload = StocktakeDetailSchema.parse(
          await fetchJson(`/api/stocktakes/${detail.id}${path}`, {
            method: "POST",
            headers: body ? { "content-type": "application/json" } : undefined,
            body: body ? JSON.stringify(body) : undefined,
          }),
        );
        setDetail(payload);
        setShowReject(false);
        setRejectReason("");
        refresh();
      } catch (commandError) {
        setActionError(messageOf(commandError));
      } finally {
        setBusy(null);
      }
    },
    [detail, refresh],
  );

  /** 盘点中自动加载账面清单(对照勾选用;封存期间账面不变,按单据 id 只拉一次) */
  useEffect(() => {
    if (!detailOpen || !detail || detail.status !== "COUNTING") return;
    const warehouseId = detail.warehouse.id;
    let active = true;
    const handle = window.setTimeout(() => {
      void (async () => {
        if (active) setBookLoading(true);
        try {
          const all: WarehouseSerialItem[] = [];
          // 分页拉全(上限 20 页 × 100 台;更大的仓库建议扫码枪)
          for (let page = 1; page <= 20; page += 1) {
            const payload = WarehouseSerialListSchema.parse(
              await fetchJson(
                `/api/inventory/warehouses/${warehouseId}/serials?page=${page}&pageSize=100`,
              ),
            );
            all.push(...payload.items);
            if (page >= payload.totalPages) break;
          }
          if (active) {
            // 盘点基数口径:在途设备实物已发出,不参与对照
            setBookSerials(all.filter((item) => item.status !== "IN_TRANSIT"));
          }
        } catch {
          if (active) setBookSerials([]);
        } finally {
          if (active) setBookLoading(false);
        }
      })();
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailOpen, detail?.id, detail?.status]);

  /** 刷新详情(勾选/录入后同步进度与已盘集合) */
  const refreshDetail = useCallback(async () => {
    if (!detail) return;
    const payload = StocktakeDetailSchema.parse(
      await fetchJson(`/api/stocktakes/${detail.id}`),
    );
    setDetail(payload);
  }, [detail]);

  /** 对照勾选:把若干 IMEI 录入为已盘(单台勾选或整组确认共用) */
  const checkImeis = useCallback(
    async (imeis: string[]) => {
      if (!detail || imeis.length === 0) return;
      setBusy("check");
      setActionError(null);
      try {
        StocktakeScanResultSchema.parse(
          await fetchJson(`/api/stocktakes/${detail.id}/scan`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ imeis }),
          }),
        );
        await refreshDetail();
        refresh();
      } catch (checkError) {
        setActionError(messageOf(checkError));
      } finally {
        setBusy(null);
      }
    },
    [detail, refreshDetail, refresh],
  );

  /** 已盘序列号 id 集合(scan 时已按主/副 IMEI 匹配到档案) */
  const checkedSerialIds = useMemo(
    () =>
      new Set(
        (detail?.scans ?? [])
          .map((scan) => scan.serialId)
          .filter((serialId): serialId is string => serialId !== null),
      ),
    [detail?.scans],
  );

  /** 账面按商品分组(组内已盘数用于整组确认与进度) */
  const checklistGroups = useMemo(() => {
    const groups = new Map<string, WarehouseSerialItem[]>();
    for (const item of bookSerials) {
      const list = groups.get(item.skuName) ?? [];
      list.push(item);
      groups.set(item.skuName, list);
    }
    return [...groups.entries()]
      .map(([skuName, items]) => ({
        skuName,
        items,
        checked: items.filter((item) => checkedSerialIds.has(item.id)).length,
      }))
      .sort((a, b) => b.items.length - a.items.length);
  }, [bookSerials, checkedSerialIds]);

  const checkedTotal = useMemo(
    () => bookSerials.filter((item) => checkedSerialIds.has(item.id)).length,
    [bookSerials, checkedSerialIds],
  );

  /** 录入实盘(scan 返回统计,需再拉详情刷新进度) */
  const submitScan = useCallback(async () => {
    if (!detail) return;
    const imeis = [
      ...new Set(
        scanInput
          .split(/[\s,;，；]+/)
          .map((imei) => imei.trim())
          .filter((imei) => imei.length >= 4),
      ),
    ];
    if (imeis.length === 0) return;
    setBusy("scan");
    setActionError(null);
    try {
      const result = StocktakeScanResultSchema.parse(
        await fetchJson(`/api/stocktakes/${detail.id}/scan`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ imeis }),
        }),
      );
      setScanNotice(
        `已录入 ${result.inserted} 条${result.duplicated > 0 ? `，忽略重复 ${result.duplicated} 条` : ""}`,
      );
      setScanInput("");
      const payload = StocktakeDetailSchema.parse(
        await fetchJson(`/api/stocktakes/${detail.id}`),
      );
      setDetail(payload);
      refresh();
    } catch (scanError) {
      setActionError(messageOf(scanError));
    } finally {
      setBusy(null);
    }
  }, [detail, scanInput, refresh]);

  const openCreate = useCallback(async () => {
    setShowCreate(true);
    setCreateError(null);
    setRemark("");
    try {
      const payload = InventoryOverviewSchema.parse(
        await fetchJson("/api/inventory/overview"),
      );
      setWarehouses(payload.warehouses);
      setWarehouseId("");
    } catch (loadError) {
      setCreateError(messageOf(loadError));
    }
  }, []);

  const createStocktake = useCallback(async () => {
    setBusy("create");
    setCreateError(null);
    try {
      const payload = StocktakeDetailSchema.parse(
        await fetchJson("/api/stocktakes", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            warehouseId,
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
  }, [warehouseId, remark, refresh]);

  const missingCount = detail
    ? detail.differences.filter((difference) => difference.type === "MISSING")
        .length
    : 0;
  const unexpectedCount = detail
    ? detail.differences.filter(
        (difference) => difference.type === "UNEXPECTED",
      ).length
    : 0;

  return (
    <div className="transfer-manager">
      {/* 工具栏 */}
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
          新建盘点
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
          <strong>正在加载盘点单…</strong>
        </section>
      ) : list.items.length === 0 ? (
        <section className="panel search-guide">
          <strong>
            暂无{statusFilter ? `「${STATUS_LABELS[statusFilter]}」状态的` : ""}盘点单
          </strong>
          <small>
            点击右上角「新建盘点」对仓库发起整仓盘点；盘点期间该仓库封存，禁止调拨与出入库。
          </small>
        </section>
      ) : (
        <section className="panel search-results">
          <div className="sku-table-wrap">
            <table className="sku-table search-table">
              <thead>
                <tr>
                  <th>单号</th>
                  <th>仓库</th>
                  <th>状态</th>
                  <th>账面快照</th>
                  <th>已扫</th>
                  <th>差异</th>
                  <th>发起人</th>
                  <th>开始 / 过账</th>
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
                    <td>{item.warehouse.name}</td>
                    <td>
                      <span
                        className={`status-badge ${STATUS_BADGE_CLASS[item.status] ?? "status-inactive"}`}
                      >
                        {STATUS_LABELS[item.status] ?? item.status}
                      </span>
                    </td>
                    <td>{item.snapshotCount ?? "—"}</td>
                    <td>{item.scanCount}</td>
                    <td>
                      {item.differenceCount > 0 ? (
                        <span className="status-badge status-danger">
                          {item.differenceCount}
                        </span>
                      ) : (
                        "0"
                      )}
                    </td>
                    <td>{item.createdByName ?? "—"}</td>
                    <td>
                      {formatDateTime(item.startedAt)}
                      <small className="search-sub">
                        账 {formatDateTime(item.postedAt)}
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

      {/* 新建盘点抽屉 */}
      {showCreate ? (
        <div
          className="drawer-overlay"
          onClick={() => setShowCreate(false)}
          role="presentation"
        >
          <aside
            aria-label="新建盘点"
            className="warehouse-drawer transfer-drawer"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="drawer-head">
              <div>
                <h2>新建盘点</h2>
                <small>开始盘点后仓库将封存，直至过账或取消</small>
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
                <span>盘点仓库</span>
                <select
                  value={warehouseId}
                  onChange={(event) => setWarehouseId(event.target.value)}
                >
                  <option value="">请选择</option>
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}（账面 {warehouse.serialCount} 台）
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>备注</span>
                <input
                  maxLength={500}
                  placeholder="如:2026年8月月底盘库"
                  value={remark}
                  onChange={(event) => setRemark(event.target.value)}
                />
              </label>
              {createError ? (
                <div className="alert error">{createError}</div>
              ) : null}
              <button
                className="button primary"
                disabled={busy === "create" || !warehouseId}
                type="button"
                onClick={() => void createStocktake()}
              >
                {busy === "create" ? "创建中…" : "创建盘点单"}
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
            aria-label="盘点单详情"
            className="warehouse-drawer transfer-drawer"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="drawer-head">
              <div>
                <h2 className="mono">{detail?.code ?? "盘点单"}</h2>
                <small>
                  {detail
                    ? `${detail.warehouse.name} · 发起人 ${detail.createdByName ?? "—"}`
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
              <p className="drawer-empty">正在加载盘点单…</p>
            ) : detailError ? (
              <p className="drawer-empty error">{detailError}</p>
            ) : detail ? (
              <>
                <div className="drawer-stats">
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
                    <span>账面 / 已扫 / 匹配</span>
                    <strong>
                      {detail.snapshotCount ?? detail.bookCount} /{" "}
                      {detail.scanCount} / {detail.matchedCount}
                    </strong>
                  </div>
                  <div>
                    <span>盘亏</span>
                    <strong>{missingCount} 台</strong>
                  </div>
                  <div>
                    <span>盘盈/串仓</span>
                    <strong>{unexpectedCount} 台</strong>
                  </div>
                </div>

                {detail.rejectedReason ? (
                  <div className="alert error transfer-alert">
                    驳回原因：{detail.rejectedReason}
                  </div>
                ) : null}
                {detail.remark ? (
                  <p className="transfer-remark">备注：{detail.remark}</p>
                ) : null}
                {["COUNTING", "SUBMITTED", "APPROVED"].includes(
                  detail.status,
                ) ? (
                  <p className="transfer-remark">
                    ⚠ 仓库「{detail.warehouse.name}
                    」当前处于盘点封存中：调拨与出入库已被系统禁止，直至过账或取消。
                  </p>
                ) : null}

                {actionError ? (
                  <div className="alert error transfer-alert">{actionError}</div>
                ) : null}
                {scanNotice ? (
                  <div className="alert success transfer-alert">{scanNotice}</div>
                ) : null}

                {/* 操作区 */}
                <div className="transfer-actions">
                  {detail.status === "DRAFT" ? (
                    <>
                      <button
                        className="button primary"
                        disabled={busy !== null}
                        type="button"
                        onClick={() => void runCommand("start", "/start")}
                      >
                        开始盘点（封存仓库）
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
                  {detail.status === "COUNTING" ? (
                    <>
                      <button
                        className="button primary"
                        disabled={busy !== null || detail.scanCount === 0}
                        type="button"
                        onClick={() => void runCommand("submit", "/submit")}
                      >
                        提交盘点（计算差异）
                      </button>
                      <button
                        className="button ghost"
                        disabled={busy !== null}
                        type="button"
                        onClick={() => void runCommand("cancel", "/cancel")}
                      >
                        取消盘点（解封）
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
                        驳回重盘
                      </button>
                    </>
                  ) : null}
                  {detail.status === "APPROVED" ? (
                    <button
                      className="button primary"
                      disabled={busy !== null}
                      type="button"
                      onClick={() => void runCommand("post", "/post")}
                    >
                      过账（盘亏转异常并解封）
                    </button>
                  ) : null}
                </div>

                {showReject ? (
                  <div className="transfer-inline-form">
                    <input
                      maxLength={500}
                      placeholder="填写驳回原因（必填）"
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
                      确认驳回
                    </button>
                  </div>
                ) : null}

                {/* 扫码录入(仅盘点中) */}
                {detail.status === "COUNTING" ? (
                  <>
                    <div className="drawer-section stocktake-entry-head">
                      <h3>
                        录入实盘 · 已盘 {checkedTotal}/{bookSerials.length} 台
                      </h3>
                      <div className="inventory-segmented" role="tablist">
                        <button
                          className={entryMode === "checklist" ? "active" : ""}
                          role="tab"
                          type="button"
                          onClick={() => setEntryMode("checklist")}
                        >
                          对照勾选
                        </button>
                        <button
                          className={entryMode === "scan" ? "active" : ""}
                          role="tab"
                          type="button"
                          onClick={() => setEntryMode("scan")}
                        >
                          扫码 / 粘贴
                        </button>
                      </div>
                    </div>

                    {entryMode === "checklist" ? (
                      /* 对照勾选:按商品分组列出账面,对着实物点勾或数完数整组确认(无需扫码枪) */
                      bookLoading ? (
                        <p className="drawer-empty">正在加载账面清单…</p>
                      ) : bookSerials.length === 0 ? (
                        <p className="drawer-empty">该仓库暂无账面在库序列号。</p>
                      ) : (
                        <div className="stocktake-checklist">
                          <div className="checklist-toolbar">
                            <small>
                              对着实物逐台点「勾选」；同型号数量核对无误可「整组确认」
                            </small>
                            <button
                              className={`status-chip ${pendingOnly ? "active" : ""}`}
                              type="button"
                              onClick={() => setPendingOnly((value) => !value)}
                            >
                              只看未盘
                            </button>
                          </div>
                          {checklistGroups
                            .filter(
                              (group) =>
                                !pendingOnly || group.checked < group.items.length,
                            )
                            .map((group) => (
                              <details
                                className="checklist-group"
                                key={group.skuName}
                                open={group.items.length <= 6}
                              >
                                <summary>
                                  <span className="checklist-group-name">
                                    {group.skuName}
                                  </span>
                                  <span
                                    className={`checklist-group-count ${group.checked === group.items.length ? "done" : ""}`}
                                  >
                                    {group.checked}/{group.items.length}
                                  </span>
                                  {group.checked < group.items.length ? (
                                    <button
                                      className="button small"
                                      disabled={busy !== null}
                                      type="button"
                                      onClick={(event) => {
                                        event.preventDefault();
                                        void checkImeis(
                                          group.items
                                            .filter(
                                              (item) =>
                                                !checkedSerialIds.has(item.id),
                                            )
                                            .map((item) => item.imeiPrimary),
                                        );
                                      }}
                                    >
                                      整组确认（
                                      {group.items.length - group.checked}）
                                    </button>
                                  ) : (
                                    <span className="checklist-done-tag">✓ 已盘完</span>
                                  )}
                                </summary>
                                <ul>
                                  {group.items
                                    .filter(
                                      (item) =>
                                        !pendingOnly ||
                                        !checkedSerialIds.has(item.id),
                                    )
                                    .map((item) => {
                                      const checked = checkedSerialIds.has(item.id);
                                      return (
                                        <li
                                          className={checked ? "done" : ""}
                                          key={item.id}
                                        >
                                          <span className="mono">
                                            {item.imeiPrimary}
                                          </span>
                                          {checked ? (
                                            <em>已盘 ✓</em>
                                          ) : (
                                            <button
                                              className="button small"
                                              disabled={busy !== null}
                                              type="button"
                                              onClick={() =>
                                                void checkImeis([item.imeiPrimary])
                                              }
                                            >
                                              勾选
                                            </button>
                                          )}
                                        </li>
                                      );
                                    })}
                                </ul>
                              </details>
                            ))}
                        </div>
                      )
                    ) : (
                      <div className="stocktake-scan-form">
                        <textarea
                          placeholder={
                            "扫码枪连续扫描，或从 Excel/微信粘贴串号列表（一行一个）\n8639xxxxxxxxxxx\n8688xxxxxxxxxxx"
                          }
                          rows={5}
                          value={scanInput}
                          onChange={(event) => setScanInput(event.target.value)}
                        />
                        <button
                          className="button primary"
                          disabled={busy !== null || scanInput.trim() === ""}
                          type="button"
                          onClick={() => void submitScan()}
                        >
                          {busy === "scan" ? "录入中…" : "录入实盘"}
                        </button>
                      </div>
                    )}
                  </>
                ) : null}

                {/* 差异清单 */}
                {detail.differences.length > 0 ? (
                  <>
                    <div className="drawer-section stocktake-entry-head">
                      <h3>差异清单（{detail.differences.length} 条）</h3>
                      <button
                        className="button secondary"
                        type="button"
                        onClick={() => window.print()}
                      >
                        打印差异单
                      </button>
                    </div>
                    <div className="drawer-table-wrap">
                      <table className="drawer-table">
                        <thead>
                          <tr>
                            <th>类型</th>
                            <th>IMEI</th>
                            <th>商品</th>
                            <th>说明</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.differences.map((difference) => (
                            <tr key={difference.id}>
                              <td>
                                <span
                                  className={`status-badge ${difference.type === "MISSING" ? "status-danger" : "status-preview"}`}
                                >
                                  {DIFFERENCE_LABELS[difference.type] ??
                                    difference.type}
                                </span>
                              </td>
                              <td className="mono">{difference.imei}</td>
                              <td>{difference.skuName ?? "—"}</td>
                              <td className="stocktake-note">
                                {difference.note ?? "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : detail.status !== "DRAFT" && detail.status !== "COUNTING" ? (
                  <p className="drawer-empty">本次盘点无差异，账实一致。</p>
                ) : null}
              </>
            ) : null}
          </aside>
        </div>
      ) : null}

      {/* 盘点差异单打印(屏幕隐藏,打印时独占页面;供仓管/审批人纸面签字) */}
      {detailOpen && detail && detail.differences.length > 0 ? (
        <div className="print-report">
          <h1>锦程 ERP · 盘点差异单</h1>
          <p className="print-meta">
            单号：{detail.code} · 仓库：{detail.warehouse.name} · 状态：
            {STATUS_LABELS[detail.status] ?? detail.status} · 打印时间：
            {new Date().toLocaleString("zh-CN", { hour12: false })}
          </p>
          <p className="print-meta">
            账面：{detail.snapshotCount ?? detail.bookCount} 台 · 实盘录入：
            {detail.scanCount} 条 · 盘亏：
            {
              detail.differences.filter(
                (difference) => difference.type === "MISSING",
              ).length
            }{" "}
            台 · 盘盈/串仓：
            {
              detail.differences.filter(
                (difference) => difference.type === "UNEXPECTED",
              ).length
            }{" "}
            台
            {detail.remark ? ` · 备注：${detail.remark}` : ""}
          </p>
          <div className="print-section">
            <table>
              <thead>
                <tr>
                  <th style={{ width: "70px" }}>类型</th>
                  <th style={{ width: "150px" }}>IMEI / SN</th>
                  <th>商品</th>
                  <th>说明</th>
                </tr>
              </thead>
              <tbody>
                {detail.differences.map((difference) => (
                  <tr key={difference.id}>
                    <td>
                      {DIFFERENCE_LABELS[difference.type] ?? difference.type}
                    </td>
                    <td>{difference.imei}</td>
                    <td>{difference.skuName ?? "—"}</td>
                    <td>{difference.note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="print-sign-row">
            <span>盘点人：{detail.createdByName ?? "＿＿＿＿＿＿"}</span>
            <span>审批人：{detail.approvedByName ?? "＿＿＿＿＿＿"}</span>
            <span>仓库负责人签字：＿＿＿＿＿＿</span>
            <span>日期：＿＿＿＿年＿＿月＿＿日</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
