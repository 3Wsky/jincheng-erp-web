"use client";

import {
  InventoryOverviewSchema,
  WarehouseSerialListSchema,
  type InventoryOverview,
  type WarehouseOverviewItem,
  type WarehouseSerialItem,
} from "@jincheng/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";

/** 公司类仓库类型(总仓/门店/售后/异常) */
const COMPANY_TYPES = ["COMPANY", "STORE", "AFTER_SALES", "ABNORMAL"];

/** 公司仓蓝色系(低 → 高,基于项目主色的低饱和蓝) */
const COMPANY_COLOR_SCALE = [
  "#EFF6FF",
  "#DBEAFE",
  "#BFDBFE",
  "#93C5FD",
  "#60A5FA",
];
/** 个人分销仓绿色系(低 → 高) */
const PERSONAL_COLOR_SCALE = [
  "#ECFDF5",
  "#D1FAE5",
  "#A7F3D0",
  "#6EE7B7",
  "#34D399",
];

interface WarehouseCard {
  id: string;
  name: string;
  value: number;
  type: "company" | "personal";
  color: string;
  /** 占格 span 组合(8 列网格),面积近似正比于库存量 */
  spanClass: string;
  /** 字号档位(随块面积放大) */
  fontTier: 1 | 2 | 3 | 4 | 5;
  raw: WarehouseOverviewItem;
}

/** 最大块允许占的格子数(8列×2行);同时决定 1 格代表的库存单位 */
const MAX_CELLS = 16;

/**
 * 按库存量分配格子数(2026-08-12 验收口径:面积能看出 A 是 B 的几倍,
 * 且块形状保持方正、不出现扁长横条):
 * 1 格 = 分区最大库存 / 16,每仓格子数 = round(库存 / 单位),最小 1 格保底;
 * 格子数吸附到方正组合(1×1/2×1/2×2/3×2/3×3/4×3/4×4),最长形状 2:1。
 * 例:总库 1921 台 → 4×4 大方块,502 台的店 → 2×2(面积约 1/4),94 台 → 1×1。
 */
function allocateCells(
  value: number,
  max: number,
): Pick<WarehouseCard, "spanClass" | "fontTier"> {
  const unit = Math.max(1, max / MAX_CELLS);
  const cells = Math.max(1, Math.round(value / unit));
  if (cells >= 14) return { spanClass: "s4x4", fontTier: 5 };
  if (cells >= 11) return { spanClass: "s4x3", fontTier: 5 };
  if (cells >= 8) return { spanClass: "s3x3", fontTier: 4 };
  if (cells >= 6) return { spanClass: "s3x2", fontTier: 4 };
  if (cells >= 4) return { spanClass: "s2x2", fontTier: 3 };
  if (cells >= 2) return { spanClass: "s2x1", fontTier: 2 };
  return { spanClass: "s1x1", fontTier: 1 };
}

function isCompany(type: string): boolean {
  return COMPANY_TYPES.includes(type);
}

/** 颜色:按 value / 分类最大值 分档,保留库存量级感 */
function getWarehouseColor(
  type: "company" | "personal",
  value: number,
  maxValue: number,
): string {
  const palette =
    type === "company" ? COMPANY_COLOR_SCALE : PERSONAL_COLOR_SCALE;
  const ratio = maxValue > 0 ? value / maxValue : 0;
  const index = Math.min(
    palette.length - 1,
    Math.max(0, Math.floor(ratio * palette.length)),
  );
  return palette[index] ?? palette[0]!;
}

function typeLabel(type: "company" | "personal"): string {
  return type === "company" ? "公司门店仓" : "个人分销仓";
}

function formatCount(value: number): string {
  return value.toLocaleString("zh-CN");
}

function formatPercent(value: number, total: number): string {
  if (total <= 0) return "0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}

const emptyOverview: InventoryOverview = {
  totalSerials: 0,
  companySerials: 0,
  personalSerials: 0,
  warehouses: [],
};

/* ============================================================
 * 仓库网格分区:等尺寸卡片,所有仓库完整可读
 * (2026-08-12 验收反馈:原 Treemap 按面积等比缩放,小仓库缩成
 *  看不清的碎块;改为网格卡片,颜色深浅保留量级感)
 * ============================================================ */
function WarehouseGridSection({
  title,
  count,
  total,
  items,
  onSelect,
  hidden,
}: {
  title: string;
  count: number;
  total: number;
  items: WarehouseCard[];
  onSelect: (item: WarehouseOverviewItem) => void;
  hidden: boolean;
}) {
  const type = title === "个人分销仓" ? "personal" : "company";
  return (
    <section
      className={`treemap-section ${type}`}
      style={hidden ? { display: "none" } : undefined}
    >
      <div className="treemap-section-head">
        <span className="treemap-section-title">
          <i className={`legend-dot ${type}`} />
          {title}
          <em className="treemap-section-sub">{items.length} 个仓库</em>
        </span>
        <span className="treemap-section-count">{formatCount(count)} 台</span>
      </div>
      {items.length === 0 ? (
        <p className="wh-grid-empty">暂无匹配仓库，试试调整搜索关键词。</p>
      ) : (
        <div className="wh-grid">
          {items.map((item) => (
            <button
              className={`wh-card ${item.spanClass} f${item.fontTier}`}
              key={item.id}
              style={{ backgroundColor: item.color }}
              type="button"
              onClick={() => onSelect(item.raw)}
            >
              <span className="wh-card-name">{item.name}</span>
              <b>
                {formatCount(item.value)}
                <em>台</em>
              </b>
              {item.fontTier >= 2 ? (
                <small>
                  {formatPercent(item.value, total)}
                  {item.raw.ownerEmployeeName
                    ? ` · ${item.raw.ownerEmployeeName}`
                    : ""}
                </small>
              ) : null}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/* ============================================================ */
export function InventoryOverview() {
  const [overview, setOverview] = useState<InventoryOverview>(emptyOverview);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<WarehouseOverviewItem | null>(null);
  const [serials, setSerials] = useState<WarehouseSerialItem[]>([]);
  const [serialsLoading, setSerialsLoading] = useState(false);
  const [serialsError, setSerialsError] = useState<string | null>(null);
  const [serialsTotal, setSerialsTotal] = useState(0);
  const [serialsSearch, setSerialsSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "company" | "personal">("all");
  const [search, setSearch] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/inventory/overview", {
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(payload.message || "加载库存总览失败");
      }
      const payload = InventoryOverviewSchema.parse(await response.json());
      setOverview(payload);
      setLastUpdated(new Date());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [load]);

  /** 数据适配:分类筛选 + 仓库搜索 → 公司/个人两组卡片(全部展示,不聚合) */
  const sections = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const matched = overview.warehouses
      .filter((item) => item.serialCount > 0)
      .filter(
        (item) => keyword === "" || item.name.toLowerCase().includes(keyword),
      );

    const build = (type: "company" | "personal"): WarehouseCard[] => {
      const list = matched.filter((item) =>
        type === "company" ? isCompany(item.type) : !isCompany(item.type),
      );
      const max = Math.max(...list.map((item) => item.serialCount), 0);
      return list
        .sort((a, b) => b.serialCount - a.serialCount)
        .map((item) => ({
          id: item.id,
          name: item.name,
          value: item.serialCount,
          type,
          color: getWarehouseColor(type, item.serialCount, max),
          ...allocateCells(item.serialCount, max),
          raw: item,
        }));
    };

    const company = build("company");
    const personal = build("personal");
    return {
      company,
      personal,
      companyCount: company.reduce((sum, item) => sum + item.value, 0),
      personalCount: personal.reduce((sum, item) => sum + item.value, 0),
    };
  }, [overview, search]);

  const stats = useMemo(() => {
    return {
      total: overview.totalSerials,
      company: overview.companySerials,
      personal: overview.personalSerials,
      warehouseCount: overview.warehouses.filter(
        (warehouse) => warehouse.serialCount > 0,
      ).length,
    };
  }, [overview]);

  /** 打开仓库详情抽屉 */
  const openWarehouse = useCallback(async (item: WarehouseOverviewItem) => {
    setSelected(item);
    setSerials([]);
    setSerialsTotal(0);
    setSerialsSearch("");
    setSerialsError(null);
    setSerialsLoading(true);
    try {
      const response = await fetch(
        `/api/inventory/warehouses/${item.id}/serials?page=1&pageSize=50`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(payload.message || "加载序列号失败");
      }
      const payload = WarehouseSerialListSchema.parse(await response.json());
      setSerials(payload.items);
      setSerialsTotal(payload.total);
    } catch (loadError) {
      setSerialsError(
        loadError instanceof Error ? loadError.message : "加载序列号失败",
      );
    } finally {
      setSerialsLoading(false);
    }
  }, []);

  // ---- 加载 / 错误 / 空态 ----
  if (loading && overview.warehouses.length === 0) {
    return <div className="inventory-loading">正在加载仓库总览…</div>;
  }
  if (error && overview.warehouses.length === 0) {
    return (
      <div className="inventory-error">
        <p>{error}</p>
        <button className="button secondary" onClick={() => void load()} type="button">
          重新加载
        </button>
      </div>
    );
  }
  if (overview.warehouses.length === 0) {
    return (
      <div className="inventory-empty">
        <strong>暂无库存数据</strong>
        <span>完成仓库主档与序列号迁移后，此处将展示库存总览。</span>
      </div>
    );
  }

  return (
    <div className="inventory-overview">
      {/* 刷新失败但已有旧数据时:横幅提示,保留页面不白屏 */}
      {error ? (
        <div className="alert error inventory-refresh-error">
          {error}
          <button onClick={() => void load()} type="button">
            重试
          </button>
        </div>
      ) : null}

      {/* 统计卡:复用 metric-grid + metric-card 视觉规范 */}
      <section className="metric-grid inventory-metrics" aria-label="库存摘要">
        <article className="metric-card inventory-metric-card">
          <span>总库存</span>
          <strong>{formatCount(stats.total)} <em>台</em></strong>
        </article>
        <article className="metric-card inventory-metric-card">
          <span>公司门店库存</span>
          <strong>{formatCount(stats.company)} <em>台</em></strong>
          <small>{formatPercent(stats.company, stats.total)}</small>
        </article>
        <article className="metric-card inventory-metric-card">
          <span>个人分销库存</span>
          <strong>{formatCount(stats.personal)} <em>台</em></strong>
          <small>{formatPercent(stats.personal, stats.total)}</small>
        </article>
        <article className="metric-card inventory-metric-card">
          <span>仓库数量</span>
          <strong>{formatCount(stats.warehouseCount)} <em>个</em></strong>
        </article>
      </section>

      {/* 库存分布卡片 */}
      <section className="panel inventory-distribution-card">
        <div className="section-heading inventory-card-head">
          <div>
            <p className="eyebrow">库存分布</p>
            <h2>仓库库存</h2>
            <p>
              每个仓库一张卡片，按库存台数排序；颜色越深库存越多，点击卡片查看序列号明细。
            </p>
          </div>
          <div className="inventory-card-actions">
            {lastUpdated ? (
              <span className="inventory-updated">
                最后更新 {lastUpdated.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
              </span>
            ) : null}
            <button
              className="button secondary"
              disabled={loading}
              onClick={() => void load()}
              type="button"
            >
              {loading ? "刷新中…" : "刷新"}
            </button>
          </div>
        </div>

        {/* 筛选 + 搜索 */}
        <div className="inventory-toolbar">
          <div className="inventory-segmented" role="tablist" aria-label="仓库分类筛选">
            <button
              className={filter === "all" ? "active" : ""}
              onClick={() => setFilter("all")}
              role="tab"
              type="button"
            >
              全部仓库
            </button>
            <button
              className={filter === "company" ? "active" : ""}
              onClick={() => setFilter("company")}
              role="tab"
              type="button"
            >
              公司门店
            </button>
            <button
              className={filter === "personal" ? "active" : ""}
              onClick={() => setFilter("personal")}
              role="tab"
              type="button"
            >
              个人分销
            </button>
          </div>
          <div className="inventory-search">
            <input
              aria-label="搜索仓库"
              placeholder="搜索仓库"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>

        {/* 上下分区:公司在上、个人在下;筛选用 CSS 隐藏而非卸载 */}
        <div className="inventory-treemap-sections">
          <WarehouseGridSection
            title="公司门店仓"
            count={sections.companyCount}
            total={sections.companyCount}
            items={sections.company}
            onSelect={openWarehouse}
            hidden={filter === "personal"}
          />
          <WarehouseGridSection
            title="个人分销仓"
            count={sections.personalCount}
            total={sections.personalCount}
            items={sections.personal}
            onSelect={openWarehouse}
            hidden={filter === "company"}
          />
        </div>
      </section>

      {/* 仓库详情抽屉:点击卡片打开 */}
      {selected ? (
        <div className="drawer-overlay" onClick={() => setSelected(null)} role="presentation">
          <aside
            aria-label="仓库详情"
            className="warehouse-drawer"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="drawer-head">
              <div>
                <h2>{selected.name}</h2>
                <small>
                  {typeLabel(isCompany(selected.type) ? "company" : "personal")}
                  {selected.storeName ? ` · ${selected.storeName}` : ""}
                </small>
              </div>
              <button
                aria-label="关闭"
                className="drawer-close"
                onClick={() => setSelected(null)}
                type="button"
              >
                ✕
              </button>
            </header>

            <div className="drawer-stats">
              <div>
                <span>库存总数</span>
                <strong>{formatCount(selected.serialCount)} 台</strong>
              </div>
              {selected.ownerEmployeeName ? (
                <div>
                  <span>负责人</span>
                  <strong>{selected.ownerEmployeeName}</strong>
                </div>
              ) : null}
            </div>

            <div className="drawer-section">
              <h3>库存商品（最近入库 {serials.length > 0 ? Math.min(serialsTotal, serials.length) : 0} 台示例）</h3>
            </div>

            <div className="drawer-serial-search">
              <input
                placeholder="搜索 SKU、IMEI、SN"
                value={serialsSearch}
                onChange={(event) => setSerialsSearch(event.target.value)}
              />
            </div>

            {serialsLoading ? (
              <p className="drawer-empty">正在加载序列号…</p>
            ) : serialsError ? (
              <p className="drawer-empty error">{serialsError}</p>
            ) : serials.length === 0 ? (
              <p className="drawer-empty">该仓库暂无序列号记录</p>
            ) : (
              <div className="drawer-table-wrap">
                <table className="drawer-table">
                  <thead>
                    <tr>
                      <th>IMEI</th>
                      <th>商品</th>
                      <th>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {serials
                      .filter((serial) =>
                        serialsSearch.trim() === ""
                          ? true
                          : serial.imeiPrimary
                              .toLowerCase()
                              .includes(serialsSearch.trim().toLowerCase()) ||
                            serial.skuName
                              .toLowerCase()
                              .includes(serialsSearch.trim().toLowerCase()),
                      )
                      .slice(0, 30)
                      .map((serial) => (
                        <tr key={serial.id}>
                          <td className="mono">{serial.imeiPrimary}</td>
                          <td>
                            {[serial.productBrand, serial.productModel, serial.skuName]
                              .filter(Boolean)
                              .join(" ")}
                          </td>
                          <td>
                            <span className="drawer-status">{serial.status}</span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
