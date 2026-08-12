/**
 * 调拨状态机纯函数单元测试(TC-TRF-002):
 * - aggregateReceivingStatus:接收/差异后的主单聚合判定;
 * - generateTransferCode:单号格式。
 */
import { describe, expect, it } from "vitest";
import {
  aggregateReceivingStatus,
  generateTransferCode,
} from "./transfer.service.js";

describe("aggregateReceivingStatus 主单聚合判定", () => {
  it("全部在途、无已处理行 → 维持 IN_TRANSIT", () => {
    expect(
      aggregateReceivingStatus({ shipped: 5, received: 0, exception: 0 }),
    ).toBe("IN_TRANSIT");
  });

  it("部分接收、仍有在途 → PARTIALLY_RECEIVED", () => {
    expect(
      aggregateReceivingStatus({ shipped: 3, received: 2, exception: 0 }),
    ).toBe("PARTIALLY_RECEIVED");
  });

  it("部分差异、仍有在途 → PARTIALLY_RECEIVED", () => {
    expect(
      aggregateReceivingStatus({ shipped: 4, received: 0, exception: 1 }),
    ).toBe("PARTIALLY_RECEIVED");
  });

  it("全部接收、无差异 → RECEIVED", () => {
    expect(
      aggregateReceivingStatus({ shipped: 0, received: 5, exception: 0 }),
    ).toBe("RECEIVED");
  });

  it("在途清零且存在差异 → EXCEPTION(差异确认)", () => {
    expect(
      aggregateReceivingStatus({ shipped: 0, received: 4, exception: 1 }),
    ).toBe("EXCEPTION");
  });

  it("全部差异 → EXCEPTION", () => {
    expect(
      aggregateReceivingStatus({ shipped: 0, received: 0, exception: 5 }),
    ).toBe("EXCEPTION");
  });
});

describe("generateTransferCode 单号生成", () => {
  it("格式为 TRF-YYYYMMDD-4位十六进制", () => {
    const code = generateTransferCode(new Date("2026-08-12T10:00:00+08:00"));
    expect(code).toMatch(/^TRF-20260812-[0-9A-F]{4}$/);
  });

  it("连续生成的单号大概率不同(随机后缀)", () => {
    const codes = new Set(
      Array.from({ length: 20 }, () => generateTransferCode()),
    );
    expect(codes.size).toBeGreaterThan(1);
  });
});
