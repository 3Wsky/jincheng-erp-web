"use client";

import {
  CatalogProductListSchema,
  InventoryOverviewSchema,
  TransferListSchema,
  type InventoryOverview,
} from "@jincheng/contracts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ErpIcon } from "@/components/erp-icon";

/** 快捷入口（与原实现一致的静态链接，不涉及数据真实性） */
const quickActions = [
  { label: "新建商品", note: "创建商品和首个 SKU", href: "/catalog/products", icon: "catalog" as const, tone: "blue" },
  { label: "管家婆预校验", note: "读取最新 CDS 文件", href: "/catalog/products", icon: "integration" as const, tone: "cyan" },
  { label: "全局查货", note: "SKU、条码与串号", href: "/search", icon: "search" as const, tone: "violet" },
  { label: "库存盘点", note: "扫码录入盘点差异", href: "/inventory", icon: "inventory" as const, tone: "orange" },
] as const;

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

function formatCount(value: number): string {
  return value.toLocaleString("zh-CN");
}

/** 占比（0~100，保留一位小数；总数为 0 时返回 0） */
function percentOf(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

interface DashboardData {
  overview: InventoryOverview;
  /** 货品主档商品总数（/catalog/products 分页 total） */
  productTotal: number;
  /** 在途调拨单数（status=IN_TRANSIT 的分页 total） */
  transferInTransit: number;
}

/**
 * 经营工作台真实指标区（P1 技术债整改）：
 * 库存总台数 / 货品主档 / 仓库数量 / 在途调拨全部来自现有只读接口，
 * 不再展示任何硬编码静态数（AGENTS「不展示伪数据」）。
 * 共 3 个请求：/api/inventory/overview、/api/catalog/products、/api/transfers。
 */
export function DashboardMetrics() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** 失败重试计数：自增触发加载 effect 重新执行 */
  const [retryTick, setRetryTick] = useState(0);

  /** 加载三项指标数据；回调在定时器内执行，不属于 effect 内同步 setState */
  useEffect(() => {
    let active = true;
    const handle = window.setTimeout(() => {
      void (async () => {
        if (active) {
          setLoading(true);
          setError(null);
        }
        try {
          const [overviewRaw, productsRaw, transfersRaw] = await Promise.all([
            fetchJson("/api/inventory/overview"),
            fetchJson("/api/catalog/products?pageSize=1"),
            fetchJson("/api/transfers?status=IN_TRANSIT&pageSize=1"),
          ]);
          const overview = InventoryOverviewSchema.parse(overviewRaw);
          const products = CatalogProductListSchema.parse(productsRaw);
          const transfers = TransferListSchema.parse(transfersRaw);
          if (active) {
            setData({
              overview,
              productTotal: products.total,
              transferInTransit: transfers.total,
            });
          }
        } catch (loadError) {
          if (active) setError(messageOf(loadError));
        } finally {
          if (active) setLoading(false);
        }
      })();
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [retryTick]);

  const overview = data?.overview ?? null;
  const totalSerials = overview?.totalSerials ?? 0;
  /** 按仓库类型聚合台数与仓库数（全部来自 overview.warehouses 实时数据） */
  const storeSerials = overview
    ? overview.warehouses
        .filter((warehouse) => warehouse.type === "STORE")
        .reduce((sum, warehouse) => sum + warehouse.serialCount, 0)
    : 0;
  const companyWarehouseSerials = overview
    ? overview.warehouses
        .filter((warehouse) => warehouse.type === "COMPANY")
        .reduce((sum, warehouse) => sum + warehouse.serialCount, 0)
    : 0;
  const stockedWarehouses = overview
    ? overview.warehouses.filter((warehouse) => warehouse.serialCount > 0).length
    : 0;
  const emptyWarehouses = overview
    ? overview.warehouses.length - stockedWarehouses
    : 0;
  const companyShare = overview
    ? percentOf(overview.companySerials, totalSerials)
    : 0;

  /** 指标卡定义：加载中显示省略号，避免闪现 0 */
  const metricCards = [
    {
      label: "库存总台数",
      value: overview ? formatCount(totalSerials) : "…",
      delta: overview
        ? `公司 ${formatCount(overview.companySerials)} · 个人 ${formatCount(overview.personalSerials)}`
        : "正在加载",
      tone: "blue",
    },
    {
      label: "货品主档商品",
      value: data ? formatCount(data.productTotal) : "…",
      delta: data ? "商品主数据（款）" : "正在加载",
      tone: "green",
    },
    {
      label: "仓库数量",
      value: overview ? formatCount(overview.warehouses.length) : "…",
      delta: overview
        ? `有货 ${formatCount(stockedWarehouses)} · 空仓 ${formatCount(emptyWarehouses)}`
        : "正在加载",
      tone: "violet",
    },
    {
      label: "在途调拨单",
      value: data ? formatCount(data.transferInTransit) : "…",
      delta: data ? "调拨在途 · 单据驱动" : "正在加载",
      tone: "orange",
    },
  ] as const;

  return (
    <>
      {error ? (
        <section className="dashboard-metrics-error" aria-label="指标加载失败">
          <div className="alert error">
            工作台指标加载失败：{error}
            <button
              className="button small"
              type="button"
              onClick={() => setRetryTick((value) => value + 1)}
            >
              重试
            </button>
          </div>
        </section>
      ) : (
        <section
          aria-busy={loading}
          aria-label="库存与业务实时指标"
          className="metric-grid dashboard-metrics"
        >
          {metricCards.map((metric) => (
            <article className="dashboard-metric" key={metric.label}>
              <div className={`metric-symbol ${metric.tone}`}><span /></div>
              <div>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <small>{metric.delta}</small>
              </div>
            </article>
          ))}
        </section>
      )}

      <div className="dashboard-grid primary-grid">
        <section className="enterprise-panel operations-panel">
          <div className="panel-heading">
            <div>
              <h2>库存分布总览</h2>
              <p>基于库存总览接口的实时聚合结果</p>
            </div>
            <span className="panel-tag success">实时数据</span>
          </div>
          {overview ? (
            <>
              <div className="health-content">
                <div className="health-score">
                  <div
                    className="score-ring"
                    style={{
                      background: `conic-gradient(#2b9b74 0 ${companyShare}%, #e7ecef ${companyShare}% 100%)`,
                    }}
                  >
                    <strong>{companyShare}%</strong>
                    <span>公司库存占比</span>
                  </div>
                  <div className="score-caption">
                    <b>在库 {formatCount(totalSerials)} 台</b>
                    <span>
                      公司 {formatCount(overview.companySerials)} 台 · 个人分销{" "}
                      {formatCount(overview.personalSerials)} 台
                    </span>
                  </div>
                </div>
                <div className="health-bars">
                  <HealthBar
                    label="公司库存"
                    value={`${formatCount(overview.companySerials)} 台`}
                    width={percentOf(overview.companySerials, totalSerials)}
                    tone="green"
                  />
                  <HealthBar
                    label="个人分销库存"
                    value={`${formatCount(overview.personalSerials)} 台`}
                    width={percentOf(overview.personalSerials, totalSerials)}
                    tone="blue"
                  />
                  <HealthBar
                    label="公司总仓"
                    value={`${formatCount(companyWarehouseSerials)} 台`}
                    width={percentOf(companyWarehouseSerials, totalSerials)}
                    tone="violet"
                  />
                  <HealthBar
                    label="门店仓合计"
                    value={`${formatCount(storeSerials)} 台`}
                    width={percentOf(storeSerials, totalSerials)}
                    tone="orange"
                  />
                </div>
              </div>
              <div className="panel-footnote">
                <span><i className="dot green" />有货仓库 {formatCount(stockedWarehouses)} 个</span>
                <span><i className="dot orange" />空仓 {formatCount(emptyWarehouses)} 个</span>
                <Link href="/inventory">查看库存明细 →</Link>
              </div>
            </>
          ) : (
            <p className="dashboard-panel-placeholder">
              {error ? "库存分布暂时无法加载，请点击上方重试。" : "正在加载库存分布…"}
            </p>
          )}
        </section>

        <section className="enterprise-panel quick-panel">
          <div className="panel-heading"><div><h2>快捷入口</h2><p>常用业务操作</p></div></div>
          <div className="quick-grid">
            {quickActions.map((action) => (
              <Link className="quick-action" href={action.href} key={action.label}>
                <span className={`quick-icon ${action.tone}`}><ErpIcon name={action.icon} /></span>
                <span><strong>{action.label}</strong><small>{action.note}</small></span>
                <b>→</b>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function HealthBar({ label, value, width, tone }: { label: string; value: string; width: number; tone: string }) {
  return (
    <div className="health-bar">
      <div><span>{label}</span><strong>{value}</strong></div>
      <div className="bar-track"><i className={tone} style={{ width: `${Math.min(100, width)}%` }} /></div>
    </div>
  );
}
