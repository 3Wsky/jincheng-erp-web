import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ErpIcon } from "@/components/erp-icon";
import { modulePages } from "@/lib/erp-navigation";

interface ModulePageProps {
  params: Promise<{ slug: string[] }>;
}

export async function generateMetadata({ params }: ModulePageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = modulePages[`/${slug.join("/")}`];
  return page ? { title: page.title, description: page.description } : {};
}

export default async function ModulePlaceholderPage({ params }: ModulePageProps) {
  const { slug } = await params;
  const path = `/${slug.join("/")}`;
  const page = modulePages[path];
  if (!page) notFound();

  return (
    <main className="module-page">
      <header className="page-heading module-heading">
        <div>
          <div className="breadcrumb"><span>锦程 ERP</span><b>/</b><strong>{page.title}</strong></div>
          <h1>{page.title}</h1>
          <p>{page.description}</p>
        </div>
        <span className={`module-status ${page.statusTone}`}><i />{page.status}</span>
      </header>

      <section className="module-hero-card">
        <div className="module-hero-copy">
          <span className="module-eyebrow">{page.eyebrow}</span>
          <h2>产品框架已就位，等待业务规则确认后接入真实数据。</h2>
          <p>当前页面展示正式的信息架构、能力边界和实施路径。涉及库存、资金、成本、销售和权限的规则不会在未签字时自行假设。</p>
          <div className="module-actions"><Link className="button primary" href="/catalog/products">先使用货品中心</Link><Link className="button ghost" href="/">返回经营工作台</Link></div>
        </div>
        <div className="module-illustration" aria-hidden="true">
          <span className="illustration-window"><i /><i /><i /></span>
          <span className="illustration-card one" />
          <span className="illustration-card two" />
          <span className="illustration-line a" />
          <span className="illustration-line b" />
          <span className="illustration-dot" />
        </div>
      </section>

      <section className="capability-section">
        <div className="section-title"><div><span>规划能力</span><h2>模块将覆盖的核心场景</h2></div><small>以业务签字与验收用例为准</small></div>
        <div className="capability-grid">
          {page.capabilities.map((capability, index) => (
            <article className="capability-card" key={capability.title}>
              <span className="capability-number">0{index + 1}</span>
              <div><h3>{capability.title}</h3><p>{capability.description}</p></div>
              <span className="capability-arrow">↗</span>
            </article>
          ))}
        </div>
      </section>

      <div className="module-bottom-grid">
        <section className="enterprise-panel milestone-panel">
          <div className="panel-heading"><div><h2>实施里程碑</h2><p>从业务确认到可验收功能</p></div></div>
          <ol className="milestone-list">
            {page.milestones.map((milestone, index) => <li key={milestone}><span>{index + 1}</span><div><strong>{milestone}</strong><small>{index === 0 ? "当前准备项" : "前序完成后启动"}</small></div>{index === 0 ? <em>待确认</em> : null}</li>)}
          </ol>
        </section>
        <section className="enterprise-panel governance-panel">
          <div className="governance-icon"><ErpIcon name="shield" size={28} /></div>
          <h2>统一治理标准</h2>
          <p>所有正式模块默认继承数据权限、字段脱敏、审批、审计和异常处理能力。</p>
          <ul><li>业务写入关联操作人和 request_id</li><li>库存与资金变化由业务单据驱动</li><li>关键状态按状态机和角色握手</li></ul>
        </section>
      </div>
    </main>
  );
}
