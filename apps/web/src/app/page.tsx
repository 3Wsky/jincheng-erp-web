import Link from "next/link";
import { DashboardMetrics } from "@/components/dashboard/dashboard-metrics";

/**
 * 模块实施进度：按权威文档口径（docs/19 环节状态总览）静态维护，
 * 只展示文档确认的阶段与状态，不编造完成度百分比（不展示伪数据）。
 */
const implementationRows = [
  { module: "货品主档", owner: "商品 / SKU / 条码 / 管家婆导入", phase: "阶段 1", status: "验证中", tone: "green" },
  { module: "库存与查货", owner: "库存总览 / 全局查货 / 单机档案", phase: "阶段 2", status: "验证中", tone: "green" },
  { module: "调拨管理", owner: "双向握手 · 单据驱动库存流水", phase: "阶段 2", status: "验证中", tone: "green" },
  { module: "采购与盘点", owner: "状态机与审批 · 成本分摊待确认", phase: "阶段 2", status: "规划中", tone: "neutral" },
  { module: "销售与资金", owner: "核心口径待签字", phase: "阶段 3~4", status: "受阻塞", tone: "orange" },
] as const;

export default function DashboardPage() {
  return (
    <main className="dashboard-page">
      <header className="page-heading dashboard-heading">
        <div>
          <div className="breadcrumb"><span>锦程 ERP</span><b>/</b><strong>经营工作台</strong></div>
          <h1>上午好，系统管理员</h1>
          <p>货品、库存、全局查货与调拨模块已进入业务验证阶段。</p>
        </div>
        <div className="heading-actions">
          <span className="source-chip"><i /> 管家婆数据源 · 已读取</span>
          <Link className="button primary" href="/catalog/products">进入货品中心</Link>
        </div>
      </header>

      <section className="dashboard-banner">
        <div className="banner-copy">
          <span className="banner-kicker">企业经营数字底座</span>
          <h2>从货品主档开始，建立可信、可追溯的业务事实。</h2>
          <p>管家婆数据先预校验、再归类建档；库存、成本与资金始终由正式业务单据驱动。</p>
          <div className="banner-actions">
            <Link className="button light" href="/catalog/products">管理货品</Link>
            <Link className="text-link" href="/system/health">查看系统实施状态 <span>→</span></Link>
          </div>
        </div>
        <div className="banner-visual" aria-label="系统数据链路">
          <div className="data-orbit orbit-one" />
          <div className="data-orbit orbit-two" />
          <div className="data-core"><span>ERP</span><small>可信业务中心</small></div>
          <span className="orbit-node node-a">货品</span>
          <span className="orbit-node node-b">库存</span>
          <span className="orbit-node node-c">经营</span>
        </div>
      </section>

      {/* 实时指标 + 库存分布 + 快捷入口：真实数据由 client 组件从 BFF 拉取 */}
      <DashboardMetrics />

      <div className="dashboard-grid secondary-grid">
        <section className="enterprise-panel implementation-panel">
          <div className="panel-heading">
            <div><h2>模块实施进度</h2><p>按权威文档状态展示，不以占位页冒充已完成</p></div>
            <Link className="panel-link" href="/system/health">查看全部</Link>
          </div>
          <div className="implementation-table" role="table" aria-label="ERP 模块实施进度">
            <div className="implementation-row table-head" role="row"><span>业务模块</span><span>当前边界</span><span>实施阶段</span><span>状态</span></div>
            {implementationRows.map((row) => (
              <div className="implementation-row" key={row.module} role="row">
                <strong>{row.module}</strong>
                <span>{row.owner}</span>
                <span>{row.phase}</span>
                <em className={`status-pill ${row.tone}`}>{row.status}</em>
              </div>
            ))}
          </div>
        </section>

        <section className="enterprise-panel attention-panel">
          <div className="panel-heading"><div><h2>需要关注</h2><p>上线前的业务确认项</p></div><span className="count-badge">3</span></div>
          <div className="attention-list">
            <AttentionItem tone="orange" title="仓库映射未签字" note="72 个管家婆源仓库需要映射正式组织仓库" href="/inventory" />
            <AttentionItem tone="red" title="销售单来源待确认" note="将影响锁库存、收款和退换货状态机" href="/sales/orders" />
            <AttentionItem tone="violet" title="权限矩阵待签字" note="DataScope/Field/Approval 维度等待矩阵签字" href="/admin/roles" />
          </div>
        </section>
      </div>
    </main>
  );
}

function AttentionItem({ tone, title, note, href }: { tone: string; title: string; note: string; href: string }) {
  return <Link className="attention-item" href={href}><span className={`attention-mark ${tone}`}><i /></span><span><strong>{title}</strong><small>{note}</small></span><b>›</b></Link>;
}
