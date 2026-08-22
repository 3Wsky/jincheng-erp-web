"use client";

import {
  AuthMeResponseSchema,
  PersonalStockDetailSchema,
  PersonalStockListSchema,
  PersonalStockMineSchema,
  WarehouseSerialListSchema,
  type AuthUser,
  type PersonalStockDetail,
  type PersonalStockList,
  type PersonalStockMine,
  type PersonalStockStatusValue,
  type PersonalStockTypeValue,
  type WarehouseSerialItem,
} from "@jincheng/contracts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ui/feedback";

const PAGE_SIZE = 20;

const TYPE_LABELS: Record<PersonalStockTypeValue, string> = {
  ISSUE: "领用",
  RETURN: "归还",
  HANDOVER: "转交",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  SUBMITTED: "待确认",
  CONFIRMED: "已确认",
  CANCELLED: "已取消",
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  DRAFT: "status-inactive",
  SUBMITTED: "status-preview",
  CONFIRMED: "status-active",
  CANCELLED: "status-inactive",
};

const LINE_STATUS_LABELS: Record<string, string> = {
  PENDING: "待锁定",
  LOCKED: "已锁定",
  DONE: "已完成",
};

const FILTER_TABS: Array<{
  value: PersonalStockStatusValue | "";
  label: string;
}> = [
  { value: "", label: "全部" },
  { value: "DRAFT", label: "草稿" },
  { value: "SUBMITTED", label: "待确认" },
  { value: "CONFIRMED", label: "已确认" },
  { value: "CANCELLED", label: "已取消" },
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
    (part): part is string => typeof part === "string" && part.trim() !== "",
  );
  if (parts.length === 2 && parts[1]!.startsWith(parts[0]!)) return parts[1]!;
  return parts.join(" ") || "—";
}

export function PersonalStockManager({
  autoCreate = false,
}: {
  autoCreate?: boolean;
}) {
  const toast = useToast();
  const [me, setMe] = useState<AuthUser | null>(null);
  const [tab, setTab] = useState<"mine" | "orders">("mine");
  const [mine, setMine] = useState<PersonalStockMine | null>(null);
  const [mineError, setMineError] = useState<string | null>(null);
  const [list, setList] = useState<PersonalStockList | null>(null);
  const [statusFilter, setStatusFilter] = useState<PersonalStockStatusValue | "">(
    "",
  );
  const [typeFilter, setTypeFilter] = useState<PersonalStockTypeValue | "">("");
  const [page, setPage] = useState(1);
  const [listError, setListError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const [detail, setDetail] = useState<PersonalStockDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createType, setCreateType] = useState<PersonalStockTypeValue>("ISSUE");
  const [fromWarehouseId, setFromWarehouseId] = useState("");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [remark, setRemark] = useState("");
  const [serialSearch, setSerialSearch] = useState("");
  const [serialOptions, setSerialOptions] = useState<WarehouseSerialItem[]>([]);
  const [serialLoading, setSerialLoading] = useState(false);
  const [picked, setPicked] = useState<WarehouseSerialItem[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);

  const canWrite = Boolean(me?.permissions.includes("inventory:write"));

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const payload = AuthMeResponseSchema.parse(
          await fetchJson("/api/auth/me"),
        );
        if (active) setMe(payload);
      } catch {
        if (active) setMe(null);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          const payload = PersonalStockMineSchema.parse(
            await fetchJson("/api/personal-stock/mine?page=1&pageSize=100"),
          );
          if (active) {
            setMine(payload);
            setMineError(null);
          }
        } catch (loadError) {
          if (active) setMineError(messageOf(loadError));
        }
      })();
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [refreshTick]);

  useEffect(() => {
    if (tab !== "orders") return;
    let active = true;
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          const params = new URLSearchParams({
            page: String(page),
            pageSize: String(PAGE_SIZE),
          });
          if (statusFilter) params.set("status", statusFilter);
          if (typeFilter) params.set("type", typeFilter);
          const payload = PersonalStockListSchema.parse(
            await fetchJson(`/api/personal-stock/orders?${params}`),
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
  }, [tab, statusFilter, typeFilter, page, refreshTick]);

  const refresh = useCallback(() => setRefreshTick((value) => value + 1), []);

  const openDetail = useCallback(async (id: string) => {
    setDetailOpen(true);
    setDetail(null);
    setDetailError(null);
    setActionError(null);
    setDetailLoading(true);
    try {
      const payload = PersonalStockDetailSchema.parse(
        await fetchJson(`/api/personal-stock/orders/${id}`),
      );
      setDetail(payload);
    } catch (loadError) {
      setDetailError(messageOf(loadError));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  /** 执行状态机命令(successMessage 为成功后的全局提示文案) */
  const runCommand = useCallback(
    async (key: string, path: string, successMessage?: string) => {
      if (!detail) return;
      setBusy(key);
      setActionError(null);
      try {
        const payload = PersonalStockDetailSchema.parse(
          await fetchJson(`/api/personal-stock/orders/${detail.id}${path}`, {
            method: "POST",
          }),
        );
        setDetail(payload);
        refresh();
        if (successMessage) toast.success(successMessage);
      } catch (commandError) {
        setActionError(messageOf(commandError));
      } finally {
        setBusy(null);
      }
    },
    [detail, refresh, toast],
  );

  const applyCreateDefaults = useCallback(
    (type: PersonalStockTypeValue, snapshot: PersonalStockMine) => {
      const myId = snapshot.myPersonalWarehouseId ?? "";
      if (type === "ISSUE") {
        setFromWarehouseId(
          snapshot.publicWarehouses.find((item) => item.serialCount > 0)?.id ??
            snapshot.publicWarehouses[0]?.id ??
            "",
        );
        setToWarehouseId(myId);
      } else if (type === "RETURN") {
        setFromWarehouseId(myId);
        setToWarehouseId(snapshot.publicWarehouses[0]?.id ?? "");
      } else {
        setFromWarehouseId(myId);
        setToWarehouseId(snapshot.handoverTargets[0]?.warehouseId ?? "");
      }
    },
    [],
  );

  const openCreate = useCallback(() => {
    if (!mine) return;
    setShowCreate(true);
    setCreateError(null);
    setPicked([]);
    setSerialOptions([]);
    setSerialSearch("");
    setRemark("");
    setCreateType("ISSUE");
    applyCreateDefaults("ISSUE", mine);
  }, [mine, applyCreateDefaults]);

  // 顶栏「新建业务」入口:?new=1 到达时直接打开新建抽屉(仅首次)。
  // openCreate 依赖 mine 快照(未加载时直接 return),故需等 mine 就绪后再触发。
  const autoCreateDone = useRef(false);
  useEffect(() => {
    if (!autoCreate || autoCreateDone.current || !mine) return;
    autoCreateDone.current = true;
    const handle = window.setTimeout(() => openCreate(), 0);
    return () => window.clearTimeout(handle);
  }, [autoCreate, mine, openCreate]);

  useEffect(() => {
    if (!showCreate || !fromWarehouseId) return;
    let active = true;
    const handle = window.setTimeout(() => {
      void (async () => {
        if (active) setSerialLoading(true);
        try {
          const params = new URLSearchParams({ page: "1", pageSize: "20" });
          if (serialSearch.trim()) params.set("search", serialSearch.trim());
          const payload = WarehouseSerialListSchema.parse(
            await fetchJson(
              `/api/inventory/warehouses/${fromWarehouseId}/serials?${params}`,
            ),
          );
          if (active) {
            setSerialOptions(
              payload.items.filter(
                (item) => item.status === "NORMAL" || item.status === "PERSONAL",
              ),
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

  const createOrder = useCallback(async () => {
    setBusy("create");
    setCreateError(null);
    try {
      const payload = PersonalStockDetailSchema.parse(
        await fetchJson("/api/personal-stock/orders", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            type: createType,
            fromWarehouseId,
            toWarehouseId,
            serialIds: picked.map((item) => item.id),
            remark: remark.trim() || undefined,
          }),
        }),
      );
      setShowCreate(false);
      setTab("orders");
      refresh();
      setDetail(payload);
      setDetailOpen(true);
      toast.success(`${TYPE_LABELS[createType]}单已创建，请提交锁库`);
    } catch (submitError) {
      setCreateError(messageOf(submitError));
    } finally {
      setBusy(null);
    }
  }, [createType, fromWarehouseId, toWarehouseId, picked, remark, refresh, toast]);

  const personalDestinations = useMemo(() => {
    if (!mine) return [];
    if (canWrite) return mine.warehouses;
    return mine.warehouses.filter(
      (warehouse) => warehouse.id === mine.myPersonalWarehouseId,
    );
  }, [mine, canWrite]);

  const canConfirm = Boolean(
    detail &&
      detail.status === "SUBMITTED" &&
      (detail.type === "HANDOVER"
        ? detail.toEmployeeId === me?.employeeId
        : canWrite),
  );

  const groupedMine = useMemo(() => {
    if (!mine) return [];
    return mine.warehouses.map((warehouse) => ({
      warehouse,
      items: mine.items.filter((item) => item.warehouseId === warehouse.id),
    }));
  }, [mine]);

  return (
    <div className="transfer-manager">
      <section className="panel transfer-toolbar-panel">
        <div className="status-chips">
          <button
            className={`status-chip ${tab === "mine" ? "active" : ""}`}
            type="button"
            onClick={() => setTab("mine")}
          >
            我的库存
          </button>
          <button
            className={`status-chip ${tab === "orders" ? "active" : ""}`}
            type="button"
            onClick={() => setTab("orders")}
          >
            单据
          </button>
        </div>
        <button className="button primary" type="button" onClick={openCreate}>
          新建单据
        </button>
      </section>

      {tab === "mine" ? (
        mineError ? (
          <div className="alert error">{mineError}</div>
        ) : !mine ? (
          <section className="panel">正在加载个人库存…</section>
        ) : mine.warehouses.length === 0 ? (
          <section className="panel search-guide">
            <strong>还没有可查看的个人仓</strong>
            <small>
              销售账号需先在「组织与员工」划分个人仓。店长看本店，管理员看全部。
            </small>
          </section>
        ) : (
          <div className="tasks-grid">
            {groupedMine.map(({ warehouse, items }) => (
              <section className="panel task-group" key={warehouse.id}>
                <div className="task-group-head">
                  <strong>{warehouse.name}</strong>
                  <b className="task-group-count">{warehouse.serialCount}</b>
                </div>
                <small className="search-sub">
                  {warehouse.ownerEmployeeName ?? "未划分主人"}
                  {warehouse.storeName ? ` · ${warehouse.storeName}` : ""}
                </small>
                {items.length === 0 ? (
                  <p className="drawer-empty">该仓当前没有在库设备</p>
                ) : (
                  <ul>
                    {items.map((item) => (
                      <li key={item.id}>
                        <span className="mono task-item-code">
                          {item.imeiPrimary}
                        </span>
                        <span className="task-item-title">
                          {productLabel(item.productBrand, item.productModel)} ·{" "}
                          {item.status === "LOCKED" ? "锁定中" : "在库"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        )
      ) : null}

      {tab === "orders" ? (
        <>
          <section className="panel transfer-toolbar-panel">
            <div className="status-chips">
              {FILTER_TABS.map((chip) => (
                <button
                  className={`status-chip ${statusFilter === chip.value ? "active" : ""}`}
                  key={chip.label}
                  type="button"
                  onClick={() => {
                    setStatusFilter(chip.value);
                    setPage(1);
                  }}
                >
                  {chip.label}
                </button>
              ))}
            </div>
            <select
              className="input"
              value={typeFilter}
              onChange={(event) => {
                setTypeFilter(
                  event.target.value as PersonalStockTypeValue | "",
                );
                setPage(1);
              }}
            >
              <option value="">全部类型</option>
              <option value="ISSUE">领用</option>
              <option value="RETURN">归还</option>
              <option value="HANDOVER">转交</option>
            </select>
          </section>
          {listError ? <div className="alert error">{listError}</div> : null}
          {!list ? (
            <section className="panel">正在加载单据…</section>
          ) : list.items.length === 0 ? (
            <section className="panel search-guide">
              <strong>暂无个人库存单据</strong>
              <small>领用、归还、转交都会出现在这里，提交后等待对方确认。</small>
            </section>
          ) : (
            <section className="panel search-results">
              <div className="sku-table-wrap">
              <table className="sku-table search-table">
                <thead>
                  <tr>
                    <th>单号</th>
                    <th>类型</th>
                    <th>状态</th>
                    <th>从</th>
                    <th>到</th>
                    <th>台数</th>
                    <th>创建</th>
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
                      <td>{TYPE_LABELS[item.type]}</td>
                      <td>
                        <span
                          className={`status-badge ${STATUS_BADGE_CLASS[item.status] ?? ""}`}
                        >
                          {STATUS_LABELS[item.status]}
                        </span>
                      </td>
                      <td>{item.fromWarehouse.name}</td>
                      <td>{item.toWarehouse.name}</td>
                      <td>{item.lineCount}</td>
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
                    onClick={() => setPage((value) => value - 1)}
                  >
                    上一页
                  </button>
                  <span>
                    {page} / {list.totalPages}
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
        </>
      ) : null}

      {detailOpen ? (
        <div className="drawer-backdrop" onClick={() => setDetailOpen(false)}>
          <aside
            className="drawer transfer-drawer"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <small>个人库存单据</small>
                <h2>{detail?.code ?? "详情"}</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setDetailOpen(false)}
              >
                ✕
              </button>
            </header>
            {detailLoading ? (
              <p className="drawer-empty">正在加载单据…</p>
            ) : detailError ? (
              <p className="drawer-empty error">{detailError}</p>
            ) : detail ? (
              <>
                <div className="drawer-stats transfer-stats">
                  <div>
                    <span>类型 / 状态</span>
                    <strong>
                      {TYPE_LABELS[detail.type]} ·{" "}
                      <span
                        className={`status-badge ${STATUS_BADGE_CLASS[detail.status] ?? ""}`}
                      >
                        {STATUS_LABELS[detail.status]}
                      </span>
                    </strong>
                  </div>
                  <div>
                    <span>路径</span>
                    <strong>
                      {detail.fromWarehouse.name} → {detail.toWarehouse.name}
                    </strong>
                  </div>
                </div>
                {detail.remark ? (
                  <p className="transfer-remark">备注：{detail.remark}</p>
                ) : null}
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
                        onClick={() =>
                          void runCommand(
                            "submit",
                            "/submit",
                            `${TYPE_LABELS[detail.type]}单已提交，等待${detail.type === "HANDOVER" ? "对方" : "库管"}确认`,
                          )
                        }
                      >
                        提交并锁库
                      </button>
                      <button
                        className="button secondary"
                        disabled={busy !== null}
                        type="button"
                        onClick={() =>
                          void runCommand("cancel", "/cancel", "单据已取消")
                        }
                      >
                        取消
                      </button>
                    </>
                  ) : null}
                  {canConfirm ? (
                    <button
                      className="button primary"
                      disabled={busy !== null}
                      type="button"
                      onClick={() =>
                        void runCommand(
                          "confirm",
                          "/confirm",
                          detail.type === "HANDOVER"
                            ? "已确认接收，库存已落位"
                            : "已确认，库存已落位",
                        )
                      }
                    >
                      {detail.type === "HANDOVER" ? "确认接收" : "确认落位"}
                    </button>
                  ) : null}
                  {detail.status === "SUBMITTED" ? (
                    <button
                      className="button secondary"
                      disabled={busy !== null}
                      type="button"
                      onClick={() =>
                        void runCommand(
                          "cancel",
                          "/cancel",
                          "单据已取消，锁定已释放",
                        )
                      }
                    >
                      取消并解锁
                    </button>
                  ) : null}
                </div>
                <ol className="transfer-steps">
                  <li className="done">
                    <b>创建</b>
                    <small>
                      {formatDateTime(detail.createdAt)} ·{" "}
                      {detail.createdByName ?? "—"}
                    </small>
                  </li>
                  <li className={detail.submittedAt ? "done" : ""}>
                    <b>提交锁库</b>
                    <small>{formatDateTime(detail.submittedAt)}</small>
                  </li>
                  <li className={detail.confirmedAt ? "done" : ""}>
                    <b>确认落位</b>
                    <small>
                      {formatDateTime(detail.confirmedAt)}
                      {detail.confirmedByName
                        ? ` · ${detail.confirmedByName}`
                        : ""}
                    </small>
                  </li>
                  {detail.status === "CANCELLED" ? (
                    <li className="done">
                      <b>已取消</b>
                      <small>{formatDateTime(detail.cancelledAt)}</small>
                    </li>
                  ) : null}
                </ol>
                <div className="drawer-section">
                  <h3>明细（{detail.lines.length} 台）</h3>
                </div>
                <div className="drawer-table-wrap">
                  <table className="drawer-table">
                    <thead>
                      <tr>
                        <th>IMEI</th>
                        <th>商品</th>
                        <th>行状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.lines.map((line) => (
                        <tr key={line.id}>
                          <td className="mono">{line.imeiPrimary}</td>
                          <td>
                            {productLabel(line.productBrand, line.productModel)}
                            <small className="search-sub">{line.skuName}</small>
                          </td>
                          <td>
                            {LINE_STATUS_LABELS[line.status] ?? line.status}
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

      {showCreate && mine ? (
        <div className="drawer-backdrop" onClick={() => setShowCreate(false)}>
          <aside
            className="drawer transfer-drawer"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <small>新建个人库存单据</small>
                <h2>{TYPE_LABELS[createType]}</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setShowCreate(false)}
              >
                ✕
              </button>
            </header>
            <div className="transfer-form">
              <label>
                <span>类型</span>
                <select
                  value={createType}
                  onChange={(event) => {
                    const next = event.target.value as PersonalStockTypeValue;
                    setCreateType(next);
                    setPicked([]);
                    applyCreateDefaults(next, mine);
                  }}
                >
                  <option value="ISSUE">领用（公共库 → 个人仓）</option>
                  <option value="RETURN">归还（个人仓 → 公共库）</option>
                  <option value="HANDOVER">转交（个人仓 → 他人个人仓）</option>
                </select>
              </label>
              <label>
                <span>调出仓</span>
                <select
                  value={fromWarehouseId}
                  onChange={(event) => {
                    setFromWarehouseId(event.target.value);
                    setPicked([]);
                  }}
                >
                  {(createType === "ISSUE"
                    ? mine.publicWarehouses
                    : personalDestinations
                  ).map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                      {warehouse.ownerEmployeeName
                        ? ` · ${warehouse.ownerEmployeeName}`
                        : ""}
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
                  {createType === "ISSUE"
                    ? personalDestinations.map((warehouse) => (
                        <option key={warehouse.id} value={warehouse.id}>
                          {warehouse.name}
                          {warehouse.ownerEmployeeName
                            ? ` · ${warehouse.ownerEmployeeName}`
                            : ""}
                        </option>
                      ))
                    : null}
                  {createType === "RETURN"
                    ? mine.publicWarehouses.map((warehouse) => (
                        <option key={warehouse.id} value={warehouse.id}>
                          {warehouse.name}
                        </option>
                      ))
                    : null}
                  {createType === "HANDOVER"
                    ? mine.handoverTargets.map((target) => (
                        <option
                          key={target.warehouseId}
                          value={target.warehouseId}
                        >
                          {target.employeeName} · {target.warehouseName}
                        </option>
                      ))
                    : null}
                </select>
              </label>
              <label>
                <span>扫码 / 搜索设备</span>
                <input
                  placeholder="IMEI / 型号"
                  value={serialSearch}
                  onChange={(event) => setSerialSearch(event.target.value)}
                />
              </label>
            </div>
            {serialLoading ? (
              <p className="drawer-empty">正在查找设备…</p>
            ) : (
              <ul className="transfer-serial-options">
                {serialOptions.map((item) => (
                  <li key={item.id}>
                    <div>
                      <b className="mono">{item.imeiPrimary}</b>
                      <small>
                        {productLabel(item.productBrand, item.productModel)} ·{" "}
                        {item.skuName}
                      </small>
                    </div>
                    <button
                      className="button small"
                      disabled={picked.some((pickedItem) => pickedItem.id === item.id)}
                      type="button"
                      onClick={() =>
                        setPicked((current) =>
                          current.some((pickedItem) => pickedItem.id === item.id)
                            ? current
                            : [...current, item],
                        )
                      }
                    >
                      加入
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="transfer-picked">
              <span>已选 {picked.length} 台</span>
              <ul>
                {picked.map((item) => (
                  <li key={item.id}>
                    <b className="mono">{item.imeiPrimary}</b>
                    <button
                      type="button"
                      onClick={() =>
                        setPicked((current) =>
                          current.filter((pickedItem) => pickedItem.id !== item.id),
                        )
                      }
                    >
                      移除
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <label className="transfer-form">
              <span>备注</span>
              <input
                maxLength={500}
                value={remark}
                onChange={(event) => setRemark(event.target.value)}
              />
            </label>
            {createError ? (
              <div className="alert error transfer-alert">{createError}</div>
            ) : null}
            {!mine.myPersonalWarehouseId && createType !== "ISSUE" ? (
              <div className="alert error transfer-alert">
                当前账号还没有个人仓，请先在组织管理划分。
              </div>
            ) : null}
            <div className="transfer-actions">
              <button
                className="button primary"
                disabled={
                  busy !== null ||
                  picked.length === 0 ||
                  !fromWarehouseId ||
                  !toWarehouseId
                }
                type="button"
                onClick={() => void createOrder()}
              >
                创建草稿
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
