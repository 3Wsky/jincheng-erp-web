"use client";

import {
  SearchSummarySchema,
  SerialDetailSchema,
  SerialSearchResultSchema,
  type SearchSummary,
  type SearchSummarySkuGroup,
  type SerialDetail,
  type SerialSearchResult,
  type SerialStatusValue,
} from "@jincheng/contracts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Drawer } from "@/components/ui/drawer";

const PAGE_SIZE = 20;
/** 输入停顿多少毫秒后自动搜索 */
const SEARCH_DEBOUNCE_MS = 350;

/** 序列号状态中文与徽章配色 */
const STATUS_LABELS: Record<string, string> = {
  NORMAL: "正常在库",
  LOCKED: "锁定",
  IN_TRANSIT: "调拨在途",
  PENDING_CONFIRM: "待确认",
  PERSONAL: "个人库",
  SOLD: "已售出",
  AFTER_SALES: "售后中",
  ABNORMAL: "异常",
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  NORMAL: "status-active",
  LOCKED: "status-preview",
  IN_TRANSIT: "status-preview",
  PENDING_CONFIRM: "status-preview",
  PERSONAL: "status-info",
  SOLD: "status-inactive",
  AFTER_SALES: "status-danger",
  ABNORMAL: "status-danger",
};

const WAREHOUSE_TYPE_LABELS: Record<string, string> = {
  COMPANY: "公司总仓",
  STORE: "门店仓",
  PERSONAL: "个人仓",
  AFTER_SALES: "售后仓",
  ABNORMAL: "异常仓",
};

/** 库存流水类型中文(与 Prisma MovementType 对应) */
const MOVEMENT_LABELS: Record<string, string> = {
  PURCHASE_RECEIPT: "采购入库",
  TRANSFER_OUT: "调拨出库",
  TRANSFER_IN: "调拨入库",
  PERSONAL_ISSUE: "个人领用",
  PERSONAL_RETURN: "个人归还",
  SALE: "销售出库",
  SALE_RETURN: "销售退回",
  STOCK_GAIN: "盘盈入库",
  STOCK_LOSS: "盘亏出库",
  DAMAGE: "报损出库",
  BORROW: "借出",
  BORROW_RETURN: "借出归还",
  AFTER_SALES_OUT: "送修出库",
  AFTER_SALES_IN: "售后入库",
};

/** 单据类型中文(承接期初建账与业务单据) */
const DOCUMENT_LABELS: Record<string, string> = {
  OPENING_BALANCE: "期初建账",
  TRANSFER: "调拨单",
  PURCHASE: "采购单",
  STOCKTAKE: "盘点单",
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "请求失败，请稍后重试";
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store" });
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

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatCount(value: number): string {
  return value.toLocaleString("zh-CN");
}

/** 零售价展示:null=未定价(不展示伪数据) */
function formatPrice(value: string | null): string | null {
  if (!value) return null;
  const amount = Number(value);
  if (Number.isNaN(amount)) return null;
  return `¥${amount.toLocaleString("zh-CN")}`;
}

/** 商品展示名:品牌 + 型号(去重复、去空) */
function productLabel(brand: string | null, model: string | null): string {
  const parts = [brand, model].filter(
    (part): part is string => Boolean(part) && part!.trim() !== "",
  );
  if (parts.length === 2 && parts[1]!.startsWith(parts[0]!)) return parts[1]!;
  return parts.join(" ") || "—";
}

/** 明细下钻过滤:点击聚合卡片后仅看该商品 */
interface SkuFilter {
  skuId: string;
  skuName: string;
}

/** 多型号对比模式:一个关键词对应一节汇总(2026-08-12 验收需求:分别统计+汇总+打印) */
interface MultiQueryEntry {
  term: string;
  summary: SearchSummary;
}

/** 解析多关键词:逗号/分号/顿号分隔,最多 5 个 */
function splitTerms(keyword: string): string[] {
  return keyword
    .split(/[,;，；、]+/)
    .map((term) => term.trim())
    .filter(Boolean)
    .slice(0, 5);
}

/** 一节汇总中真机的可售/在途/其他合计 */
function sectionTotals(summary: SearchSummary) {
  const primary = summary.skuGroups.filter((group) => group.kind === "primary");
  return {
    available: primary.reduce((sum, group) => sum + group.availableTotal, 0),
    pending: primary.reduce((sum, group) => sum + group.pendingTotal, 0),
    other: primary.reduce((sum, group) => sum + group.otherTotal, 0),
    skuCount: primary.length,
  };
}

/** 次要分组徽章(配件/演示机) */
const KIND_BADGES: Record<string, { label: string; className: string }> = {
  accessory: { label: "配件", className: "status-inactive" },
  demo: { label: "演示机", className: "status-preview" },
};

/** 聚合卡片(真机与配件/演示机共用,次要分组带徽章) */
function SummaryCard({
  group,
  onClick,
}: {
  group: SearchSummarySkuGroup;
  onClick: () => void;
}) {
  const badge = KIND_BADGES[group.kind];
  return (
    <article
      className={`summary-card ${group.kind !== "primary" ? "secondary" : ""}`}
      onClick={onClick}
    >
      <header>
        <div className="summary-card-title">
          <strong>
            {badge ? (
              <span className={`status-badge ${badge.className} summary-kind-badge`}>
                {badge.label}
              </span>
            ) : null}
            {group.skuName}
          </strong>
          <small className="mono">{group.skuCode}</small>
          {formatPrice(group.retailPrice) ? (
            <span className="summary-price">
              <em>官网价</em>
              {formatPrice(group.retailPrice)}
            </span>
          ) : (
            <span className="summary-price unpriced">官网价未收录</span>
          )}
        </div>
        <div
          className={`summary-available ${group.availableTotal === 0 ? "none" : ""}`}
        >
          <b>{formatCount(group.availableTotal)}</b>
          <span>台可售</span>
        </div>
      </header>
      {group.pendingTotal > 0 || group.otherTotal > 0 ? (
        <p className="summary-secondary">
          {group.pendingTotal > 0 ? `在途/锁定 ${group.pendingTotal} 台` : ""}
          {group.pendingTotal > 0 && group.otherTotal > 0 ? " · " : ""}
          {group.otherTotal > 0 ? `售后/异常等 ${group.otherTotal} 台` : ""}
        </p>
      ) : null}
      <div className="summary-warehouses">
        {group.warehouses
          .filter((warehouse) => warehouse.available > 0)
          .slice(0, 8)
          .map((warehouse) => (
            <span className="wh-chip" key={warehouse.warehouseId}>
              {warehouse.warehouseName}
              <b>{warehouse.available}</b>
            </span>
          ))}
        {group.warehouses.filter((w) => w.available > 0).length > 8 ? (
          <span className="wh-chip more">
            等 {group.warehouses.filter((w) => w.available > 0).length} 个仓库
          </span>
        ) : null}
        {group.availableTotal === 0 ? (
          <span className="wh-chip none">各仓库均无可售库存</span>
        ) : null}
      </div>
    </article>
  );
}

export function GlobalSearch({ initialKeyword = "" }: { initialKeyword?: string }) {
  const [keyword, setKeyword] = useState(initialKeyword);
  /** summary=按商品聚合(找货第一步,默认);list=逐台明细 */
  const [view, setView] = useState<"summary" | "list">("summary");
  const [skuFilter, setSkuFilter] = useState<SkuFilter | null>(null);
  const [statusFilter, setStatusFilter] = useState<SerialStatusValue | "">("");
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState<SearchSummary | null>(null);
  /** 多型号对比模式的结果(逗号分隔多关键词时启用,单关键词为 null) */
  const [multiSummary, setMultiSummary] = useState<MultiQueryEntry[] | null>(
    null,
  );
  const [result, setResult] = useState<SerialSearchResult | null>(null);
  const [searchedKeyword, setSearchedKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<SerialDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  /** 聚合视图分类筛选:颜色 / 规格(本地过滤,无需回后端) */
  const [colorFilter, setColorFilter] = useState("");
  const [specFilter, setSpecFilter] = useState("");
  /** 失败重试计数:自增触发搜索 effect 重新执行 */
  const [retryTick, setRetryTick] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  /** 防抖搜索:按当前视图拉聚合或明细;回调在定时器内执行,不属于同步 setState */
  useEffect(() => {
    let active = true;
    const handle = window.setTimeout(() => {
      void (async () => {
        const q = keyword.trim();
        if (!q) {
          if (active) {
            setSummary(null);
            setMultiSummary(null);
            setResult(null);
            setSearchedKeyword("");
            setError(null);
            setLoading(false);
            setColorFilter("");
            setSpecFilter("");
          }
          return;
        }
        if (active) setLoading(true);
        try {
          const terms = splitTerms(q);
          if (terms.length > 1) {
            // 多型号对比:并行查询各关键词的聚合,分节展示+汇总+打印
            const entries = await Promise.all(
              terms.map(async (term) => ({
                term,
                summary: SearchSummarySchema.parse(
                  await fetchJson(
                    `/api/inventory/search/summary?q=${encodeURIComponent(term)}`,
                  ),
                ),
              })),
            );
            if (active) {
              setMultiSummary(entries);
              setSummary(null);
              setSearchedKeyword(q);
              setError(null);
            }
          } else if (view === "summary") {
            const payload = SearchSummarySchema.parse(
              await fetchJson(
                `/api/inventory/search/summary?q=${encodeURIComponent(q)}`,
              ),
            );
            if (active) {
              setSummary(payload);
              setMultiSummary(null);
              setSearchedKeyword(q);
              setError(null);
            }
          } else {
            const params = new URLSearchParams({
              q,
              page: String(page),
              pageSize: String(PAGE_SIZE),
            });
            if (statusFilter) params.set("status", statusFilter);
            if (skuFilter) params.set("skuId", skuFilter.skuId);
            const payload = SerialSearchResultSchema.parse(
              await fetchJson(`/api/inventory/search?${params}`),
            );
            if (active) {
              setResult(payload);
              setSearchedKeyword(q);
              setError(null);
            }
          }
        } catch (searchError) {
          if (active) setError(messageOf(searchError));
        } finally {
          if (active) setLoading(false);
        }
      })();
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [keyword, view, skuFilter, statusFilter, page, retryTick]);

  /** 打开单机档案抽屉并加载流水时间线 */
  const openDetail = useCallback(async (id: string) => {
    setDetailOpen(true);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const payload = SerialDetailSchema.parse(
        await fetchJson(`/api/inventory/serials/${id}`),
      );
      setDetail(payload);
    } catch (loadError) {
      setDetailError(messageOf(loadError));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeDetail = useCallback(() => {
    setDetailOpen(false);
    setDetail(null);
    setDetailError(null);
  }, []);

  /** 点击聚合卡片:下钻到该商品的逐台明细 */
  const drillDown = useCallback((skuId: string, skuName: string) => {
    setSkuFilter({ skuId, skuName });
    setView("list");
    setStatusFilter("");
    setPage(1);
  }, []);

  /** 切回聚合视图并清除下钻过滤 */
  const backToSummary = useCallback(() => {
    setView("summary");
    setSkuFilter(null);
    setStatusFilter("");
    setPage(1);
  }, []);

  const hasQuery = keyword.trim() !== "";
  const totalMatched = result
    ? result.byStatus.reduce((sum, group) => sum + group.count, 0)
    : 0;

  /**
   * 联动分类桶:只统计「有可售库存的真机」(配件/演示机归拢在次要区不参与分类);
   * 规格桶受已选颜色约束、颜色桶受已选规格约束——选 16+512 后颜色行只剩
   * 该规格下有货的颜色(2026-08-12 验收口径)。
   */
  const facets = useMemo(() => {
    if (!summary) return { colors: [], specs: [] };
    const stocked = summary.skuGroups.filter(
      (group) => group.kind === "primary" && group.availableTotal > 0,
    );
    const bucket = (groups: typeof stocked, key: "color" | "spec") => {
      const map = new Map<string, number>();
      for (const group of groups) {
        const value = group[key];
        if (value) map.set(value, (map.get(value) ?? 0) + 1);
      }
      return [...map.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort(
          (a, b) =>
            b.count - a.count || a.value.localeCompare(b.value, "zh-CN"),
        );
    };
    return {
      specs: bucket(
        colorFilter
          ? stocked.filter((group) => group.color === colorFilter)
          : stocked,
        "spec",
      ),
      colors: bucket(
        specFilter
          ? stocked.filter((group) => group.spec === specFilter)
          : stocked,
        "color",
      ),
    };
  }, [summary, colorFilter, specFilter]);

  /** 选择规格:若已选颜色在新规格下无有货真机,自动清除颜色筛选 */
  const pickSpec = useCallback(
    (value: string) => {
      const next = specFilter === value ? "" : value;
      setSpecFilter(next);
      if (next && colorFilter && summary) {
        const stillValid = summary.skuGroups.some(
          (group) =>
            group.kind === "primary" &&
            group.availableTotal > 0 &&
            group.spec === next &&
            group.color === colorFilter,
        );
        if (!stillValid) setColorFilter("");
      }
    },
    [specFilter, colorFilter, summary],
  );

  /** 选择颜色:若已选规格在新颜色下无有货真机,自动清除规格筛选 */
  const pickColor = useCallback(
    (value: string) => {
      const next = colorFilter === value ? "" : value;
      setColorFilter(next);
      if (next && specFilter && summary) {
        const stillValid = summary.skuGroups.some(
          (group) =>
            group.kind === "primary" &&
            group.availableTotal > 0 &&
            group.color === next &&
            group.spec === specFilter,
        );
        if (!stillValid) setSpecFilter("");
      }
    },
    [colorFilter, specFilter, summary],
  );

  return (
    <div className="serial-search-page">
      {/* 搜索输入区 */}
      <section className="panel search-hero-panel">
        <div className="search-hero">
          <input
            ref={inputRef}
            aria-label="全局查货关键字"
            autoFocus
            className="search-hero-input"
            placeholder="输入 IMEI / SN / SKU / 型号（如 mate80pro）；逗号分隔多个型号可对比汇总并打印"
            value={keyword}
            onChange={(event) => {
              setKeyword(event.target.value);
              setPage(1);
            }}
          />
          {keyword ? (
            <button
              aria-label="清空搜索"
              className="search-hero-clear"
              type="button"
              onClick={() => {
                setKeyword("");
                setPage(1);
                setStatusFilter("");
                setSkuFilter(null);
                setView("summary");
                inputRef.current?.focus();
              }}
            >
              ✕
            </button>
          ) : null}
        </div>

        {/* 视图切换 + 下钻标签(多型号对比模式下隐藏,该模式为聚合专用) */}
        {hasQuery && splitTerms(keyword).length <= 1 ? (
          <div className="search-view-bar">
            <div className="inventory-segmented" role="tablist" aria-label="展示方式">
              <button
                className={view === "summary" ? "active" : ""}
                role="tab"
                type="button"
                onClick={backToSummary}
              >
                按商品看库存
              </button>
              <button
                className={view === "list" ? "active" : ""}
                role="tab"
                type="button"
                onClick={() => {
                  setView("list");
                  setPage(1);
                }}
              >
                逐台明细
              </button>
            </div>
            {skuFilter ? (
              <span className="search-drill-tag">
                仅看：{skuFilter.skuName}
                <button
                  aria-label="清除商品过滤"
                  type="button"
                  onClick={() => {
                    setSkuFilter(null);
                    setPage(1);
                  }}
                >
                  ✕
                </button>
              </span>
            ) : null}
          </div>
        ) : null}

        {/* 状态分布 chips:仅明细视图 */}
        {view === "list" && result && result.byStatus.length > 0 ? (
          <div className="status-chips" role="tablist" aria-label="按状态筛选">
            <button
              className={`status-chip ${statusFilter === "" ? "active" : ""}`}
              role="tab"
              type="button"
              onClick={() => {
                setStatusFilter("");
                setPage(1);
              }}
            >
              全部 <b>{formatCount(totalMatched)}</b>
            </button>
            {result.byStatus.map((group) => (
              <button
                className={`status-chip ${statusFilter === group.status ? "active" : ""}`}
                key={group.status}
                role="tab"
                type="button"
                onClick={() => {
                  setStatusFilter(
                    statusFilter === group.status ? "" : group.status,
                  );
                  setPage(1);
                }}
              >
                {STATUS_LABELS[group.status] ?? group.status}{" "}
                <b>{formatCount(group.count)}</b>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {/* 结果区 */}
      {!hasQuery ? (
        <section className="panel search-guide">
          <strong>输入关键字开始查货</strong>
          <ul>
            <li>型号支持连写：mate80promax 与 Mate 80 Pro Max 都能查到</li>
            <li>整串或部分 IMEI / SN：定位到具体一台设备</li>
            <li>SKU 编码 / 条码：查看该款商品在各仓库的分布</li>
          </ul>
          <small>
            默认按商品汇总展示「哪个仓库有几台可售」；点击商品卡片可下钻到逐台明细与流转时间线。
          </small>
        </section>
      ) : error ? (
        <div className="alert error">
          {error}
          <button
            className="button small"
            type="button"
            onClick={() => setRetryTick((value) => value + 1)}
          >
            重试
          </button>
        </div>
      ) : multiSummary ? (
        /* ============ 多型号对比:分节统计 + 汇总 + 打印 ============ */
        (() => {
          const totals = multiSummary.map((entry) => ({
            term: entry.term,
            ...sectionTotals(entry.summary),
          }));
          const grandAvailable = totals.reduce(
            (sum, item) => sum + item.available,
            0,
          );
          return (
            <>
              <section className="panel multi-summary-bar">
                <div>
                  <strong>
                    合计可售 {formatCount(grandAvailable)} 台
                    {loading ? "（刷新中…）" : ""}
                  </strong>
                  <small>
                    {totals
                      .map((item) => `${item.term} ${item.available} 台`)
                      .join(" ＋ ")}
                    （真机口径，不含配件/演示机）
                  </small>
                </div>
                <button
                  className="button primary"
                  type="button"
                  onClick={() => window.print()}
                >
                  打印汇总
                </button>
              </section>
              {multiSummary.map((entry) => {
                const section = sectionTotals(entry.summary);
                const primaryGroups = entry.summary.skuGroups.filter(
                  (group) => group.kind === "primary",
                );
                return (
                  <section className="multi-section" key={entry.term}>
                    <div className="multi-section-head">
                      <h2>{entry.term}</h2>
                      <span>
                        可售 <b>{formatCount(section.available)}</b> 台
                        {section.pending > 0
                          ? ` · 在途/锁定 ${section.pending}`
                          : ""}
                        {section.other > 0 ? ` · 其他 ${section.other}` : ""}
                        {` · ${section.skuCount} 款`}
                      </span>
                    </div>
                    {primaryGroups.length === 0 ? (
                      <section className="panel search-guide">
                        <strong>「{entry.term}」没有匹配的真机</strong>
                        <small>请检查关键词写法。</small>
                      </section>
                    ) : (
                      <div className="summary-grid">
                        {primaryGroups.map((group) => (
                          <SummaryCard
                            group={group}
                            key={group.skuId}
                            onClick={() => {
                              setKeyword(entry.term);
                              drillDown(group.skuId, group.skuName);
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </>
          );
        })()
      ) : view === "summary" ? (
        /* ============ 聚合视图:哪个仓库有几台 ============ */
        !summary && loading ? (
          <section className="panel search-guide">
            <strong>正在搜索…</strong>
          </section>
        ) : summary && summary.skuGroups.length === 0 ? (
          <section className="panel search-guide">
            <strong>没有找到与「{searchedKeyword}」匹配的货品</strong>
            <small>
              请检查关键字是否完整，或尝试更短的片段（型号关键词、IMEI 后 6 位等）。
            </small>
          </section>
        ) : summary ? (
          (() => {
            // 分类筛选只作用于真机;配件与演示机统一归拢在下方,不受筛选影响
            const primaryGroups = summary.skuGroups.filter(
              (group) =>
                group.kind === "primary" &&
                (colorFilter === "" || group.color === colorFilter) &&
                (specFilter === "" || group.spec === specFilter),
            );
            const secondaryGroups = summary.skuGroups.filter(
              (group) => group.kind !== "primary",
            );
            return (
              <>
                {/* 分类筛选:规格与颜色交叉联动,只统计有货真机 */}
                {facets.specs.length > 1 ? (
                  <div className="facet-row">
                    <span className="facet-label">规格</span>
                    <div className="status-chips">
                      <button
                        className={`status-chip ${specFilter === "" ? "active" : ""}`}
                        type="button"
                        onClick={() => setSpecFilter("")}
                      >
                        全部
                      </button>
                      {facets.specs.map((facet) => (
                        <button
                          className={`status-chip ${specFilter === facet.value ? "active" : ""}`}
                          key={facet.value}
                          type="button"
                          onClick={() => pickSpec(facet.value)}
                        >
                          {facet.value} <b>{facet.count}</b>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {facets.colors.length > 1 ? (
                  <div className="facet-row">
                    <span className="facet-label">颜色</span>
                    <div className="status-chips">
                      <button
                        className={`status-chip ${colorFilter === "" ? "active" : ""}`}
                        type="button"
                        onClick={() => setColorFilter("")}
                      >
                        全部
                      </button>
                      {facets.colors.map((facet) => (
                        <button
                          className={`status-chip ${colorFilter === facet.value ? "active" : ""}`}
                          key={facet.value}
                          type="button"
                          onClick={() => pickColor(facet.value)}
                        >
                          {facet.value} <b>{facet.count}</b>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="search-summary-meta">
                  匹配 <b>{formatCount(summary.totalSerials)}</b> 台 ·{" "}
                  <b>{summary.skuCount}</b> 款商品
                  {colorFilter || specFilter
                    ? `（筛选后真机 ${primaryGroups.length} 款）`
                    : primaryGroups.length > 0 && secondaryGroups.length > 0
                      ? `（真机 ${primaryGroups.length} 款 · 配件/演示机 ${secondaryGroups.length} 款）`
                      : ""}
                  {summary.truncated
                    ? "（结果过多，仅展示可售最多的 50 款，请细化关键词）"
                    : ""}
                  {loading ? " · 正在刷新…" : ""}
                </div>
                {primaryGroups.length === 0 &&
                (colorFilter || specFilter) ? (
                  <section className="panel search-guide">
                    <strong>当前筛选条件下没有真机</strong>
                    <small>试试切换或清除颜色/规格筛选。</small>
                  </section>
                ) : null}
                {primaryGroups.length > 0 ? (
                  <div className="summary-grid">
                    {primaryGroups.map((group) => (
                      <SummaryCard
                        group={group}
                        key={group.skuId}
                        onClick={() => drillDown(group.skuId, group.skuName)}
                      />
                    ))}
                  </div>
                ) : null}
                {secondaryGroups.length > 0 ? (
                  <>
                    <div className="summary-divider">
                      <span>配件与演示机（{secondaryGroups.length} 款）</span>
                    </div>
                    <div className="summary-grid secondary">
                      {secondaryGroups.map((group) => (
                        <SummaryCard
                          group={group}
                          key={group.skuId}
                          onClick={() => drillDown(group.skuId, group.skuName)}
                        />
                      ))}
                    </div>
                  </>
                ) : null}
              </>
            );
          })()
        ) : null
      ) : /* ============ 明细视图:逐台列表 ============ */
      result && result.items.length === 0 ? (
        <section className="panel search-guide">
          <strong>
            没有找到与「{searchedKeyword}」匹配的
            {statusFilter ? `「${STATUS_LABELS[statusFilter]}」状态` : ""}货品
          </strong>
          <small>
            请检查关键字是否完整，或尝试更短的片段（IMEI 后 6 位、型号关键词等）。
          </small>
        </section>
      ) : result ? (
        <section className="panel search-results">
          <div className="section-heading search-results-head">
            <div>
              <p className="eyebrow">逐台明细</p>
              <h2>
                匹配 {formatCount(result.total)} 台
                {statusFilter
                  ? ` · ${STATUS_LABELS[statusFilter] ?? statusFilter}`
                  : ""}
              </h2>
              <p>
                关键字「{searchedKeyword}」 · 按入库时间倒序
                {loading ? " · 正在刷新…" : ""}
              </p>
            </div>
          </div>
          <div className="sku-table-wrap">
            <table className="sku-table search-table">
              <thead>
                <tr>
                  <th>IMEI / SN</th>
                  <th>商品</th>
                  <th>SKU 编码</th>
                  <th>当前位置</th>
                  <th>责任人</th>
                  <th>状态</th>
                  <th>入库时间</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((item) => (
                  <tr
                    className="search-row"
                    key={item.id}
                    onClick={() => void openDetail(item.id)}
                  >
                    <td className="mono">
                      {item.imeiPrimary}
                      {item.serialNumber ? (
                        <small className="search-sub">
                          SN {item.serialNumber}
                        </small>
                      ) : null}
                    </td>
                    <td>
                      {productLabel(item.productBrand, item.productModel)}
                      <small className="search-sub">
                        {item.skuName}
                        {formatPrice(item.retailPrice)
                          ? ` · 官网价 ${formatPrice(item.retailPrice)}`
                          : ""}
                      </small>
                    </td>
                    <td className="mono">{item.skuCode}</td>
                    <td>
                      {item.warehouseName}
                      <small className="search-sub">
                        {WAREHOUSE_TYPE_LABELS[item.warehouseType] ??
                          item.warehouseType}
                        {item.storeName ? ` · ${item.storeName}` : ""}
                      </small>
                    </td>
                    <td>{item.responsibleEmployeeName ?? "—"}</td>
                    <td>
                      <span
                        className={`status-badge ${STATUS_BADGE_CLASS[item.status] ?? "status-inactive"}`}
                      >
                        {STATUS_LABELS[item.status] ?? item.status}
                      </span>
                    </td>
                    <td>{formatDateTime(item.receivedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.totalPages > 1 ? (
            <div className="search-pagination">
              <button
                className="button small"
                disabled={page <= 1 || loading}
                type="button"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                上一页
              </button>
              <span>
                第 {result.page} / {result.totalPages} 页 · 共{" "}
                {formatCount(result.total)} 台
              </span>
              <button
                className="button small"
                disabled={page >= result.totalPages || loading}
                type="button"
                onClick={() => setPage((value) => value + 1)}
              >
                下一页
              </button>
            </div>
          ) : null}
        </section>
      ) : loading ? (
        <section className="panel search-guide">
          <strong>正在搜索…</strong>
        </section>
      ) : null}

      {/* 打印专用报表:屏幕隐藏,打印时独占页面(多型号对比或单关键词聚合) */}
      {(() => {
        const printEntries =
          multiSummary ??
          (summary ? [{ term: searchedKeyword, summary }] : null);
        if (!printEntries) return null;
        const printTotals = printEntries.map((entry) => ({
          term: entry.term,
          ...sectionTotals(entry.summary),
        }));
        const printGrand = printTotals.reduce(
          (sum, item) => sum + item.available,
          0,
        );
        return (
          <div className="print-report">
            <h1>锦程 ERP · 库存汇总</h1>
            <p className="print-meta">
              查询：{printEntries.map((entry) => entry.term).join("、")} ·
              打印时间：
              {new Date().toLocaleString("zh-CN", { hour12: false })} ·
              口径：真机可售（不含配件/演示机；在途/锁定单列）
            </p>
            {printEntries.map((entry) => {
              const section = sectionTotals(entry.summary);
              const primaryGroups = entry.summary.skuGroups.filter(
                (group) => group.kind === "primary",
              );
              return (
                <div className="print-section" key={entry.term}>
                  <h2>
                    {entry.term} —— 可售 {section.available} 台
                    {section.pending > 0 ? `（另在途/锁定 ${section.pending}）` : ""}
                  </h2>
                  <table>
                    <thead>
                      <tr>
                        <th>商品</th>
                        <th>规格</th>
                        <th>颜色</th>
                        <th>官网价</th>
                        <th>可售</th>
                        <th>仓库分布</th>
                      </tr>
                    </thead>
                    <tbody>
                      {primaryGroups.map((group) => (
                        <tr key={group.skuId}>
                          <td>{group.skuName}</td>
                          <td>{group.spec ?? "—"}</td>
                          <td>{group.color ?? "—"}</td>
                          <td>{formatPrice(group.retailPrice) ?? "—"}</td>
                          <td className="print-count">{group.availableTotal}</td>
                          <td>
                            {group.warehouses
                              .filter((warehouse) => warehouse.available > 0)
                              .map(
                                (warehouse) =>
                                  `${warehouse.warehouseName}×${warehouse.available}`,
                              )
                              .join("、") || "—"}
                          </td>
                        </tr>
                      ))}
                      <tr className="print-subtotal">
                        <td colSpan={4}>小计</td>
                        <td className="print-count">{section.available}</td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
              );
            })}
            {printEntries.length > 1 ? (
              <p className="print-grand">合计可售：{printGrand} 台</p>
            ) : null}
          </div>
        );
      })()}

      {/* 单机档案抽屉:详情 + 流转时间线(AC-F-005) */}
      {detailOpen ? (
        <Drawer ariaLabel="单机档案" onClose={closeDetail}>
            <header className="drawer-head">
              <div>
                <h2 className="mono">{detail?.imeiPrimary ?? "单机档案"}</h2>
                <small>
                  {detail
                    ? productLabel(detail.productBrand, detail.productModel)
                    : "正在加载…"}
                  {detail?.serialNumber ? ` · SN ${detail.serialNumber}` : ""}
                </small>
              </div>
              <button
                aria-label="关闭"
                className="drawer-close"
                onClick={closeDetail}
                type="button"
              >
                ✕
              </button>
            </header>

            {detailLoading ? (
              <p className="drawer-empty">正在加载单机档案…</p>
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
                    <span>当前位置</span>
                    <strong>{detail.warehouseName}</strong>
                  </div>
                  <div>
                    <span>官网价</span>
                    <strong>
                      {formatPrice(detail.retailPrice) ?? "未收录"}
                    </strong>
                  </div>
                  <div>
                    <span>责任人</span>
                    <strong>{detail.responsibleEmployeeName ?? "—"}</strong>
                  </div>
                </div>

                <div className="drawer-section">
                  <h3>基础信息</h3>
                </div>
                <dl className="serial-facts">
                  <div>
                    <dt>SKU</dt>
                    <dd>
                      {detail.skuName}
                      <small className="mono">{detail.skuCode}</small>
                    </dd>
                  </div>
                  {detail.imeiSecondary ? (
                    <div>
                      <dt>副 IMEI</dt>
                      <dd className="mono">{detail.imeiSecondary}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>仓库类型</dt>
                    <dd>
                      {WAREHOUSE_TYPE_LABELS[detail.warehouseType] ??
                        detail.warehouseType}
                      {detail.storeName ? ` · ${detail.storeName}` : ""}
                    </dd>
                  </div>
                  <div>
                    <dt>入库成本</dt>
                    <dd>¥{detail.unitCost}</dd>
                  </div>
                  <div>
                    <dt>入库时间</dt>
                    <dd>{formatDateTime(detail.receivedAt)}</dd>
                  </div>
                </dl>

                <div className="drawer-section">
                  <h3>流转时间线（{detail.movements.length} 条流水）</h3>
                </div>
                {detail.movements.length === 0 ? (
                  <p className="drawer-empty">
                    暂无库存流水。该序列号可能由期初迁移直接建立，后续业务单据将在此展示完整轨迹。
                  </p>
                ) : (
                  <ol className="serial-timeline">
                    {detail.movements.map((movement) => (
                      <li key={movement.id}>
                        <span className="timeline-dot" aria-hidden="true" />
                        <div className="timeline-body">
                          <div className="timeline-title">
                            <strong>
                              {MOVEMENT_LABELS[movement.movementType] ??
                                movement.movementType}
                            </strong>
                            <span className="timeline-doc">
                              {DOCUMENT_LABELS[movement.documentType] ??
                                movement.documentType}
                            </span>
                          </div>
                          <p>
                            {movement.fromWarehouseName
                              ? `${movement.fromWarehouseName} → `
                              : ""}
                            {movement.toWarehouseName ?? "—"} ·{" "}
                            {movement.quantity} 台
                          </p>
                          <time>{formatDateTime(movement.occurredAt)}</time>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </>
            ) : null}
        </Drawer>
      ) : null}
    </div>
  );
}
