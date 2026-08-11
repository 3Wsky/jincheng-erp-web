// 验证刷新按钮:点击后图表不消失
const CDP_PORT = 9223;
const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const profile = "F:/jincheng-erp-web/.tmp-chrome-profile-2";

import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";

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
      events.push("[console." + msg.params.type + "] " + msg.params.args.map((a) => a.value ?? a.description ?? "").join(" "));
    } else if (msg.method === "Runtime.exceptionThrown") {
      events.push("[EXCEPTION] " + (msg.params.exceptionDetails?.text ?? "") + " " + (msg.params.exceptionDetails?.exception?.description ?? ""));
    }
  };

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Network.enable");

  await send("Page.navigate", { url: "http://localhost:3000/login" });
  await sleep(4000);
  const loginJs = `(() => {
    const inputs = document.querySelectorAll(".login-form input");
    let u, p;
    inputs.forEach((i) => { if (i.type === "password") p = i; else u = i; });
    if (!u || !p) return "no-inputs";
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(u, "admin"); u.dispatchEvent(new Event("input", { bubbles: true }));
    setter.call(p, "JinCheng@2026"); p.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector(".login-submit")?.click();
    return "submitted";
  })()`;
  await send("Runtime.evaluate", { expression: loginJs, returnByValue: true });
  await sleep(5000);

  await send("Page.navigate", { url: "http://localhost:3000/inventory" });
  await sleep(8000);

  const stateJs = `(() => ({
    treemap: !!document.querySelector(".inventory-treemap canvas"),
    loading: !!document.querySelector(".inventory-loading"),
    metricCards: document.querySelectorAll(".inventory-metric-card").length,
  }))()`;
  const before = await send("Runtime.evaluate", { expression: `JSON.stringify(${stateJs})`, returnByValue: true });
  console.log("刷新前:", before.result?.value);

  // 点击刷新按钮
  const clickJs = `(() => {
    const btns = [...document.querySelectorAll(".inventory-card-actions button")];
    const refresh = btns.find((b) => b.innerText.includes("刷新"));
    if (!refresh) return "no-refresh-btn";
    refresh.click();
    return "clicked";
  })()`;
  const clicked = await send("Runtime.evaluate", { expression: clickJs, returnByValue: true });
  console.log("点击刷新:", clicked.result?.value);

  // 刷新中(loading 为 true 但页面应保留)
  await sleep(500);
  const during = await send("Runtime.evaluate", { expression: `JSON.stringify(${stateJs})`, returnByValue: true });
  console.log("刷新中(500ms):", during.result?.value);

  // 刷新完成
  await sleep(4000);
  const after = await send("Runtime.evaluate", { expression: `JSON.stringify(${stateJs})`, returnByValue: true });
  console.log("刷新完成:", after.result?.value);

  await sleep(500);
  console.log("=== Console / 异常 ===");
  if (events.length === 0) console.log("(无 console 错误)");
  events.forEach((e) => console.log(e));

  proc.kill();
  process.exit(0);
}

main().catch((e) => { console.error("FAIL:", e.message); proc.kill(); process.exit(1); });
