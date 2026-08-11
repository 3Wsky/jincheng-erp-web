"use client";

import {
  InventoryOverviewSchema,
  WarehouseSerialListSchema,
  type InventoryOverview,
  type WarehouseOverviewItem,
  type WarehouseSerialItem,
} from "@jincheng/contracts";
import * as echarts from "echarts/core";
import { TreemapChart, type TreemapSeriesOption } from "echarts/charts";
import {
  TitleComponent,
  TooltipComponent,
  type TooltipComponentOption,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { ComposeOption } from "echarts/core";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

echarts.use([TreemapChart, TitleComponent, TooltipComponent, CanvasRenderer]);

type EChartsOption = ComposeOption<
  TreemapSeriesOption | TooltipComponentOption
>;

/** 公司类仓库类型(总仓/门店/售后/异常) */
const COMPANY_TYPES = ["COMPANY", "STORE", "AFTER_SALES", "ABNORMAL"];

/** 个人分销仓超过该数量时,只展示 Top N,其余聚合为"其他 X 个" */
const PERSONAL_VISIBLE = 12;

/** 公司仓蓝色系(低 → 高,基于项目主色 #3157d5 的低饱和蓝) */
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

interface TreemapDatum {
  id: string;
  name: string;
  value: number;
  type: "company" | "personal";
  color?: string;
  raw?: WarehouseOverviewItem;
}

function isCompany(type: string): boolean {
  return COMPANY_TYPES.includes(type);
}

/** 归一化:后端字段 → Treemap 数据。缺字段不伪造。 */
function normalizeWarehouseData(
  overview: InventoryOverview,
): TreemapDatum[] {
  return overview.warehouses
    .map((item) => ({
      id: item.id,
      name: item.name,
      value: item.serialCount,
      type: (isCompany(item.type) ? "company" : "personal") as
        | "company"
        | "personal",
      raw: item,
    }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);
}

/** 颜色:按 value / 分类最大值 分档,平滑不跳跃 */
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
 * 单个分区 Treemap(公司 / 个人 各一个实例,独立管理生命周期)
 * ============================================================ */
function TreemapSection({
  title,
  count,
  items,
  onSelect,
  hidden,
}: {
  title: string;
  count: number;
  items: TreemapDatum[];
  onSelect: (item: WarehouseOverviewItem) => void;
  hidden: boolean;
}) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const type = title === "个人分销仓" ? "personal" : "company";

  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    // 刷新时 React 会重建容器 DOM,旧实例仍挂在旧节点上:
    // 检测到不一致必须先 dispose 再重新 init,否则图表画在已脱离页面的 DOM 上 → 空白
    if (chartInstance.current && chartInstance.current.getDom() !== el) {
      chartInstance.current.dispose();
      chartInstance.current = null;
    }
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(el);
    }
    const chart = chartInstance.current;

    // 无匹配数据:显示空态提示,不销毁实例(避免 DOM 移除冲突)
    if (items.length === 0) {
      chart.setOption(
        {
          title: {
            text: "暂无匹配仓库",
            subtext: "试试调整搜索关键词",
            left: "center",
            top: "middle",
            textStyle: { color: "#6f7b8f", fontSize: 15, fontWeight: 500 },
            subtextStyle: { color: "#98a2b3", fontSize: 12 },
          },
          series: [],
        },
        true,
      );
      return undefined;
    }

    const sectionTotal = items.reduce((sum, item) => sum + item.value, 0);
    const option: EChartsOption = {
      animationDurationUpdate: 300,
      tooltip: {
        trigger: "item",
        backgroundColor: "#FFFFFF",
        borderColor: "#EAECF0",
        borderWidth: 1,
        padding: 14,
        confine: true,
        textStyle: { color: "#344054", fontSize: 12 },
        extraCssText:
          "border-radius:10px;box-shadow:0 8px 24px rgba(16,24,40,.10);",
        formatter: (params: unknown) => {
          const data = (params as { data?: Partial<TreemapDatum> }).data ?? {};
          const name = data.name ?? "-";
          const value = Number(data.value ?? 0);
          const typeText = data.type === "personal" ? "个人分销仓" : "公司门店仓";
          const percent =
            sectionTotal > 0 ? ((value / sectionTotal) * 100).toFixed(1) : "0.0";
          const rows: string[] = [
            `<div style="font-size:14px;font-weight:600;color:#101828;margin-bottom:12px;">${name}</div>`,
            `<div style="display:flex;justify-content:space-between;gap:24px;margin-bottom:6px;"><span style="color:#667085">库存数量</span><b style="color:#101828">${formatCount(value)} 台</b></div>`,
            `<div style="display:flex;justify-content:space-between;gap:24px;margin-bottom:6px;"><span style="color:#667085">库存占比</span><span>${percent}%</span></div>`,
            `<div style="display:flex;justify-content:space-between;gap:24px;"><span style="color:#667085">仓库类型</span><span>${typeText}</span></div>`,
          ];
          if (data.raw?.ownerEmployeeName) {
            rows.push(
              `<div style="display:flex;justify-content:space-between;gap:24px;margin-top:6px;padding-top:6px;border-top:1px solid #EAECF0;"><span style="color:#667085">负责人</span><span>${data.raw.ownerEmployeeName}</span></div>`,
            );
          }
          return `<div style="min-width:180px;">${rows.join("")}</div>`;
        },
      },
      series: [
        {
          type: "treemap",
          roam: false,
          nodeClick: false,
          breadcrumb: { show: false },
          squareRatio: 1.2,
          sort: "desc",
          leafDepth: 1,
          visibleMin: 0,
          itemStyle: {
            borderColor: "#FFFFFF",
            borderWidth: 3,
            gapWidth: 3,
            borderRadius: 6,
          },
          emphasis: {
            focus: "self",
            itemStyle: { shadowBlur: 12, shadowColor: "rgba(16,24,40,.12)" },
          },
          label: {
            show: true,
            color: "#101828",
            padding: 10,
            overflow: "truncate",
            formatter: (params: unknown) => {
              const data = (params as { data?: Partial<TreemapDatum> }).data ??
                {};
              const value = Number(data.value ?? 0);
              const name = data.name ?? "";
              if (value >= 300) {
                return `{name|${name}}\n\n{big|${formatCount(value)}} {unit|台}`;
              }
              if (value >= 100) {
                return `{name|${name}}\n{value|${formatCount(value)} 台}`;
              }
              if (value >= 30) {
                return `{small|${name}}\n{smallValue|${value}}`;
              }
              return "";
            },
            rich: {
              name: {
                fontSize: 13,
                fontWeight: 500,
                color: "#344054",
                lineHeight: 18,
              },
              big: {
                fontSize: 24,
                fontWeight: 700,
                color: "#101828",
                lineHeight: 30,
              },
              unit: { fontSize: 12, color: "#667085" },
              value: {
                fontSize: 17,
                fontWeight: 600,
                color: "#101828",
                lineHeight: 24,
              },
              small: { fontSize: 11, color: "#344054" },
              smallValue: {
                fontSize: 13,
                fontWeight: 600,
                color: "#101828",
              },
            },
          },
          data: items.map((item) => ({
            id: item.id,
            name: item.name,
            value: item.value,
            type: item.type,
            raw: item.raw,
            itemStyle: {
              color: item.color,
              borderColor: "#FFFFFF",
              borderWidth: 3,
              borderRadius: 6,
            },
            label: {
              show: item.value >= 30,
              fontSize: item.value >= 300 ? 24 : item.value >= 100 ? 17 : 13,
            },
          })),
        },
      ],
    };
    chart.setOption(option, true);

    // 点击仓库 → 打开详情抽屉
    const onClick = (params: unknown) => {
      const data = (params as { data?: { raw?: WarehouseOverviewItem } })
        .data;
      if (data?.raw) onSelect(data.raw);
    };
    chart.off("click", onClick);
    chart.on("click", onClick);

    // 容器尺寸变化时自适应
    const onResize = () => chartInstance.current?.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.off("click", onClick);
    };
  }, [items, onSelect]);

  /** 卸载时释放图表实例,避免内存泄漏 */
  useEffect(() => {
    return () => {
      chartInstance.current?.dispose();
      chartInstance.current = null;
    };
  }, []);

  return (
    <section
      className={`treemap-section ${type}`}
      style={hidden ? { display: "none" } : undefined}
    >
      <div className="treemap-section-head">
        <span className="treemap-section-title">
          <i className={`legend-dot ${type}`} />
          {title}
        </span>
        <span className="treemap-section-count">{formatCount(count)} 台</span>
      </div>
      <div className="inventory-treemap" ref={chartRef} />
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
    void load();
  }, [load]);

  /** 数据适配:分类筛选 + 仓库搜索 → 公司/个人两组独立数据 */
  const sections = useMemo(() => {
    const all = normalizeWarehouseData(overview);
    const keyword = search.trim().toLowerCase();
    const matched = all.filter(
      (item) =>
        keyword === "" || item.name.toLowerCase().includes(keyword),
    );

    // 公司区:全部展示(26 个左右,直接 treemap)
    const companyItems = matched
      .filter((item) => item.type === "company")
      .map((item) => item);
    const companyMax = Math.max(
      ...companyItems.map((item) => item.value),
      0,
    );
    const companyFinal = companyItems.map((item) => ({
      ...item,
      color: getWarehouseColor("company", item.value, companyMax),
    }));

    // 个人区:超过 Top N 时合并为"其他 X 个"
    const personalItems = matched.filter((item) => item.type === "personal");
    const personalMax = Math.max(
      ...personalItems.map((item) => item.value),
      0,
    );
    let personalFinal: TreemapDatum[];
    if (personalItems.length > PERSONAL_VISIBLE) {
      const head = personalItems.slice(0, PERSONAL_VISIBLE);
      const others = personalItems.slice(PERSONAL_VISIBLE);
      const othersCount = others.reduce((sum, item) => sum + item.value, 0);
      personalFinal = [
        ...head,
        {
          id: "__personal_others__",
          name: `其他 ${others.length} 个`,
          value: othersCount,
          type: "personal",
          raw: undefined,
        },
      ];
    } else {
      personalFinal = personalItems;
    }
    personalFinal = personalFinal.map((item) => ({
      ...item,
      color: getWarehouseColor("personal", item.value, personalMax),
    }));

    const companyCount = companyItems.reduce((sum, item) => sum + item.value, 0);
    const personalCount = personalItems.reduce((sum, item) => sum + item.value, 0);

    return { company: companyFinal, personal: personalFinal, companyCount, personalCount };
  }, [overview, search]);

  const stats = useMemo(() => {
    const total = overview.totalSerials;
    const company = overview.companySerials;
    const personal = overview.personalSerials;
    return {
      total,
      company,
      personal,
      warehouseCount: overview.warehouses.filter((w) => w.serialCount > 0)
        .length,
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
  // 首次加载(尚无数据)才显示整页 Skeleton;
  // 刷新/重新加载时保留已渲染内容,避免图表实例被卸载重建导致闪烁或空白
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

  const isAggregate = selected?.id === "__personal_others__";

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
            <p>上方为公司门店仓库，下方为个人分销仓库；板块面积与台数成正比</p>
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

        {/* 上下分区:公司在上、个人在下;筛选用 CSS 隐藏而非卸载,避免图表 DOM 重建 */}
        <div className="inventory-treemap-sections">
          <TreemapSection
            title="公司门店仓"
            count={sections.companyCount}
            items={sections.company}
            onSelect={openWarehouse}
            hidden={filter === "personal"}
          />
          <TreemapSection
            title="个人分销仓"
            count={sections.personalCount}
            items={sections.personal}
            onSelect={openWarehouse}
            hidden={filter === "company"}
          />
        </div>
      </section>

      {/* 仓库详情抽屉:点击 Treemap 打开 */}
      {selected ? (
        <div className="drawer-overlay" onClick={() => setSelected(null)} role="presentation">
          <aside
            aria-label="仓库详情"
            className="warehouse-drawer"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="drawer-head">
              <div>
                <h2>{isAggregate ? "其他个人分销仓库" : selected.name}</h2>
                <small>
                  {isAggregate
                    ? "个人分销仓"
                    : typeLabel(isCompany(selected.type) ? "company" : "personal")}
                  {!isAggregate && selected.storeName ? ` · ${selected.storeName}` : ""}
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

            {!isAggregate ? (
              <>
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
              </>
            ) : (
              <p className="drawer-empty">点击具体个人仓库可查看序列号明细。</p>
            )}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
