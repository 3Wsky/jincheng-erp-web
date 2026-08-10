import Link from "next/link";

const modules = [
  ["找货与库存", "型号、SKU、IMEI/SN 全局检索，库存状态与责任人可追溯"],
  ["采购与到货", "付款和实物到货分别确认，自动识别已付未到与数量差异"],
  ["调拨与个人库", "申请、锁定、在途、扫码接收的双向握手流程"],
  ["销售与客户", "销售单连接人、货、钱、客户，并承接退换货与业绩"],
  ["员工经营", "考勤、销售、视频、直播、回访、私域和绩效统一归集"],
  ["权限与审计", "角色、数据范围、动作、字段、审批额度与完整操作日志"],
] as const;

export default function Home() {
  return (
    <main>
      <section className="hero">
        <p className="eyebrow">锦程内部 ERP · 网站端立项骨架</p>
        <h1>先让门店稳定用起来，再逐步扩展到 PC、APP 与小程序。</h1>
        <p className="lead">
          网站端优先实现库存、采购、调拨、销售、客户和权限主链路；所有业务能力通过统一
          API 提供，避免未来多端重复开发。
        </p>
        <div className="status-row">
          <span>项目状态：已立项</span>
          <span>当前阶段：业务确认与基础架构</span>
          <span>最高优先级：销售单闭环</span>
        </div>
      </section>

      <section className="grid" aria-label="首期模块">
        {modules.map(([title, description]) => (
          <article key={title}>
            <h2>{title}</h2>
            <p>{description}</p>
          </article>
        ))}
      </section>

      <section className="launch-card">
        <div>
          <p className="eyebrow">当前可验证模块</p>
          <h2>货品中心已进入验证阶段</h2>
          <p>
            维护商品、SKU 和条码，读取智储星中的管家婆
            CDS，并把异常串号留在预校验批次。
          </p>
        </div>
        <Link className="launch-link" href="/catalog/products">
          打开货品中心 →
        </Link>
      </section>

      <section className="decision">
        <div>
          <p className="eyebrow">架构决定</p>
          <h2>模块化单体，而不是一开始做微服务</h2>
        </div>
        <p>
          首期用一个可清晰分模块的 API 和一个后台任务
          Worker，把交易一致性、权限、审计和上线速度放在第一位。等业务边界和负载真实出现后再拆服务。
        </p>
      </section>
    </main>
  );
}
