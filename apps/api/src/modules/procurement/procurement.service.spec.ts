/**
 * 采购状态机纯函数单元测试(TC-PUR-002):
 * - aggregatePaymentStatus:付款维度三态边界(0/部分/刚好/超过);
 * - aggregateReceiptStatus:收货维度聚合(未收/部分/全收);
 * - generatePurchaseCode / generateReceiptCode:单号格式。
 */
import { describe, expect, it } from "vitest";
import {
  aggregatePaymentStatus,
  aggregateReceiptStatus,
  generatePurchaseCode,
  generateReceiptCode,
} from "./procurement.service.js";

describe("aggregatePaymentStatus 付款维度聚合", () => {
  it("已付 0 → UNPAID", () => {
    expect(aggregatePaymentStatus("0", "1000")).toBe("UNPAID");
  });

  it("部分付款 → PARTIALLY_PAID", () => {
    expect(aggregatePaymentStatus("500.50", "1000")).toBe("PARTIALLY_PAID");
  });

  it("刚好付清 → PAID", () => {
    expect(aggregatePaymentStatus("1000.00", "1000")).toBe("PAID");
  });

  it("超过总额 → PAID(超付在命令层已拒绝,聚合函数按已付覆盖判定)", () => {
    expect(aggregatePaymentStatus("1200", "1000")).toBe("PAID");
  });

  it("小数精度边界:999.99 < 1000 → PARTIALLY_PAID", () => {
    expect(aggregatePaymentStatus("999.99", "1000")).toBe("PARTIALLY_PAID");
  });
});

describe("aggregateReceiptStatus 收货维度聚合", () => {
  it("全部行未收 → NOT_RECEIVED", () => {
    expect(
      aggregateReceiptStatus([
        { quantity: 2, receivedQuantity: 0 },
        { quantity: 3, receivedQuantity: 0 },
      ]),
    ).toBe("NOT_RECEIVED");
  });

  it("部分行收货 → PARTIALLY_RECEIVED", () => {
    expect(
      aggregateReceiptStatus([
        { quantity: 2, receivedQuantity: 2 },
        { quantity: 3, receivedQuantity: 0 },
      ]),
    ).toBe("PARTIALLY_RECEIVED");
  });

  it("行内部分收货 → PARTIALLY_RECEIVED", () => {
    expect(
      aggregateReceiptStatus([{ quantity: 5, receivedQuantity: 3 }]),
    ).toBe("PARTIALLY_RECEIVED");
  });

  it("全部行收满 → RECEIVED", () => {
    expect(
      aggregateReceiptStatus([
        { quantity: 2, receivedQuantity: 2 },
        { quantity: 3, receivedQuantity: 3 },
      ]),
    ).toBe("RECEIVED");
  });

  it("空明细 → NOT_RECEIVED(防御空数组 every 恒真)", () => {
    expect(aggregateReceiptStatus([])).toBe("NOT_RECEIVED");
  });
});

describe("采购单号与收货批次号生成", () => {
  it("采购单号格式为 PUR-YYYYMMDD-4位十六进制", () => {
    const code = generatePurchaseCode(new Date("2026-08-12T10:00:00+08:00"));
    expect(code).toMatch(/^PUR-20260812-[0-9A-F]{4}$/);
  });

  it("收货批次号格式为 RCP-YYYYMMDD-4位十六进制", () => {
    const code = generateReceiptCode(new Date("2026-08-12T10:00:00+08:00"));
    expect(code).toMatch(/^RCP-20260812-[0-9A-F]{4}$/);
  });

  it("连续生成的单号大概率不同(随机后缀)", () => {
    const codes = new Set(
      Array.from({ length: 20 }, () => generatePurchaseCode()),
    );
    expect(codes.size).toBeGreaterThan(1);
  });
});
