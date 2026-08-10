export type ErpIconName =
  | "dashboard"
  | "catalog"
  | "inventory"
  | "procurement"
  | "transfer"
  | "sales"
  | "crm"
  | "finance"
  | "reports"
  | "executive"
  | "organization"
  | "shield"
  | "integration"
  | "system"
  | "search"
  | "task"
  | "bell"
  | "plus"
  | "chevron";

export interface NavigationItem {
  label: string;
  href: string;
  icon: ErpIconName;
  badge?: string;
  status?: "ready" | "planned" | "blocked";
}

export interface NavigationGroup {
  label: string;
  items: NavigationItem[];
}

export const navigationGroups: NavigationGroup[] = [
  {
    label: "经营总览",
    items: [
      { label: "经营工作台", href: "/", icon: "dashboard", status: "ready" },
      { label: "全局查货", href: "/search", icon: "search", status: "planned" },
      { label: "我的待办", href: "/tasks", icon: "task", badge: "6", status: "planned" },
    ],
  },
  {
    label: "进销存",
    items: [
      { label: "货品中心", href: "/catalog/products", icon: "catalog", badge: "可用", status: "ready" },
      { label: "库存管理", href: "/inventory", icon: "inventory", status: "planned" },
      { label: "采购管理", href: "/procurement/orders", icon: "procurement", status: "planned" },
      { label: "调拨管理", href: "/transfers", icon: "transfer", status: "planned" },
      { label: "销售管理", href: "/sales/orders", icon: "sales", badge: "待确认", status: "blocked" },
    ],
  },
  {
    label: "客户与经营",
    items: [
      { label: "客户管理", href: "/crm/customers", icon: "crm", status: "planned" },
      { label: "财务中心", href: "/finance/ledger", icon: "finance", status: "blocked" },
      { label: "经营报表", href: "/reports/daily", icon: "reports", status: "planned" },
      { label: "老板驾驶舱", href: "/reports/executive", icon: "executive", status: "planned" },
    ],
  },
  {
    label: "组织与系统",
    items: [
      { label: "组织与员工", href: "/admin/organization", icon: "organization", status: "planned" },
      { label: "权限与审批", href: "/admin/roles", icon: "shield", status: "planned" },
      { label: "集成中心", href: "/integrations", icon: "integration", status: "planned" },
      { label: "系统设置", href: "/system/health", icon: "system", status: "planned" },
    ],
  },
];

export interface ModulePageDefinition {
  eyebrow: string;
  title: string;
  description: string;
  status: "规划中" | "待业务确认" | "下一阶段";
  statusTone: "neutral" | "warning";
  capabilities: Array<{ title: string; description: string }>;
  milestones: string[];
}

export const modulePages: Record<string, ModulePageDefinition> = {
  "/search": {
    eyebrow: "全局能力 · AC-F-004",
    title: "全局查货",
    description: "按型号、SKU、条码与 IMEI/SN 查找货品位置、库存状态和责任归属。",
    status: "下一阶段",
    statusTone: "neutral",
    capabilities: [
      { title: "多维检索", description: "一个搜索框覆盖商品、SKU、条码和串号。" },
      { title: "库存定位", description: "下钻到门店、仓库、个人库与在途状态。" },
      { title: "单机时间线", description: "展示每台设备的收货、调拨、销售和售后轨迹。" },
    ],
    milestones: ["确认仓库映射", "建立库存流水", "接入串号时间线"],
  },
  "/tasks": {
    eyebrow: "协同中心",
    title: "我的待办",
    description: "集中处理采购审批、调拨接收、盘点差异、回访和异常任务。",
    status: "规划中",
    statusTone: "neutral",
    capabilities: [
      { title: "统一待办", description: "跨业务模块聚合个人需要处理的事项。" },
      { title: "审批分级", description: "按金额、数量和角色进入不同审批链。" },
      { title: "超时提醒", description: "提供到期、催办、转交与处理记录。" },
    ],
    milestones: ["确认审批矩阵", "建立任务模型", "接入消息中心"],
  },
  "/notifications": {
    eyebrow: "消息中心",
    title: "消息与异常",
    description: "归集系统通知、库存异常、导入失败与业务超时提醒。",
    status: "规划中",
    statusTone: "neutral",
    capabilities: [
      { title: "分级消息", description: "区分普通通知、业务警告和高风险异常。" },
      { title: "业务跳转", description: "从消息直接进入对应单据和处理页面。" },
      { title: "已读追踪", description: "记录触达、已读和处理状态。" },
    ],
    milestones: ["统一事件来源", "定义通知级别", "接入企业微信"],
  },
  "/inventory": {
    eyebrow: "库存中心 · AC-F-004",
    title: "库存管理",
    description: "管理仓库库存、个人库存、序列号档案、盘点和库存异常。",
    status: "下一阶段",
    statusTone: "neutral",
    capabilities: [
      { title: "库存总览", description: "按公司、区域、门店、仓库和 SKU 查询余额。" },
      { title: "一机一档", description: "IMEI/SN 公司范围唯一，完整记录责任变化。" },
      { title: "盘点与异常", description: "扫码盘点，差异需审批并由单据驱动调整。" },
    ],
    milestones: ["确认 72 个源仓库映射", "签字负库存规则", "建立库存流水"],
  },
  "/procurement/orders": {
    eyebrow: "采购中心",
    title: "采购管理",
    description: "覆盖供应商、采购申请、审批、付款、到货与差异处理。",
    status: "下一阶段",
    statusTone: "neutral",
    capabilities: [
      { title: "采购订单", description: "从申请、审批到下单保留完整业务链路。" },
      { title: "付款与到货", description: "资金确认和实物收货分开握手。" },
      { title: "差异处理", description: "识别已付未到、少收、超收和串号异常。" },
    ],
    milestones: ["确认供应商主档", "确认采购审批额度", "确认收货差异规则"],
  },
  "/transfers": {
    eyebrow: "调拨中心",
    title: "调拨管理",
    description: "管理门店、仓库和个人库之间的申请、发出、在途与接收。",
    status: "下一阶段",
    statusTone: "neutral",
    capabilities: [
      { title: "双向握手", description: "发出方与接收方分别确认，避免单边完成。" },
      { title: "扫码接收", description: "支持扫码枪和手机连续扫描，自动防重。" },
      { title: "在途责任", description: "明确锁定、在途、差异和最终责任人。" },
    ],
    milestones: ["确认调拨审批", "建立状态机", "完成移动端接收"],
  },
  "/sales/orders": {
    eyebrow: "销售中心",
    title: "销售管理",
    description: "未来连接商品、序列号、客户、收款、退换货与业绩归属。",
    status: "待业务确认",
    statusTone: "warning",
    capabilities: [
      { title: "销售开单", description: "来源、设备与扣库存时点仍需业务签字。" },
      { title: "收款对账", description: "支付方式、确认角色和对账规则仍需确认。" },
      { title: "退换货", description: "按原单冲回库存、资金与业绩，禁止直接删除。" },
    ],
    milestones: ["确认销售单唯一来源", "确认扣库存时点", "确认收款和退换流程"],
  },
  "/crm/customers": {
    eyebrow: "客户中心",
    title: "客户管理",
    description: "建立统一客户档案，承接购买历史、员工归属、回访与私域运营。",
    status: "规划中",
    statusTone: "neutral",
    capabilities: [
      { title: "统一客户", description: "受控合并手机号、会员与外部平台身份。" },
      { title: "跟进时间线", description: "记录销售、回访、任务和下次提醒。" },
      { title: "隐私保护", description: "手机号按角色脱敏，导出使用独立权限。" },
    ],
    milestones: ["确认客户去重规则", "确认归属规则", "确认企微授权范围"],
  },
  "/finance/ledger": {
    eyebrow: "财务中心",
    title: "业务资金",
    description: "统一承接采购付款、销售收款、退款、应收应付和业务对账。",
    status: "待业务确认",
    statusTone: "warning",
    capabilities: [
      { title: "资金流水", description: "每笔资金变化必须关联业务单据和操作人。" },
      { title: "应收应付", description: "跟踪未收、未付、已付未到与退款状态。" },
      { title: "毛利口径", description: "成本和毛利算法尚未签字，不展示伪数据。" },
    ],
    milestones: ["确认支付方式", "确认财务审批", "签字成本与毛利口径"],
  },
  "/reports/daily": {
    eyebrow: "经营分析",
    title: "经营报表",
    description: "从销售、库存、资金和客户指标下钻到门店、员工与业务单据。",
    status: "规划中",
    statusTone: "neutral",
    capabilities: [
      { title: "经营日报", description: "统一日、周、月指标与门店对比。" },
      { title: "指标下钻", description: "汇总数据可追溯到原始业务单据。" },
      { title: "口径版本", description: "保留指标定义、生效时间与历史版本。" },
    ],
    milestones: ["确认指标口径", "建立报表数据集", "完成角色数据范围"],
  },
  "/reports/executive": {
    eyebrow: "管理驾驶舱",
    title: "老板驾驶舱",
    description: "聚合公司经营趋势、门店排名、资金健康和关键风险。",
    status: "规划中",
    statusTone: "neutral",
    capabilities: [
      { title: "核心指标", description: "聚合销售、库存、资金、客户和员工表现。" },
      { title: "风险雷达", description: "突出库存积压、异常串号、资金和任务超时。" },
      { title: "穿透分析", description: "从公司到区域、门店、员工和单据逐级下钻。" },
    ],
    milestones: ["业务模块形成事实数据", "签字经营指标", "完成移动大屏适配"],
  },
  "/admin/organization": {
    eyebrow: "组织中心",
    title: "组织与员工",
    description: "配置公司、区域、门店、仓库、员工、账号与离职交接关系。",
    status: "下一阶段",
    statusTone: "neutral",
    capabilities: [
      { title: "组织树", description: "维护公司、区域、门店与仓库层级。" },
      { title: "员工档案", description: "记录任职、兼岗、门店归属和账号状态。" },
      { title: "离职交接", description: "交接库存、客户、待办和在途责任。" },
    ],
    milestones: ["导入真实组织", "建立员工账号", "确认兼岗与离职规则"],
  },
  "/admin/roles": {
    eyebrow: "权限中心",
    title: "权限与审批",
    description: "按角色、数据范围、动作、字段和审批额度构建企业级权限体系。",
    status: "下一阶段",
    statusTone: "neutral",
    capabilities: [
      { title: "五维权限", description: "Role × DataScope × Action × Field × Approval。" },
      { title: "敏感字段", description: "成本、毛利、客户手机号和账户按角色控制。" },
      { title: "完整审计", description: "高风险操作二次确认并记录前后值。" },
    ],
    milestones: ["确认角色名单", "签字权限矩阵", "建立越权反向测试"],
  },
  "/integrations": {
    eyebrow: "开放平台",
    title: "集成中心",
    description: "统一管理管家婆、企业微信、小程序、短视频与直播平台连接。",
    status: "规划中",
    statusTone: "neutral",
    capabilities: [
      { title: "连接管理", description: "集中管理授权、状态、限流和密钥轮换。" },
      { title: "同步任务", description: "展示同步进度、失败明细、重试和对账。" },
      { title: "原始事实", description: "保留外部 ID、同步批次和原始载荷。" },
    ],
    milestones: ["确认平台主体", "确认 API 权限", "建立同步与降级方案"],
  },
  "/system/health": {
    eyebrow: "系统管理",
    title: "系统设置",
    description: "管理系统健康、导入任务、审计日志、基础参数与部署状态。",
    status: "规划中",
    statusTone: "neutral",
    capabilities: [
      { title: "系统健康", description: "监控网站、API、数据库、队列和备份状态。" },
      { title: "任务中心", description: "管理导入、导出、同步和失败重试。" },
      { title: "审计查询", description: "按操作人、对象、动作和 request_id 检索。" },
    ],
    milestones: ["确认部署环境", "建立备份策略", "接入监控告警"],
  },
};
