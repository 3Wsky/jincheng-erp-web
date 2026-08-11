// 用 Chrome DevTools Protocol 验证库存驾驶舱页面
const CDP_PORT = 9222;
const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const profile = "F:/jincheng-erp-web/.tmp-chrome-profile";

import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

rmSync(profile, { recursive: true, force: true });
mkdirSync(profile, { recursive: true });

const proc = spawn(chrome, [
  "--headless=new",
  "--disable-gpu",
  "--no-sandbox",
  "--remote-debugging-port=" + CDP_PORT,
  "--user-data-dir=" + profile,
  "--window-size=1600,1000",
  "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitPort() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (r.ok) return;
    } catch (e) { /* retry */ }
    await sleep(500);
  }
  throw new Error("CDP port not ready");
}

let msgId = 0;
const pending = new Map();
const events = [];
let ws;

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function main() {
  await waitPort();
  const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
  const page = list.find((t) => t.type === "page");
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method === "Runtime.consoleAPICalled") {
      const text = msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ");
      events.push("[console." + msg.params.type + "] " + text);
    } else if (msg.method === "Runtime.exceptionThrown") {
      events.push("[EXCEPTION] " + (msg.params.exceptionDetails?.text ?? "") + " " + (msg.params.exceptionDetails?.exception?.description ?? ""));
    } else if (msg.method === "Log.entryAdded") {
      const e = msg.params.entry;
      if (e.level === "error") events.push("[log.error] " + e.text);
    }
  };

  await send("Runtime.enable");
  await send("Log.enable");
  await send("Page.enable");
  await send("Network.enable");

  // 1. 打开登录页
  await send("Page.navigate", { url: "http://localhost:3000/login" });
  await sleep(4000);

  // 2. 填写登录表单并提交
  const loginJs = `(() => {
    const inputs = document.querySelectorAll(".login-form input");
    let u, p;
    inputs.forEach((i) => { if (i.type === "text" || !i.type || i.type === "email") u = i; else if (i.type === "password") p = i; });
    if (!u || !p) return "no-inputs:" + inputs.length;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(u, "admin"); u.dispatchEvent(new Event("input", { bubbles: true }));
    setter.call(p, "JinCheng@2026"); p.dispatchEvent(new Event("input", { bubbles: true }));
    const btn = document.querySelector(".login-submit");
    if (btn) btn.click();
    return "submitted";
  })()`;
  const loginResult = await send("Runtime.evaluate", { expression: loginJs, returnByValue: true });
  console.log("登录提交:", loginResult.result?.value);
  await sleep(5000);

  // 3. 访问库存页
  await send("Page.navigate", { url: "http://localhost:3000/inventory" });
  await sleep(8000);

  // 4. 检查关键元素
  const checkJs = `(() => {
    const result = {};
    result.url = location.pathname;
    result.metricCards = document.querySelectorAll(".inventory-metric-card").length;
    result.treemap = !!document.querySelector(".inventory-treemap canvas");
    result.segmented = document.querySelectorAll(".inventory-segmented button").length;
    result.search = !!document.querySelector(".inventory-search input");
    result.legend = document.querySelectorAll(".inventory-legend span").length;
    result.distCard = !!document.querySelector(".inventory-distribution-card");
    result.loading = !!document.querySelector(".inventory-loading");
    result.bodyText = document.body.innerText.slice(0, 120).replace(/\\n/g, " | ");
    return JSON.stringify(result);
  })()`;
  const check = await send("Runtime.evaluate", { expression: checkJs, returnByValue: true });
  console.log("页面检查:", check.result?.value);

  // 5. 测试筛选按钮(个人分销)
  const filterJs = `(() => {
    const btns = document.querySelectorAll(".inventory-segmented button");
    if (btns[2]) btns[2].click();
    return "clicked-personal";
  })()`;
  await send("Runtime.evaluate", { expression: filterJs, returnByValue: true });
  await sleep(2500);
  const afterFilter = await send("Runtime.evaluate", {
    expression: `JSON.stringify({treemap: !!document.querySelector(".inventory-treemap canvas"), active: document.querySelector(".inventory-segmented button.active")?.innerText})`,
    returnByValue: true,
  });
  console.log("筛选后:", afterFilter.result?.value);

  // 6. 测试搜索
  const searchJs = `(() => {
    const input = document.querySelector(".inventory-search input");
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, "总库");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return "searched";
  })()`;
  await send("Runtime.evaluate", { expression: searchJs, returnByValue: true });
  await sleep(2500);
  const afterSearch = await send("Runtime.evaluate", {
    expression: `JSON.stringify({treemap: !!document.querySelector(".inventory-treemap canvas")})`,
    returnByValue: true,
  });
  console.log("搜索后:", afterSearch.result?.value);

  // 7. 恢复全部筛选,截图
  const resetJs = `(() => {
    const btns = document.querySelectorAll(".inventory-segmented button");
    if (btns[0]) btns[0].click();
    const input = document.querySelector(".inventory-search input");
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, "");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return "reset";
  })()`;
  await send("Runtime.evaluate", { expression: resetJs, returnByValue: true });
  await sleep(2500);

  const shot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync("F:/jincheng-erp-web/scripts/grasp/inventory-shot.png", Buffer.from(shot.data, "base64"));
  console.log("截图已保存");

  await sleep(800);
  console.log("=== Console / 异常 ===");
  if (events.length === 0) console.log("(无 console 错误)");
  events.forEach((e) => console.log(e));

  proc.kill();
  process.exit(0);
}

main().catch((e) => { console.error("FAIL:", e.message); proc.kill(); process.exit(1); });
