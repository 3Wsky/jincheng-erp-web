#!/usr/bin/env node
/**
 * 锦程 ERP 打通度体检：用真实探测（SQL + HTTP + 端到端业务动作）判断
 * “开发到哪一步、哪些环节已打通”，而不是依赖文字描述。
 *
 * 用法：
 *   pnpm progress                      # 只读探测（默认）
 *   pnpm progress -- --write          # 追加写链路探测（创建探针商品并停用）
 *   pnpm progress -- --user=xx --pass=yy   # 指定探针账号（默认 admin 种子账号）
 *   pnpm progress -- --api=http://localhost:3100/api/v1 --web=http://localhost:3000
 *   pnpm progress -- --no-html        # 不生成 HTML 报告
 *   pnpm progress -- --strict         # 有失败项时退出码为 1（供 CI 使用）
 *
 * 输出：
 *   控制台摘要 + progress-report.html（看板）+ progress-report.json（机器可读）
 *
 * 说明：
 * - 默认只读，不产生业务数据；--write 会创建一个 PROBE- 开头的探针商品，
 *   随后将其置为 INACTIVE（不物理删除，符合 AGENTS.md 第 4 条）。
 * - 探针登录会产生一条真实的 auth.login 审计记录，这正是“审计闭环”的验证依据。
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { connect as netConnect } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DB_TABLES,
  FUTURE_MODULES,
  NAV_MODULES,
  PLANNED_APIS,
} from "./plan.mjs";
import { renderHtml } from "./report.mjs";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const HTTP_TIMEOUT_MS = 5000;

// ---------- 参数与环境 ----------

const args = new Map();
for (const raw of process.argv.slice(2)) {
  if (!raw.startsWith("--")) continue;
  const eq = raw.indexOf("=");
  if (eq === -1) args.set(raw.slice(2), true);
  else args.set(raw.slice(2, eq), raw.slice(eq + 1));
}

if (args.has("help")) {
  console.log(
    [
      "锦程 ERP 打通度体检",
      "",
      "  pnpm progress                        只读探测",
      "  pnpm progress -- --write             追加写链路探测（创建探针商品后停用）",
      "  pnpm progress -- --user=U --pass=P   指定探针账号（默认 admin / 种子密码）",
      "  pnpm progress -- --api=URL --web=URL 指定 API / Web 地址",
      "  pnpm progress -- --db=URL            指定数据库连接串",
      "  pnpm progress -- --no-html           不生成 HTML 报告",
      "  pnpm progress -- --strict            有失败项时以退出码 1 结束",
    ].join("\n"),
  );
  process.exit(0);
}

/** 解析根目录 .env（只取 KEY=VALUE，不展开引用） */
function loadEnvFile(file) {
  const result = {};
  if (!existsSync(file)) return result;
  const text = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

const dotenv = loadEnvFile(path.join(ROOT, ".env"));
const env = (key) => process.env[key] ?? dotenv[key];

const config = {
  apiBase: String(args.get("api") ?? env("API_BASE_URL") ?? "http://localhost:3100/api/v1").replace(/\/$/, ""),
  webBase: String(args.get("web") ?? env("WEB_ORIGIN") ?? `http://localhost:${env("WEB_PORT") ?? 3000}`).split(",")[0].trim().replace(/\/$/, ""),
  databaseUrl: String(args.get("db") ?? env("DATABASE_URL") ?? ""),
  redisUrl: env("REDIS_URL") ?? "",
  minioUrl: env("OBJECT_STORAGE_ENDPOINT") ?? "",
  username: String(args.get("user") ?? env("PROBE_USERNAME") ?? "admin"),
  password: String(args.get("pass") ?? env("PROBE_PASSWORD") ?? "JinCheng@2026"),
  catalogWriteKey: env("CATALOG_WRITE_KEY") ?? "",
  write: args.has("write"),
  html: !args.has("no-html"),
  strict: args.has("strict"),
};
const apiOrigin = new URL(config.apiBase).origin;

// ---------- 检查项登记 ----------

/**
 * @typedef {Object} Check
 * @property {string} id
 * @property {string} name
 * @property {string} group
 * @property {"pass"|"fail"|"warn"|"skip"|"blocked"} status
 * @property {string} detail   证据（状态码、数量、错误信息）
 * @property {number} [ms]
 * @property {string} [hint]   失败时的修复提示
 */

/** @type {Check[]} */
const checks = [];
const byId = new Map();

const COLORS = {
  pass: "\u001B[32m", fail: "\u001B[31m", warn: "\u001B[33m",
  skip: "\u001B[90m", blocked: "\u001B[35m", reset: "\u001B[0m", dim: "\u001B[2m",
};
const MARKS = { pass: "✓", fail: "✗", warn: "!", skip: "○", blocked: "◼" };
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (status, text) => (useColor ? `${COLORS[status]}${text}${COLORS.reset}` : text);

function record(check) {
  checks.push(check);
  byId.set(check.id, check);
  const mark = MARKS[check.status] ?? "?";
  const ms = check.ms !== undefined ? ` (${check.ms}ms)` : "";
  const hint = check.status === "fail" && check.hint ? `\n      ↳ ${check.hint}` : "";
  console.log(`  ${paint(check.status, mark)} ${check.name}${ms}  ${paint("dim", check.detail ?? "")}${hint}`);
  return check;
}

function section(title) {
  console.log(`\n${paint("dim", "──")} ${title}`);
}

const passed = (id) => byId.get(id)?.status === "pass";

// ---------- HTTP 帮手 ----------

async function http(url, options = {}) {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      redirect: "manual",
      ...options,
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      headers: { accept: "application/json", ...(options.headers ?? {}) },
    });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* 非 JSON 响应 */ }
    return { ok: response.ok, status: response.status, headers: response.headers, json, text, ms: Date.now() - started, error: null };
  } catch (error) {
    return { ok: false, status: 0, headers: new Headers(), json: null, text: "", ms: Date.now() - started, error: shortError(error) };
  }
}

function shortError(error) {
  const message = error?.cause?.code ?? error?.code ?? error?.message ?? String(error);
  return String(message).slice(0, 120);
}

// ---------- 1. 工程与配置 ----------

async function checkWorkspace() {
  section("工程与配置");
  const envFile = path.join(ROOT, ".env");
  if (!existsSync(envFile)) {
    record({ id: "env-file", name: ".env 配置", group: "工程", status: "fail", detail: "根目录缺少 .env", hint: "复制 .env.example 为 .env 并修改密码" });
  } else {
    const missing = ["DATABASE_URL", "SESSION_SECRET"].filter((key) => !env(key));
    const defaults = [];
    if ((env("SESSION_SECRET") ?? "").includes("replace_with")) defaults.push("SESSION_SECRET 仍是示例值");
    if ((env("DATABASE_URL") ?? "").includes("change_me")) defaults.push("数据库密码仍是 change_me");
    if (missing.length > 0) {
      record({ id: "env-file", name: ".env 配置", group: "工程", status: "fail", detail: `缺少 ${missing.join("、")}`, hint: "补齐 .env 中的必要配置" });
    } else if (defaults.length > 0) {
      record({ id: "env-file", name: ".env 配置", group: "工程", status: "warn", detail: defaults.join("；") });
    } else {
      record({ id: "env-file", name: ".env 配置", group: "工程", status: "pass", detail: "关键变量齐全" });
    }
  }

  const nodeModules = existsSync(path.join(ROOT, "node_modules"));
  record({
    id: "deps-installed", name: "依赖安装", group: "工程",
    status: nodeModules ? "pass" : "fail",
    detail: nodeModules ? "node_modules 存在" : "未安装依赖",
    hint: nodeModules ? undefined : "运行 pnpm install",
  });

  const generated = existsSync(path.join(ROOT, "packages/database/src/generated/prisma"));
  record({
    id: "prisma-generated", name: "Prisma Client 生成", group: "工程",
    status: generated ? "pass" : "fail",
    detail: generated ? "generated/prisma 存在" : "尚未生成",
    hint: generated ? undefined : "运行 pnpm db:generate",
  });
}

// ---------- 2. 数据底座（PostgreSQL） ----------

/** 记录数据库里各业务表的行数，作为“有没有真实数据”的证据 */
const dataFootprint = [];

async function checkDatabase() {
  section("数据底座（PostgreSQL）");
  if (!config.databaseUrl) {
    record({ id: "db-connect", name: "数据库连接", group: "数据底座", status: "skip", detail: "未配置 DATABASE_URL", hint: "在 .env 配置 DATABASE_URL" });
    return;
  }

  let Client;
  try {
    const requirePg = createRequire(path.join(ROOT, "packages", "database", "package.json"));
    ({ Client } = requirePg("pg"));
  } catch {
    record({ id: "db-connect", name: "数据库连接", group: "数据底座", status: "skip", detail: "无法加载 pg 驱动", hint: "先运行 pnpm install" });
    return;
  }

  const client = new Client({ connectionString: config.databaseUrl, connectionTimeoutMillis: 3000, query_timeout: 5000 });
  const started = Date.now();
  try {
    await client.connect();
    record({ id: "db-connect", name: "数据库连接", group: "数据底座", status: "pass", detail: maskDbUrl(config.databaseUrl), ms: Date.now() - started });
  } catch (error) {
    record({
      id: "db-connect", name: "数据库连接", group: "数据底座", status: "fail",
      detail: shortError(error), ms: Date.now() - started,
      hint: "确认 PostgreSQL 已启动：docker compose -f infra/docker-compose.yml up -d",
    });
    return;
  }

  try {
    // 迁移同步情况
    const migrationsDir = path.join(ROOT, "packages", "database", "prisma", "migrations");
    const local = existsSync(migrationsDir)
      ? readdirSync(migrationsDir, { withFileTypes: true }).filter((item) => item.isDirectory() && !item.name.endsWith("_draft")).map((item) => item.name)
      : [];
    let appliedNames = [];
    try {
      const applied = await client.query('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY finished_at');
      appliedNames = applied.rows.map((row) => row.migration_name);
    } catch {
      record({ id: "db-migrations", name: "迁移已应用", group: "数据底座", status: "fail", detail: "_prisma_migrations 表不存在", hint: "运行 pnpm db:migrate" });
    }
    if (appliedNames.length > 0 || byId.get("db-migrations") === undefined) {
      const pending = local.filter((name) => !appliedNames.includes(name));
      record({
        id: "db-migrations", name: "迁移已应用", group: "数据底座",
        status: pending.length === 0 && appliedNames.length > 0 ? "pass" : "fail",
        detail: `本地 ${local.length} 个 / 已应用 ${appliedNames.length} 个${pending.length ? `，未应用：${pending.join("、")}` : ""}`,
        hint: pending.length ? "运行 pnpm db:migrate" : undefined,
      });
    }

    // 表结构齐全
    const tables = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    const present = new Set(tables.rows.map((row) => row.table_name));
    const missingTables = DB_TABLES.filter((name) => !present.has(name));
    record({
      id: "db-tables", name: "数据表齐全", group: "数据底座",
      status: missingTables.length === 0 ? "pass" : "fail",
      detail: missingTables.length === 0 ? `${DB_TABLES.length} 张业务表全部存在` : `缺少：${missingTables.join("、")}`,
      hint: missingTables.length ? "运行 pnpm db:migrate" : undefined,
    });

    // 种子数据
    if (missingTables.length === 0) {
      const seed = await client.query(
        `SELECT
           (SELECT COUNT(*)::int FROM "Role") AS roles,
           (SELECT COUNT(*)::int FROM "Permission") AS permissions,
           (SELECT COUNT(*)::int FROM "UserAccount") AS accounts,
           (SELECT COUNT(*)::int FROM "UserAccount" WHERE username = $1) AS probe_account`,
        [config.username],
      );
      const row = seed.rows[0];
      const seeded = row.roles >= 8 && row.permissions >= 20 && row.probe_account > 0;
      record({
        id: "db-seed", name: "种子数据", group: "数据底座",
        status: seeded ? "pass" : row.accounts > 0 ? "warn" : "fail",
        detail: `角色 ${row.roles}、权限 ${row.permissions}、账号 ${row.accounts}、探针账号(${config.username}) ${row.probe_account > 0 ? "存在" : "不存在"}`,
        hint: seeded ? undefined : "运行 pnpm db:seed，或用 --user/--pass 指定已有账号",
      });

      // 业务数据足迹
      const footprintTables = ["Organization", "Store", "Employee", "Product", "Sku", "Warehouse", "SerialItem", "InventoryMovement", "CatalogImportBatch", "AuditLog", "OutboxEvent"];
      const counts = await client.query(
        `SELECT ${footprintTables.map((name, index) => `(SELECT COUNT(*)::int FROM "${name}") AS c${index}`).join(", ")}`,
      );
      footprintTables.forEach((name, index) => {
        dataFootprint.push({ table: name, count: counts.rows[0][`c${index}`] });
      });
      const movements = dataFootprint.find((item) => item.table === "InventoryMovement")?.count ?? 0;
      const serials = dataFootprint.find((item) => item.table === "SerialItem")?.count ?? 0;
      record({
        id: "db-footprint", name: "业务数据足迹", group: "数据底座",
        status: "pass",
        detail: dataFootprint.map((item) => `${item.table} ${item.count}`).join("，"),
      });
      if (serials > 0 && movements === 0) {
        record({
          id: "db-movement-gap", name: "库存流水缺口", group: "数据底座", status: "warn",
          detail: `存在 ${serials} 条序列号但 0 条库存流水——序列号不是由业务单据驱动生成的（期初导入除外）`,
        });
      }
    }
  } finally {
    await client.end().catch(() => {});
  }
}

function maskDbUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.username}:***@${parsed.host}${parsed.pathname}`;
  } catch {
    return "postgresql://***";
  }
}

// ---------- 3. 服务在线与接口覆盖 ----------

/** OpenAPI 实际暴露的 method+path 集合（去掉 /api/v1 前缀、参数名归一化） */
let liveEndpoints = [];

function normalizePath(value) {
  return value.replace(/^\/api\/v1/, "").replace(/\{[^}]+\}/g, "{}");
}

async function checkServices() {
  section("服务在线");
  const health = await http(`${config.apiBase}/health`);
  record({
    id: "api-health", name: "API 健康检查", group: "服务",
    status: health.ok && health.json?.status === "ok" ? "pass" : "fail",
    detail: health.error ?? `HTTP ${health.status} ${health.json?.service ?? ""}`,
    ms: health.ms,
    hint: health.ok ? undefined : "启动后端：pnpm --filter @jincheng/api dev（或 pnpm dev）",
  });

  const swagger = await http(`${apiOrigin}/docs-json`);
  if (swagger.ok && swagger.json?.paths) {
    for (const [rawPath, methods] of Object.entries(swagger.json.paths)) {
      for (const method of Object.keys(methods)) {
        liveEndpoints.push({ method: method.toUpperCase(), path: normalizePath(rawPath), rawPath });
      }
    }
    record({ id: "api-openapi", name: "OpenAPI 契约可用", group: "服务", status: "pass", detail: `实际暴露 ${liveEndpoints.length} 个接口`, ms: swagger.ms });
  } else {
    record({ id: "api-openapi", name: "OpenAPI 契约可用", group: "服务", status: passed("api-health") ? "fail" : "skip", detail: swagger.error ?? `HTTP ${swagger.status}`, ms: swagger.ms, hint: "确认 Swagger 已在 main.ts 注册（/docs-json）" });
  }

  const webHome = await http(`${config.webBase}/`, { headers: { accept: "text/html" } });
  const redirected = webHome.status >= 300 && webHome.status < 400 && (webHome.headers.get("location") ?? "").includes("/login");
  record({
    id: "web-guard-redirect", name: "Web 未登录拦截", group: "Web",
    status: redirected ? "pass" : webHome.status === 200 ? "warn" : "fail",
    detail: webHome.error ?? (redirected ? `HTTP ${webHome.status} → ${webHome.headers.get("location")}` : `HTTP ${webHome.status}（预期未登录时跳转 /login）`),
    ms: webHome.ms,
    hint: webHome.status === 0 ? "启动前端：pnpm --filter @jincheng/web dev（或 pnpm dev）" : undefined,
  });

  const loginPage = await http(`${config.webBase}/login`, { headers: { accept: "text/html" } });
  record({
    id: "web-login-page", name: "Web 登录页", group: "Web",
    status: loginPage.status === 200 ? "pass" : "fail",
    detail: loginPage.error ?? `HTTP ${loginPage.status}`,
    ms: loginPage.ms,
    hint: loginPage.status === 200 ? undefined : "启动前端：pnpm dev",
  });
}

// ---------- 4. 端到端业务链路（API 直连） ----------

let token = null;
let firstOrganizationId = null;
let firstWarehouseId = null;

const bearer = () => ({ authorization: `Bearer ${token}` });

async function checkApiChains() {
  section("业务链路（API 直连）");
  if (!passed("api-health")) {
    record({ id: "e2e-login", name: "登录颁发令牌", group: "业务链路", status: "skip", detail: "API 未在线" });
    return;
  }

  // 登录
  const login = await http(`${config.apiBase}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: config.username, password: config.password }),
  });
  if ((login.status === 200 || login.status === 201) && login.json?.accessToken) {
    token = login.json.accessToken;
    const user = login.json.user ?? {};
    record({
      id: "e2e-login", name: "登录颁发令牌", group: "业务链路", status: "pass",
      detail: `${user.employeeName ?? config.username}（权限 ${user.permissions?.length ?? "?"} 项）`, ms: login.ms,
    });
  } else {
    record({
      id: "e2e-login", name: "登录颁发令牌", group: "业务链路", status: "fail",
      detail: login.error ?? `HTTP ${login.status} ${firstMessage(login.json)}`, ms: login.ms,
      hint: "默认探针账号是种子 admin；密码改过请用 --user/--pass 或 PROBE_USERNAME/PROBE_PASSWORD",
    });
  }

  // 会话
  if (token) {
    const me = await http(`${config.apiBase}/auth/me`, { headers: bearer() });
    record({
      id: "e2e-me", name: "会话校验 /auth/me", group: "业务链路",
      status: me.ok && me.json?.userId ? "pass" : "fail",
      detail: me.error ?? `HTTP ${me.status}`, ms: me.ms,
    });
  } else {
    record({ id: "e2e-me", name: "会话校验 /auth/me", group: "业务链路", status: "skip", detail: "依赖登录成功" });
  }

  // 权限护栏：无令牌必须 401
  const guard = await http(`${config.apiBase}/organizations`);
  record({
    id: "e2e-guard-401", name: "无令牌访问被拦截", group: "业务链路",
    status: guard.status === 401 ? "pass" : "fail",
    detail: `HTTP ${guard.status}（预期 401）`, ms: guard.ms,
    hint: guard.status === 401 ? undefined : "受保护接口未生效 JwtAuthGuard",
  });

  // 货品读接口当前未挂鉴权——作为安全提示项探测
  const anonymousCatalog = await http(`${config.apiBase}/catalog/products?pageSize=1`);
  record({
    id: "sec-catalog-anon", name: "货品接口匿名访问", group: "安全提示",
    status: anonymousCatalog.status === 401 || anonymousCatalog.status === 403 ? "pass" : "warn",
    detail: anonymousCatalog.status === 200 ? "匿名可读取商品数据（建议纳入 JwtAuthGuard + catalog:read）" : `HTTP ${anonymousCatalog.status}`,
    ms: anonymousCatalog.ms,
  });

  const authed = (name, id, url, verify) => runAuthedCheck(name, id, url, verify);

  await authed("组织列表", "e2e-org-list", `${config.apiBase}/organizations`, (json) => {
    firstOrganizationId = json?.items?.[0]?.id ?? null;
    return Array.isArray(json?.items) ? `组织 ${json.total} 个` : null;
  });
  if (firstOrganizationId) {
    await authed("门店列表", "e2e-org-stores", `${config.apiBase}/organizations/${firstOrganizationId}/stores`, (json) => (Array.isArray(json?.items) ? `门店 ${json.total} 个` : null));
    await authed("员工分页查询", "e2e-org-employees", `${config.apiBase}/organizations/${firstOrganizationId}/employees?pageSize=1`, (json) => (Array.isArray(json?.items) ? `员工 ${json.total} 人` : null));
  } else {
    record({ id: "e2e-org-stores", name: "门店列表", group: "业务链路", status: "skip", detail: "依赖组织数据" });
    record({ id: "e2e-org-employees", name: "员工分页查询", group: "业务链路", status: "skip", detail: "依赖组织数据" });
  }
  await authed("角色清单", "e2e-roles", `${config.apiBase}/roles`, (json) => (Array.isArray(json?.items) ? `角色 ${json.total} 个` : null));
  await authed("权限清单", "e2e-permissions", `${config.apiBase}/permissions`, (json) => (Array.isArray(json?.items) ? `权限 ${json.total} 项` : null));

  await authed("商品分页查询", "e2e-catalog-list", `${config.apiBase}/catalog/products?pageSize=1`, (json) => (Array.isArray(json?.items) ? `商品 ${json.total} 个` : null));
  await authed("导入批次查询", "e2e-catalog-imports", `${config.apiBase}/catalog/imports`, (json) => (Array.isArray(json) ? `批次 ${json.length} 个` : null));

  await authed("库存总览", "e2e-inventory-overview", `${config.apiBase}/inventory/overview`, (json) => {
    if (!Array.isArray(json?.warehouses)) return null;
    firstWarehouseId = json.warehouses.find((item) => item.serialCount > 0)?.id ?? json.warehouses[0]?.id ?? null;
    return `仓库 ${json.warehouses.length} 个，序列号 ${json.totalSerials}（公司 ${json.companySerials} / 个人 ${json.personalSerials}）`;
  });
  if (firstWarehouseId) {
    await authed("仓库序列号明细", "e2e-warehouse-serials", `${config.apiBase}/inventory/warehouses/${firstWarehouseId}/serials?pageSize=1`, (json) => (Array.isArray(json?.items) ? `该仓库序列号 ${json.total} 条` : null));
  } else {
    record({ id: "e2e-warehouse-serials", name: "仓库序列号明细", group: "业务链路", status: "skip", detail: "无仓库数据" });
  }

  // 全局查货(AC-F-004)与单机档案时间线(AC-F-005):关键字用 "0",IMEI 几乎必然命中
  let firstSerialId = null;
  await authed("全局查货搜索", "e2e-inventory-search", `${config.apiBase}/inventory/search?q=0&pageSize=1`, (json) => {
    if (!Array.isArray(json?.items)) return null;
    firstSerialId = json.items[0]?.id ?? null;
    return `匹配 ${json.total} 台（状态桶 ${json.byStatus?.length ?? 0} 个）`;
  });
  if (firstSerialId) {
    await authed("单机档案时间线", "e2e-serial-detail", `${config.apiBase}/inventory/serials/${firstSerialId}`, (json) => (json?.id ? `流水 ${Array.isArray(json.movements) ? json.movements.length : "?"} 条` : null));
  } else {
    record({ id: "e2e-serial-detail", name: "单机档案时间线", group: "业务链路", status: "skip", detail: "查货无结果，跳过" });
  }

  // 调拨(AC-F-008/009):列表 + 详情(含握手时间线);写链路见浏览器 UAT 或 --write 专项
  let firstTransferId = null;
  await authed("调拨单列表", "e2e-transfer-list", `${config.apiBase}/transfers?pageSize=1`, (json) => {
    if (!Array.isArray(json?.items)) return null;
    firstTransferId = json.items[0]?.id ?? null;
    return `调拨单 ${json.total} 张`;
  });
  if (firstTransferId) {
    await authed("调拨单详情", "e2e-transfer-detail", `${config.apiBase}/transfers/${firstTransferId}`, (json) => (json?.id ? `${json.code}(${json.status}),明细 ${Array.isArray(json.lines) ? json.lines.length : "?"} 台` : null));
  } else {
    record({ id: "e2e-transfer-detail", name: "调拨单详情", group: "业务链路", status: "skip", detail: "暂无调拨单,跳过" });
  }

  // 采购(docs/12 第 3 节):列表 + 详情(审批/付款/收货三维度)
  let firstPurchaseOrderId = null;
  await authed("采购单列表", "e2e-procurement-list", `${config.apiBase}/purchase-orders?pageSize=1`, (json) => {
    if (!Array.isArray(json?.items)) return null;
    firstPurchaseOrderId = json.items[0]?.id ?? null;
    return `采购单 ${json.total} 张`;
  });
  if (firstPurchaseOrderId) {
    await authed("采购单详情", "e2e-procurement-detail", `${config.apiBase}/purchase-orders/${firstPurchaseOrderId}`, (json) => (json?.id ? `${json.code}(审批 ${json.approvalStatus}/付款 ${json.paymentStatus}/收货 ${json.receiptStatus})` : null));
  } else {
    record({ id: "e2e-procurement-detail", name: "采购单详情", group: "业务链路", status: "skip", detail: "暂无采购单,跳过" });
  }

  // 盘点(docs/12 第 6 节):列表 + 详情(差异清单);盘点封存拦截见 TC-STK-004 实测
  let firstStocktakeId = null;
  await authed("盘点单列表", "e2e-stocktake-list", `${config.apiBase}/stocktakes?pageSize=1`, (json) => {
    if (!Array.isArray(json?.items)) return null;
    firstStocktakeId = json.items[0]?.id ?? null;
    return `盘点单 ${json.total} 张`;
  });
  if (firstStocktakeId) {
    await authed("盘点单详情", "e2e-stocktake-detail", `${config.apiBase}/stocktakes/${firstStocktakeId}`, (json) => (json?.id ? `${json.code}(${json.status}),差异 ${Array.isArray(json.differences) ? json.differences.length : "?"} 条` : null));
  } else {
    record({ id: "e2e-stocktake-detail", name: "盘点单详情", group: "业务链路", status: "skip", detail: "暂无盘点单,跳过" });
  }

  // 审计闭环：本次探测登录必须能在审计日志里查到
  if (token) {
    const audit = await http(`${config.apiBase}/audit/logs?action=auth.login&pageSize=5`, { headers: bearer() });
    const recent = audit.json?.items?.find((item) => Date.now() - new Date(item.createdAt).getTime() < 10 * 60 * 1000);
    record({
      id: "e2e-audit-login", name: "登录写入审计日志", group: "业务链路",
      status: audit.ok && recent ? "pass" : audit.ok ? "warn" : "fail",
      detail: audit.error ?? (recent ? `最近记录 ${recent.actorUsername ?? recent.resourceId} @ ${recent.createdAt}` : "10 分钟内无 auth.login 记录"),
      ms: audit.ms,
    });
    await authed("审计日志查询", "e2e-audit-query", `${config.apiBase}/audit/logs?pageSize=1`, (json) => (Array.isArray(json?.items) ? `审计记录共 ${json.total} 条` : null));
    await authed("Outbox 待发布事件", "e2e-outbox", `${config.apiBase}/audit/outbox/pending`, (json) => (typeof json?.pending === "number" ? `待发布 ${json.pending} 条` : null));
  } else {
    for (const [id, name] of [["e2e-audit-login", "登录写入审计日志"], ["e2e-audit-query", "审计日志查询"], ["e2e-outbox", "Outbox 待发布事件"]]) {
      record({ id, name, group: "业务链路", status: "skip", detail: "依赖登录成功" });
    }
  }
}

async function runAuthedCheck(name, id, url, verify) {
  if (!token) {
    return record({ id, name, group: "业务链路", status: "skip", detail: "依赖登录成功" });
  }
  const response = await http(url, { headers: bearer() });
  const summary = response.ok ? verify(response.json) : null;
  return record({
    id, name, group: "业务链路",
    status: response.ok && summary !== null ? "pass" : "fail",
    detail: response.error ?? (summary ?? `HTTP ${response.status} ${firstMessage(response.json)}`),
    ms: response.ms,
  });
}

function firstMessage(json) {
  const message = json?.message;
  if (Array.isArray(message)) return message[0] ?? "";
  return message ?? "";
}

// ---------- 5. Web BFF 全链路 ----------

async function checkWebChain() {
  section("Web 全链路（浏览器视角）");
  if (!passed("web-login-page")) {
    record({ id: "web-bff-login", name: "BFF 登录种 Cookie", group: "Web", status: "skip", detail: "Web 未在线" });
    return;
  }

  const login = await http(`${config.webBase}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: config.username, password: config.password }),
  });
  const setCookies = login.headers.getSetCookie?.() ?? [];
  const sessionCookie = setCookies.map((item) => item.split(";")[0]).find((item) => item.startsWith("erp_session="));
  record({
    id: "web-bff-login", name: "BFF 登录种 Cookie", group: "Web",
    status: login.ok && sessionCookie ? "pass" : "fail",
    detail: login.error ?? (sessionCookie ? "erp_session HttpOnly Cookie 已下发" : `HTTP ${login.status} ${firstMessage(login.json)}`),
    ms: login.ms,
    hint: login.status === 503 ? "Web 在线但 API 未启动（BFF 返回 503）" : undefined,
  });

  if (!sessionCookie) {
    for (const [id, name] of [["web-bff-me", "BFF 会话转发"], ["web-proxy-catalog", "BFF 货品代理"], ["web-proxy-inventory", "BFF 库存代理"], ["web-proxy-search", "BFF 查货代理"], ["web-proxy-transfers", "BFF 调拨代理"], ["web-proxy-procurement", "BFF 采购代理"], ["web-proxy-stocktakes", "BFF 盘点代理"], ["web-proxy-system", "BFF 审计代理"]]) {
      record({ id, name, group: "Web", status: "skip", detail: "依赖 BFF 登录成功" });
    }
    return;
  }

  const cookieHeader = { cookie: sessionCookie };
  const me = await http(`${config.webBase}/api/auth/me`, { headers: cookieHeader });
  record({
    id: "web-bff-me", name: "BFF 会话转发", group: "Web",
    status: me.ok && me.json?.userId ? "pass" : "fail",
    detail: me.error ?? `HTTP ${me.status}`, ms: me.ms,
  });

  const catalog = await http(`${config.webBase}/api/catalog/products?pageSize=1`, { headers: cookieHeader });
  record({
    id: "web-proxy-catalog", name: "BFF 货品代理", group: "Web",
    status: catalog.ok && Array.isArray(catalog.json?.items) ? "pass" : "fail",
    detail: catalog.error ?? `HTTP ${catalog.status}，商品 ${catalog.json?.total ?? "?"} 个`, ms: catalog.ms,
  });

  const inventory = await http(`${config.webBase}/api/inventory/overview`, { headers: cookieHeader });
  record({
    id: "web-proxy-inventory", name: "BFF 库存代理", group: "Web",
    status: inventory.ok && Array.isArray(inventory.json?.warehouses) ? "pass" : "fail",
    detail: inventory.error ?? `HTTP ${inventory.status}，仓库 ${inventory.json?.warehouses?.length ?? "?"} 个`, ms: inventory.ms,
  });

  const searchProxy = await http(`${config.webBase}/api/inventory/search?q=0&pageSize=1`, { headers: cookieHeader });
  record({
    id: "web-proxy-search", name: "BFF 查货代理", group: "Web",
    status: searchProxy.ok && Array.isArray(searchProxy.json?.items) ? "pass" : "fail",
    detail: searchProxy.error ?? `HTTP ${searchProxy.status}，匹配 ${searchProxy.json?.total ?? "?"} 台`, ms: searchProxy.ms,
  });

  const transferProxy = await http(`${config.webBase}/api/transfers?pageSize=1`, { headers: cookieHeader });
  record({
    id: "web-proxy-transfers", name: "BFF 调拨代理", group: "Web",
    status: transferProxy.ok && Array.isArray(transferProxy.json?.items) ? "pass" : "fail",
    detail: transferProxy.error ?? `HTTP ${transferProxy.status}，调拨单 ${transferProxy.json?.total ?? "?"} 张`, ms: transferProxy.ms,
  });

  // 采购 BFF(/api/procurement):采购单列表代理(/procurement/orders 页面数据链路)
  const procurementProxy = await http(`${config.webBase}/api/procurement/purchase-orders?pageSize=1`, { headers: cookieHeader });
  record({
    id: "web-proxy-procurement", name: "BFF 采购代理", group: "Web",
    status: procurementProxy.ok && Array.isArray(procurementProxy.json?.items) ? "pass" : "fail",
    detail: procurementProxy.error ?? `HTTP ${procurementProxy.status}，采购单 ${procurementProxy.json?.total ?? "?"} 张`, ms: procurementProxy.ms,
  });

  // 盘点 BFF(/api/stocktakes):盘点单列表代理(/inventory/stocktakes 页面数据链路)
  const stocktakeProxy = await http(`${config.webBase}/api/stocktakes?pageSize=1`, { headers: cookieHeader });
  record({
    id: "web-proxy-stocktakes", name: "BFF 盘点代理", group: "Web",
    status: stocktakeProxy.ok && Array.isArray(stocktakeProxy.json?.items) ? "pass" : "fail",
    detail: stocktakeProxy.error ?? `HTTP ${stocktakeProxy.status}，盘点单 ${stocktakeProxy.json?.total ?? "?"} 张`, ms: stocktakeProxy.ms,
  });

  // 系统设置 BFF(/api/system):审计日志代理(/system/health 页面数据链路)
  const systemProxy = await http(`${config.webBase}/api/system/audit/logs?pageSize=1`, { headers: cookieHeader });
  record({
    id: "web-proxy-system", name: "BFF 审计代理", group: "Web",
    status: systemProxy.ok && Array.isArray(systemProxy.json?.items) ? "pass" : "fail",
    detail: systemProxy.error ?? `HTTP ${systemProxy.status}，审计记录 ${systemProxy.json?.total ?? "?"} 条`, ms: systemProxy.ms,
  });
}

// ---------- 6. 写链路探测（可选 --write） ----------

async function checkWriteChain() {
  section("写链路（--write）");
  if (!config.write) {
    record({ id: "write-catalog", name: "货品写入链路", group: "写链路", status: "skip", detail: "默认只读；加 --write 启用（创建 PROBE- 探针商品后停用）" });
    return;
  }
  if (!token || !firstOrganizationId) {
    record({ id: "write-catalog", name: "货品写入链路", group: "写链路", status: "skip", detail: "依赖登录与组织数据" });
    return;
  }

  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const writeHeaders = {
    "content-type": "application/json",
    ...bearer(),
    ...(config.catalogWriteKey ? { "x-catalog-write-key": config.catalogWriteKey } : {}),
  };
  const created = await http(`${config.apiBase}/catalog/products`, {
    method: "POST",
    headers: writeHeaders,
    body: JSON.stringify({
      organizationId: firstOrganizationId,
      code: `PROBE-${stamp}`,
      brand: "体检探针",
      category: "体检探针",
      modelName: `打通度探针 ${stamp}`,
      skus: [{ code: `PROBE-${stamp}-S1`, name: "探针 SKU", serialManaged: false }],
    }),
  });
  const productId = created.json?.id;
  record({
    id: "write-catalog", name: "创建探针商品", group: "写链路",
    status: (created.status === 200 || created.status === 201) && productId ? "pass" : "fail",
    detail: created.error ?? `HTTP ${created.status} ${productId ?? firstMessage(created.json)}`,
    ms: created.ms,
    hint: created.status === 401 ? "需要 .env 中的 CATALOG_WRITE_KEY（生产环境必配）" : undefined,
  });
  if (!productId) return;

  const disabled = await http(`${config.apiBase}/catalog/products/${productId}`, {
    method: "PATCH",
    headers: writeHeaders,
    body: JSON.stringify({ status: "INACTIVE" }),
  });
  record({
    id: "write-catalog-disable", name: "探针商品置为停用", group: "写链路",
    status: disabled.ok ? "pass" : "fail",
    detail: disabled.error ?? `HTTP ${disabled.status}`, ms: disabled.ms,
  });

  const audit = await http(`${config.apiBase}/audit/logs?resource=Product&resourceId=${productId}`, { headers: bearer() });
  const hasCreate = audit.json?.items?.some((item) => item.action === "CATALOG_PRODUCT_CREATED");
  record({
    id: "write-audit", name: "写入落审计日志", group: "写链路",
    status: audit.ok && hasCreate ? "pass" : "fail",
    detail: audit.error ?? (hasCreate ? `审计记录 ${audit.json.total} 条（含创建动作）` : "未查到创建审计记录"),
    ms: audit.ms,
  });
}

// ---------- 7. 外围服务（已配置未接入代码） ----------

async function checkPeripherals() {
  section("外围服务（代码尚未使用，仅探测可达性）");
  if (config.redisUrl) {
    const result = await probeTcp(config.redisUrl, 6379);
    record({
      id: "peripheral-redis", name: "Redis", group: "外围",
      status: result.ok ? "pass" : "warn",
      detail: result.ok ? `${result.host}:${result.port} 可达（代码尚未接入队列/缓存）` : `${result.host}:${result.port} 不可达`,
      ms: result.ms,
    });
  }
  if (config.minioUrl) {
    const live = await http(`${config.minioUrl.replace(/\/$/, "")}/minio/health/live`);
    record({
      id: "peripheral-minio", name: "对象存储 MinIO", group: "外围",
      status: live.ok ? "pass" : "warn",
      detail: live.ok ? "健康检查通过（代码尚未接入附件上传）" : (live.error ?? `HTTP ${live.status}`),
      ms: live.ms,
    });
  }
}

function probeTcp(url, defaultPort) {
  let host = "localhost";
  let port = defaultPort;
  try {
    const parsed = new URL(url);
    host = parsed.hostname || host;
    port = Number(parsed.port) || defaultPort;
  } catch { /* 保持默认 */ }
  const started = Date.now();
  return new Promise((resolve) => {
    const socket = netConnect({ host, port, timeout: 2000 });
    const done = (ok) => {
      socket.destroy();
      resolve({ ok, host, port, ms: Date.now() - started });
    };
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

// ---------- 8. 计划 vs 实际（接口覆盖 + 模块看板） ----------

function computeCoverage() {
  const liveSet = new Set(liveEndpoints.map((item) => `${item.method} ${item.path}`));
  const apiOnline = liveEndpoints.length > 0;
  const planned = PLANNED_APIS.map((api) => ({
    ...api,
    implemented: apiOnline ? liveSet.has(`${api.method} ${normalizePath(api.path)}`) : null,
  }));
  const plannedSet = new Set(PLANNED_APIS.map((api) => `${api.method} ${normalizePath(api.path)}`));
  const undocumented = apiOnline
    ? liveEndpoints.filter((item) => !plannedSet.has(`${item.method} ${item.path}`)).map((item) => `${item.method} ${item.rawPath}`)
    : [];
  const future = FUTURE_MODULES.map((module) => ({
    ...module,
    implementedCount: apiOnline
      ? liveEndpoints.filter((item) => module.prefixes.some((prefix) => item.path.startsWith(prefix))).length
      : null,
  }));
  return { planned, future, undocumented, apiOnline };
}

const MODULE_RUNTIME_CHECKS = {
  auth: ["e2e-login", "e2e-me"],
  organization: ["e2e-org-list", "e2e-org-stores", "e2e-org-employees", "e2e-roles", "e2e-permissions"],
  catalog: ["e2e-catalog-list", "e2e-catalog-imports"],
  inventory: ["e2e-inventory-overview", "e2e-warehouse-serials", "e2e-inventory-search", "e2e-serial-detail"],
  transfer: ["e2e-transfer-list", "e2e-transfer-detail"],
  procurement: ["e2e-procurement-list", "e2e-procurement-detail"],
  stocktake: ["e2e-stocktake-list", "e2e-stocktake-detail"],
  audit: ["e2e-audit-login", "e2e-audit-query", "e2e-outbox"],
};

function computeModules(coverage) {
  return NAV_MODULES.map((module) => {
    const pageExists = existsSync(path.join(ROOT, module.pageFile));
    const runtimeIds = MODULE_RUNTIME_CHECKS[module.apiModule] ?? [];
    const runtime = runtimeIds.map((id) => byId.get(id)).filter(Boolean);
    const runtimePass = runtime.filter((check) => check.status === "pass").length;
    const runtimeFail = runtime.filter((check) => check.status === "fail").length;

    const plannedApis = coverage.planned.filter((api) => api.module === module.apiModule);
    const futureModule = coverage.future.find((item) => item.id === module.apiModule);
    const implementedCount = plannedApis.length > 0
      ? plannedApis.filter((api) => api.implemented).length
      : (futureModule?.implementedCount ?? 0);
    const plannedCount = plannedApis.length > 0 ? plannedApis.length : (futureModule?.plannedCount ?? 0);

    let verdict;
    if (futureModule?.blocked) verdict = "待业务确认";
    else if (module.apiModule === null) verdict = pageExists ? "页面可用" : "未开发";
    else if (plannedApis.length === 0 && (implementedCount ?? 0) === 0) verdict = "未开发";
    else if (runtimeFail > 0) verdict = "链路异常";
    else if (runtime.length > 0 && runtimePass === runtime.length && pageExists) verdict = "已打通";
    else if (runtimePass > 0) verdict = pageExists ? "部分打通" : "后端已通";
    else if (!coverage.apiOnline) verdict = "未探测";
    else verdict = "部分打通";

    return {
      ...module,
      pageExists,
      verdict,
      api: { implemented: implementedCount, planned: plannedCount },
      runtime: { pass: runtimePass, fail: runtimeFail, total: runtime.length },
      blocked: Boolean(futureModule?.blocked),
      blockedReason: futureModule?.blockedReason,
      phase: futureModule?.phase,
    };
  });
}

const CHAINS = [
  { id: "foundation", name: "数据底座", steps: ["db-connect", "db-migrations", "db-tables", "db-seed"] },
  { id: "auth", name: "登录认证", steps: ["api-health", "e2e-login", "e2e-me", "e2e-audit-login"] },
  { id: "rbac", name: "权限护栏", steps: ["e2e-guard-401", "e2e-org-list", "e2e-roles", "e2e-permissions"] },
  { id: "catalog", name: "货品链路", steps: ["e2e-catalog-list", "e2e-catalog-imports", "write-catalog", "write-audit"] },
  { id: "inventory", name: "库存链路", steps: ["e2e-inventory-overview", "e2e-warehouse-serials", "e2e-inventory-search", "e2e-serial-detail"] },
  { id: "transfer", name: "调拨链路", steps: ["e2e-transfer-list", "e2e-transfer-detail"] },
  { id: "procurement", name: "采购链路", steps: ["e2e-procurement-list", "e2e-procurement-detail"] },
  { id: "stocktake", name: "盘点链路", steps: ["e2e-stocktake-list", "e2e-stocktake-detail"] },
  { id: "web", name: "Web 端到端", steps: ["web-login-page", "web-guard-redirect", "web-bff-login", "web-bff-me", "web-proxy-catalog", "web-proxy-inventory", "web-proxy-search", "web-proxy-transfers", "web-proxy-procurement", "web-proxy-stocktakes", "web-proxy-system"] },
  { id: "audit", name: "审计与事件", steps: ["e2e-audit-query", "e2e-outbox"] },
];

function computeChains() {
  return CHAINS.map((chain) => ({
    ...chain,
    steps: chain.steps.map((id) => {
      const check = byId.get(id);
      return check
        ? { id, name: check.name, status: check.status, detail: check.detail, ms: check.ms }
        : { id, name: id, status: "skip", detail: "未执行" };
    }),
  }));
}

// ---------- 主流程 ----------

console.log(`\n锦程 ERP 打通度体检  ${new Date().toLocaleString("zh-CN", { hour12: false })}`);
console.log(paint("dim", `API ${config.apiBase} · Web ${config.webBase} · 探针账号 ${config.username}${config.write ? " · 写链路已启用" : ""}`));

await checkWorkspace();
await checkDatabase();
await checkServices();
await checkApiChains();
await checkWebChain();
await checkWriteChain();
await checkPeripherals();

const coverage = computeCoverage();
const modules = computeModules(coverage);
const chains = computeChains();

const summary = {
  pass: checks.filter((check) => check.status === "pass").length,
  fail: checks.filter((check) => check.status === "fail").length,
  warn: checks.filter((check) => check.status === "warn").length,
  skip: checks.filter((check) => check.status === "skip").length,
  total: checks.length,
  apiImplemented: coverage.planned.filter((api) => api.implemented).length,
  apiPlanned: coverage.planned.length,
  modulesReady: modules.filter((module) => module.verdict === "已打通").length,
  modulesPartial: modules.filter((module) => ["部分打通", "后端已通", "页面可用"].includes(module.verdict)).length,
  modulesBlocked: modules.filter((module) => module.verdict === "待业务确认").length,
  modulesMissing: modules.filter((module) => module.verdict === "未开发").length,
};

section("模块看板");
for (const module of modules) {
  const tone = module.verdict === "已打通" ? "pass" : module.verdict === "链路异常" ? "fail" : module.verdict === "待业务确认" ? "blocked" : module.verdict === "未开发" ? "skip" : "warn";
  const apiText = module.api.planned > 0 ? `接口 ${module.api.implemented ?? "?"}/${module.api.planned}` : "无接口计划";
  console.log(`  ${paint(tone, module.verdict.padEnd(5, "　"))} ${module.name.padEnd(6, "　")} ${paint("dim", `${apiText} · 页面${module.pageExists ? "已建" : "占位"}${module.blockedReason ? ` · ${module.blockedReason}` : ""}`)}`);
}

console.log(`\n合计：${paint("pass", `通过 ${summary.pass}`)} · ${paint("fail", `失败 ${summary.fail}`)} · ${paint("warn", `警示 ${summary.warn}`)} · ${paint("skip", `跳过 ${summary.skip}`)}`);
console.log(`接口落地：${summary.apiImplemented}/${summary.apiPlanned}（docs/10 已进入实现阶段的接口）`);
console.log(`模块：已打通 ${summary.modulesReady} · 部分 ${summary.modulesPartial} · 待业务确认 ${summary.modulesBlocked} · 未开发 ${summary.modulesMissing}`);

const result = {
  generatedAt: new Date().toISOString(),
  config: {
    apiBase: config.apiBase,
    webBase: config.webBase,
    database: config.databaseUrl ? maskDbUrl(config.databaseUrl) : null,
    probeUser: config.username,
    writeEnabled: config.write,
  },
  summary,
  chains,
  modules,
  coverage,
  dataFootprint,
  checks,
};

const jsonPath = path.join(ROOT, "progress-report.json");
writeFileSync(jsonPath, JSON.stringify(result, null, 2), "utf8");
console.log(`\nJSON 报告：${jsonPath}`);

if (config.html) {
  const htmlPath = path.join(ROOT, "progress-report.html");
  writeFileSync(htmlPath, renderHtml(result), "utf8");
  console.log(`HTML 看板：${htmlPath}（直接双击打开）`);
}

if (config.strict && summary.fail > 0) process.exit(1);
