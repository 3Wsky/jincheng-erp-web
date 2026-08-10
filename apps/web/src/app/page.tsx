import Link from "next/link";
import { ErpIcon } from "@/components/erp-icon";

const sourceMetrics = [
  { label: "管家婆源货品", value: "1,645", delta: "唯一 SKU", tone: "blue" },
  { label: "有效货品明细", value: "5,758", delta: "共扫描 5,775 行", tone: "green" },
  { label: "待处理异常", value: "17", delta: "预校验错误行", tone: "orange" },
  { label: "源仓库数量", value: "72", delta: "映射待业务确认", tone: "violet" },
] as const;

const quickActions = [
  { label: "新建商品", note: "创建商品和首个 SKU", href: "/catalog/products", icon: "catalog" as const, tone: "blue" },
  { label: "管家婆预校验", note: "读取最新 CDS 文件", href: "/catalog/products", icon: "integration" as const, tone: "cyan" },
  { label: "全局查货", note: "SKU、条码与串号", href: "/search", icon: "search" as const, tone: "violet" },
  { label: "库存盘点", note: "扫码录入盘点差异", href: "/inventory", icon: "inventory" as const, tone: "orange" },
] as const;

const implementationRows = [
  { module: "货品主档", owner: "商品 / SKU / 条码", progress: 82, status: "验证中", tone: "green" },
  { module: "库存与串号", owner: "仓库映射待确认", progress: 38, status: "下一阶段", tone: "blue" },
  { module: "采购与调拨", owner: "状态机与审批", progress: 24, status: "规划中", tone: "neutral" },
  { module: "销售与资金", owner: "核心口径待签字", progress: 12, status: "受阻塞", tone: "orange" },
] as const;

export default function DashboardPage() {
  return (
    <main className="dashboard-page">
      <header className="page-heading dashboard-heading">
        <div>
          <div className="breadcrumb"><span>锦程 ERP</span><b>/</b><strong>经营工作台</strong></div>
          <h1>上午好，系统管理员</h1>
          <p>今天是 2026 年 8 月 10 日，货品中心已进入业务验证阶段。</p>
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

      <section className="metric-grid dashboard-metrics" aria-label="管家婆源数据扫描摘要">
        {sourceMetrics.map((metric) => (
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

      <div className="dashboard-grid primary-grid">
        <section className="enterprise-panel operations-panel">
          <div className="panel-heading">
            <div><h2>货品数据健康度</h2><p>基于最新管家婆 CDS 的只读扫描结果</p></div>
            <span className="panel-tag success">可验证</span>
          </div>
          <div className="health-content">
            <div className="health-score">
              <div className="score-ring"><strong>99.7%</strong><span>有效率</span></div>
              <div className="score-caption"><b>数据结构稳定</b><span>5,758 / 5,775 行通过解析</span></div>
            </div>
            <div className="health-bars">
              <HealthBar label="有效货品行" value="5,758" width={99.7} tone="green" />
              <HealthBar label="唯一 SKU" value="1,645" width={72} tone="blue" />
              <HealthBar label="源仓库" value="72" width={48} tone="violet" />
              <HealthBar label="重复串号" value="6" width={12} tone="orange" />
            </div>
          </div>
          <div className="panel-footnote"><span><i className="dot green" />0 个同编码名称冲突</span><span><i className="dot orange" />17 行进入错误清单</span><Link href="/catalog/products">查看预校验 →</Link></div>
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

      <div className="dashboard-grid secondary-grid">
        <section className="enterprise-panel implementation-panel">
          <div className="panel-heading">
            <div><h2>模块实施进度</h2><p>按权威文档状态展示，不以占位页冒充已完成</p></div>
            <Link className="panel-link" href="/system/health">查看全部</Link>
          </div>
          <div className="implementation-table" role="table" aria-label="ERP 模块实施进度">
            <div className="implementation-row table-head" role="row"><span>业务模块</span><span>当前边界</span><span>完成度</span><span>状态</span></div>
            {implementationRows.map((row) => (
              <div className="implementation-row" key={row.module} role="row">
                <strong>{row.module}</strong>
                <span>{row.owner}</span>
                <div className="progress-cell"><span><i style={{ width: `${row.progress}%` }} /></span><b>{row.progress}%</b></div>
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
            <AttentionItem tone="violet" title="权限矩阵待走查" note="需要销售、店长、库管和财务角色确认" href="/admin/roles" />
          </div>
        </section>
      </div>
    </main>
  );
}

function HealthBar({ label, value, width, tone }: { label: string; value: string; width: number; tone: string }) {
  return <div className="health-bar"><div><span>{label}</span><strong>{value}</strong></div><div className="bar-track"><i className={tone} style={{ width: `${width}%` }} /></div></div>;
}

function AttentionItem({ tone, title, note, href }: { tone: string; title: string; note: string; href: string }) {
  return <Link className="attention-item" href={href}><span className={`attention-mark ${tone}`}><i /></span><span><strong>{title}</strong><small>{note}</small></span><b>›</b></Link>;
}
