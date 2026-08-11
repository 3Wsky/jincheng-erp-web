// 验证上下分区 Treemap:公司在上、个人在下,潘国杰售后归个人
const CDP_PORT = 9224;
const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const profile = "F:/jincheng-erp-web/.tmp-chrome-profile-3";

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
  await sleep(9000);

  // 检查两个分区
  const checkJs = `(() => {
    const sections = document.querySelectorAll(".treemap-section");
    const result = { sectionCount: sections.length };
    result.company = (() => {
      const s = document.querySelector(".treemap-section.company");
      if (!s) return null;
      return {
        title: s.querySelector(".treemap-section-title")?.innerText,
        count: s.querySelector(".treemap-section-count")?.innerText,
        canvas: !!s.querySelector("canvas"),
        visible: s.style.display !== "none",
      };
    })();
    result.personal = (() => {
      const s = document.querySelector(".treemap-section.personal");
      if (!s) return null;
      return {
        title: s.querySelector(".treemap-section-title")?.innerText,
        count: s.querySelector(".treemap-section-count")?.innerText,
        canvas: !!s.querySelector("canvas"),
        visible: s.style.display !== "none",
      };
    })();
    // 公司区在个人区上方
    const c = document.querySelector(".treemap-section.company");
    const p = document.querySelector(".treemap-section.personal");
    if (c && p) result.companyAbove = c.getBoundingClientRect().top < p.getBoundingClientRect().top;
    return JSON.stringify(result);
  })()`;
  const check = await send("Runtime.evaluate", { expression: checkJs, returnByValue: true });
  console.log("上下分区:", check.result?.value);

  // 筛选:公司门店
  const filterCompany = `(() => {
    const btns = document.querySelectorAll(".inventory-segmented button");
    btns[1]?.click(); return "clicked";
  })()`;
  await send("Runtime.evaluate", { expression: filterCompany, returnByValue: true });
  await sleep(1500);
  const afterCompany = await send("Runtime.evaluate", {
    expression: `JSON.stringify({company: document.querySelector(".treemap-section.company").style.display, personal: document.querySelector(".treemap-section.personal").style.display})`,
    returnByValue: true,
  });
  console.log("筛选[公司门店]:", afterCompany.result?.value);

  // 筛选:个人分销
  const filterPersonal = `(() => {
    const btns = document.querySelectorAll(".inventory-segmented button");
    btns[2]?.click(); return "clicked";
  })()`;
  await send("Runtime.evaluate", { expression: filterPersonal, returnByValue: true });
  await sleep(1500);
  const afterPersonal = await send("Runtime.evaluate", {
    expression: `JSON.stringify({company: document.querySelector(".treemap-section.company").style.display, personal: document.querySelector(".treemap-section.personal").style.display})`,
    returnByValue: true,
  });
  console.log("筛选[个人分销]:", afterPersonal.result?.value);

  // 切回全部
  const filterAll = `(() => {
    const btns = document.querySelectorAll(".inventory-segmented button");
    btns[0]?.click(); return "clicked";
  })()`;
  await send("Runtime.evaluate", { expression: filterAll, returnByValue: true });
  await sleep(1500);

  // 截图
  const shot = await send("Page.captureScreenshot", { format: "png" });
  const { writeFileSync } = await import("node:fs");
  writeFileSync("F:/jincheng-erp-web/scripts/grasp/inventory-shot-2.png", Buffer.from(shot.data, "base64"));
  console.log("截图已保存");

  await sleep(500);
  console.log("=== Console / 异常 ===");
  if (events.length === 0) console.log("(无 console 错误)");
  events.forEach((e) => console.log(e));

  proc.kill();
  process.exit(0);
}

main().catch((e) => { console.error("FAIL:", e.message); proc.kill(); process.exit(1); });
