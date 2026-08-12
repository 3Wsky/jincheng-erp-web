/**
 * 打通度体检 HTML 看板：单文件、零依赖、离线可开。
 * 输入为 probe.mjs 汇总的 result 对象。
 */

const STATUS_META = {
  pass: { label: "已打通", color: "#3fb950" },
  fail: { label: "失败", color: "#f85149" },
  warn: { label: "警示", color: "#d29922" },
  skip: { label: "未探测", color: "#6e7681" },
  blocked: { label: "待确认", color: "#bc8cff" },
};

const VERDICT_META = {
  已打通: { color: "#3fb950", bg: "rgba(63,185,80,.12)" },
  部分打通: { color: "#d29922", bg: "rgba(210,153,34,.12)" },
  后端已通: { color: "#58a6ff", bg: "rgba(88,166,255,.12)" },
  页面可用: { color: "#d29922", bg: "rgba(210,153,34,.12)" },
  链路异常: { color: "#f85149", bg: "rgba(248,81,73,.12)" },
  待业务确认: { color: "#bc8cff", bg: "rgba(188,140,255,.12)" },
  未开发: { color: "#6e7681", bg: "rgba(110,118,129,.12)" },
  未探测: { color: "#6e7681", bg: "rgba(110,118,129,.12)" },
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function dot(status) {
  const meta = STATUS_META[status] ?? STATUS_META.skip;
  return `<span class="dot" style="background:${meta.color}" title="${meta.label}"></span>`;
}

function renderChain(chain) {
  const steps = chain.steps
    .map(
      (step) => `
      <div class="chain-step ${step.status}" title="${escapeHtml(step.detail ?? "")}">
        ${dot(step.status)}
        <span class="chain-step-name">${escapeHtml(step.name)}</span>
        ${step.ms !== undefined ? `<span class="chain-ms">${step.ms}ms</span>` : ""}
      </div>`,
    )
    .join('<div class="chain-arrow">→</div>');
  const okCount = chain.steps.filter((step) => step.status === "pass").length;
  return `
    <div class="chain">
      <div class="chain-title">${escapeHtml(chain.name)} <em>${okCount}/${chain.steps.length}</em></div>
      <div class="chain-track">${steps}</div>
    </div>`;
}

function renderModule(module) {
  const meta = VERDICT_META[module.verdict] ?? VERDICT_META.未探测;
  const apiText =
    module.api.planned > 0
      ? `接口 ${module.api.implemented ?? "?"} / ${module.api.planned}`
      : "无接口计划";
  const runtimeText =
    module.runtime.total > 0
      ? `运行验证 ${module.runtime.pass}/${module.runtime.total}${module.runtime.fail ? `（失败 ${module.runtime.fail}）` : ""}`
      : "无运行验证项";
  const apiRatio = module.api.planned > 0 ? Math.round(((module.api.implemented ?? 0) / module.api.planned) * 100) : 0;
  return `
    <div class="module">
      <div class="module-head">
        <strong>${escapeHtml(module.name)}</strong>
        <span class="verdict" style="color:${meta.color};background:${meta.bg}">${escapeHtml(module.verdict)}</span>
      </div>
      <div class="module-route">${escapeHtml(module.route)}${module.phase ? ` · ${escapeHtml(module.phase)}` : ""}</div>
      <div class="module-bar"><i style="width:${apiRatio}%;background:${meta.color}"></i></div>
      <ul class="module-facts">
        <li>${escapeHtml(apiText)}</li>
        <li>页面：${module.pageExists ? "已实现" : "占位页"}</li>
        <li>${escapeHtml(runtimeText)}</li>
        ${module.blockedReason ? `<li class="blocked-reason">${escapeHtml(module.blockedReason)}</li>` : ""}
        ${module.note ? `<li class="module-note">${escapeHtml(module.note)}</li>` : ""}
      </ul>
    </div>`;
}

function renderApiRow(api) {
  const status = api.implemented === null ? "skip" : api.implemented ? "pass" : "fail";
  const label = api.implemented === null ? "未探测" : api.implemented ? "已实现" : "未实现";
  return `<tr>
    <td>${escapeHtml(api.id)}</td>
    <td><code>${escapeHtml(api.method)} ${escapeHtml(api.path)}</code></td>
    <td>${escapeHtml(api.module)}</td>
    <td>${dot(status)} ${label}</td>
  </tr>`;
}

function renderFutureRow(module) {
  const implemented = module.implementedCount;
  const started = typeof implemented === "number" && implemented > 0;
  return `<tr>
    <td>${escapeHtml(module.apiRange)}</td>
    <td>${escapeHtml(module.name)}${module.blocked ? ' <span class="tag-blocked">待业务确认</span>' : ""}</td>
    <td>${escapeHtml(module.phase)}</td>
    <td>${dot(started ? "warn" : module.blocked ? "blocked" : "skip")} ${
      implemented === null ? "未探测" : started ? `已出现 ${implemented} 个接口` : "未开发"
    }（计划约 ${module.plannedCount} 个）</td>
  </tr>`;
}

function renderCheckRow(check) {
  const meta = STATUS_META[check.status] ?? STATUS_META.skip;
  return `<tr>
    <td>${dot(check.status)} ${meta.label}</td>
    <td>${escapeHtml(check.group)}</td>
    <td>${escapeHtml(check.name)}</td>
    <td class="detail-cell">${escapeHtml(check.detail ?? "")}${check.hint ? `<div class="hint">↳ ${escapeHtml(check.hint)}</div>` : ""}</td>
    <td>${check.ms !== undefined ? `${check.ms}ms` : "—"}</td>
  </tr>`;
}

export function renderHtml(result) {
  const { summary, chains, modules, coverage, checks, dataFootprint, config, generatedAt } = result;
  const generated = new Date(generatedAt).toLocaleString("zh-CN", { hour12: false });
  const groups = [...new Set(modules.map((module) => module.group))];

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>锦程 ERP 打通度体检 · ${escapeHtml(generated)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 32px 24px 64px; background: #0d1117; color: #e6edf3;
    font: 14px/1.6 "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif;
  }
  .wrap { max-width: 1180px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0; letter-spacing: .5px; }
  h2 { font-size: 15px; margin: 40px 0 12px; color: #e6edf3; border-left: 3px solid #58a6ff; padding-left: 10px; }
  .meta { color: #8b949e; margin-top: 6px; font-size: 12.5px; }
  .meta code { color: #a5d6ff; background: none; }
  .stats { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 20px; }
  .stat {
    flex: 1 1 150px; background: #161b22; border: 1px solid #21262d; border-radius: 10px;
    padding: 14px 16px;
  }
  .stat b { display: block; font-size: 24px; font-weight: 600; }
  .stat span { color: #8b949e; font-size: 12px; }
  .dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 4px; vertical-align: baseline; }
  .chain { background: #161b22; border: 1px solid #21262d; border-radius: 10px; padding: 12px 16px; margin-bottom: 10px; }
  .chain-title { font-weight: 600; margin-bottom: 8px; }
  .chain-title em { font-style: normal; color: #8b949e; font-weight: 400; margin-left: 6px; }
  .chain-track { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .chain-step {
    display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px;
    background: #0d1117; border: 1px solid #21262d; border-radius: 999px; font-size: 12.5px;
  }
  .chain-step.fail { border-color: rgba(248,81,73,.5); }
  .chain-step.pass { border-color: rgba(63,185,80,.35); }
  .chain-step.warn { border-color: rgba(210,153,34,.5); }
  .chain-ms { color: #6e7681; font-size: 11px; }
  .chain-arrow { color: #30363d; }
  .modules { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px; }
  .module { background: #161b22; border: 1px solid #21262d; border-radius: 10px; padding: 14px 16px; }
  .module-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .verdict { font-size: 12px; padding: 2px 9px; border-radius: 999px; white-space: nowrap; }
  .module-route { color: #6e7681; font-size: 12px; margin-top: 2px; }
  .module-bar { height: 4px; background: #21262d; border-radius: 4px; margin: 10px 0; overflow: hidden; }
  .module-bar i { display: block; height: 100%; border-radius: 4px; }
  .module-facts { list-style: none; margin: 0; padding: 0; color: #8b949e; font-size: 12.5px; }
  .module-facts li + li { margin-top: 2px; }
  .blocked-reason { color: #bc8cff; }
  .module-note { color: #d29922; }
  .group-label { margin: 18px 0 8px; color: #8b949e; font-size: 12.5px; letter-spacing: 1px; }
  table { width: 100%; border-collapse: collapse; background: #161b22; border: 1px solid #21262d; border-radius: 10px; overflow: hidden; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #21262d; font-size: 13px; vertical-align: top; }
  th { background: #0d1117; color: #8b949e; font-weight: 500; font-size: 12px; }
  tr:last-child td { border-bottom: none; }
  code { background: #0d1117; padding: 1px 6px; border-radius: 5px; font-size: 12px; color: #a5d6ff; }
  .hint { color: #d29922; font-size: 12px; }
  .detail-cell { max-width: 520px; word-break: break-all; }
  .tag-blocked { color: #bc8cff; font-size: 11px; border: 1px solid rgba(188,140,255,.4); border-radius: 999px; padding: 1px 7px; }
  .footprint { display: flex; flex-wrap: wrap; gap: 8px; }
  .footprint span { background: #161b22; border: 1px solid #21262d; border-radius: 8px; padding: 6px 12px; font-size: 12.5px; color: #8b949e; }
  .footprint b { color: #e6edf3; font-weight: 600; margin-left: 6px; }
  details { margin-top: 10px; }
  summary { cursor: pointer; color: #58a6ff; font-size: 13px; }
  .legend { color: #6e7681; font-size: 12px; margin-top: 6px; }
  footer { margin-top: 48px; color: #6e7681; font-size: 12px; border-top: 1px solid #21262d; padding-top: 16px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>锦程 ERP 打通度体检</h1>
  <div class="meta">
    生成于 ${escapeHtml(generated)} · API <code>${escapeHtml(config.apiBase)}</code> · Web <code>${escapeHtml(config.webBase)}</code>
    · 探针账号 <code>${escapeHtml(config.probeUser)}</code>${config.writeEnabled ? " · 写链路已启用" : " · 只读模式"}
  </div>

  <div class="stats">
    <div class="stat"><b style="color:#3fb950">${summary.pass}</b><span>环节通过</span></div>
    <div class="stat"><b style="color:#f85149">${summary.fail}</b><span>环节失败</span></div>
    <div class="stat"><b style="color:#d29922">${summary.warn}</b><span>警示</span></div>
    <div class="stat"><b style="color:#6e7681">${summary.skip}</b><span>未探测/跳过</span></div>
    <div class="stat"><b>${summary.apiImplemented}/${summary.apiPlanned}</b><span>计划接口已落地</span></div>
    <div class="stat"><b>${summary.modulesReady} + ${summary.modulesPartial}</b><span>模块已打通 + 部分打通</span></div>
  </div>

  <h2>业务链路打通情况</h2>
  <div class="legend">每个节点都来自一次真实请求或 SQL 查询；悬停节点可看证据。绿=打通，红=失败，黄=警示，灰=未探测，紫=待业务确认。</div>
  ${chains.map(renderChain).join("")}

  <h2>模块地图（对照左侧导航）</h2>
  ${groups
    .map(
      (group) => `
    <div class="group-label">${escapeHtml(group)}</div>
    <div class="modules">${modules.filter((module) => module.group === group).map(renderModule).join("")}</div>`,
    )
    .join("")}

  <h2>接口落地对照（docs/10-API接口清单）</h2>
  <table>
    <thead><tr><th>编号</th><th>接口</th><th>模块</th><th>状态</th></tr></thead>
    <tbody>${coverage.planned.map(renderApiRow).join("")}</tbody>
  </table>
  ${
    coverage.undocumented.length > 0
      ? `<details><summary>实际暴露但不在计划清单内的接口（${coverage.undocumented.length} 个）</summary>
         <table><tbody>${coverage.undocumented.map((item) => `<tr><td><code>${escapeHtml(item)}</code></td></tr>`).join("")}</tbody></table></details>`
      : ""
  }

  <h2>后续模块（尚未进入实现阶段）</h2>
  <table>
    <thead><tr><th>编号区间</th><th>模块</th><th>路线阶段</th><th>探测结果</th></tr></thead>
    <tbody>${coverage.future.map(renderFutureRow).join("")}</tbody>
  </table>

  ${
    dataFootprint.length > 0
      ? `<h2>数据库业务数据足迹</h2>
  <div class="footprint">${dataFootprint.map((item) => `<span>${escapeHtml(item.table)}<b>${item.count}</b></span>`).join("")}</div>`
      : ""
  }

  <h2>全部探测明细</h2>
  <table>
    <thead><tr><th>状态</th><th>分组</th><th>环节</th><th>证据 / 提示</th><th>耗时</th></tr></thead>
    <tbody>${checks.map(renderCheckRow).join("")}</tbody>
  </table>

  <footer>
    重新体检：<code>pnpm progress</code> · 写链路探测：<code>pnpm progress -- --write</code> ·
    指定账号：<code>pnpm progress -- --user=U --pass=P</code> · 机器可读结果：<code>progress-report.json</code><br />
    判定基线来自 <code>scripts/progress/plan.mjs</code>（与 docs/10、docs/08 对应，文档更新时需同步）。
  </footer>
</div>
</body>
</html>`;
}
