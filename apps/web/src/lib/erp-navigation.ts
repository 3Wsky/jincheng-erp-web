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
      { label: "全局查货", href: "/search", icon: "search", badge: "可用", status: "ready" },
      { label: "我的待办", href: "/tasks", icon: "task", badge: "可用", status: "ready" },
    ],
  },
  {
    label: "进销存",
    items: [
      { label: "货品中心", href: "/catalog/products", icon: "catalog", badge: "可用", status: "ready" },
      { label: "库存管理", href: "/inventory", icon: "inventory", badge: "可用", status: "ready" },
      { label: "盘点管理", href: "/inventory/stocktakes", icon: "inventory", badge: "可用", status: "ready" },
      { label: "采购管理", href: "/procurement/orders", icon: "procurement", badge: "可用", status: "ready" },
      { label: "调拨管理", href: "/transfers", icon: "transfer", badge: "可用", status: "ready" },
      { label: "销售管理", href: "/sales/orders", icon: "sales", badge: "待确认", status: "blocked" },
    ],
  },
  {
    label: "客户与经营",
    items: [
      { label: "客户管理", href: "/crm/customers", icon: "crm", badge: "可用", status: "ready" },
      { label: "财务中心", href: "/finance/ledger", icon: "finance", status: "blocked" },
      { label: "经营报表", href: "/reports/daily", icon: "reports", status: "planned" },
      { label: "老板驾驶舱", href: "/reports/executive", icon: "executive", status: "planned" },
    ],
  },
  {
    label: "组织与系统",
    items: [
      { label: "组织与员工", href: "/admin/organization", icon: "organization", badge: "可用", status: "ready" },
      { label: "权限与审批", href: "/admin/roles", icon: "shield", badge: "可用", status: "ready" },
      { label: "集成中心", href: "/integrations", icon: "integration", status: "planned" },
      { label: "系统设置", href: "/system/health", icon: "system", badge: "可用", status: "ready" },
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
  // /search 已由真实页面实现（apps/web/src/app/search），不再使用占位页。
  // /tasks 已由真实页面实现（apps/web/src/app/tasks），不再使用占位页。
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
  // /procurement/orders 已由真实页面实现（apps/web/src/app/procurement/orders），不再使用占位页。
  // /transfers 已由真实页面实现（apps/web/src/app/transfers），不再使用占位页。
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
  // /crm/customers 已由真实页面实现（apps/web/src/app/crm/customers），不再使用占位页。
  // 客户合并(customer-merges)待去重规则签字后实现;企微/会员身份映射 BLOCKED 于平台权限。
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
  // /admin/organization 已由真实页面实现（apps/web/src/app/admin/organization），不再使用占位页。
  // /admin/roles 已由真实页面实现（apps/web/src/app/admin/roles），不再使用占位页。
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
  // /system/health 已由真实页面实现（apps/web/src/app/system/health），不再使用占位页。
};
