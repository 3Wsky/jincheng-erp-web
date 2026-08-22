/**
 * 个人库存范围与单号纯函数单元测试(TC-PST-001)。
 */
import { describe, expect, it } from "vitest";
import {
  generatePersonalStockCode,
  resolvePersonalStockScope,
} from "./personal-stock.service.js";

function user(overrides: {
  roles?: Array<{ id: string; code: string; name: string; dataScope: string }>;
  permissions?: string[];
  storeId?: string | null;
}) {
  return {
    userId: "u1",
    username: "tester",
    employeeId: "e1",
    organizationId: "o1",
    employeeNo: "E001",
    employeeName: "测试",
    storeId: overrides.storeId ?? null,
    isFrozen: false,
    roles: overrides.roles ?? [
      { id: "r1", code: "SALES", name: "销售", dataScope: "SELF" },
    ],
    permissions: overrides.permissions ?? ["inventory:read"],
    tokenId: "t1",
  };
}

describe("resolvePersonalStockScope 可见范围", () => {
  it("管理员/老板/组织范围 → ORGANIZATION", () => {
    expect(
      resolvePersonalStockScope(
        user({
          roles: [
            { id: "r", code: "ADMIN", name: "管理员", dataScope: "ORGANIZATION" },
          ],
        }),
      ),
    ).toBe("ORGANIZATION");
    expect(
      resolvePersonalStockScope(
        user({
          roles: [
            { id: "r", code: "BOSS", name: "老板", dataScope: "ORGANIZATION" },
          ],
        }),
      ),
    ).toBe("ORGANIZATION");
    expect(
      resolvePersonalStockScope(
        user({
          roles: [
            { id: "r", code: "WAREHOUSE", name: "库管", dataScope: "ORGANIZATION" },
          ],
        }),
      ),
    ).toBe("ORGANIZATION");
  });

  it("店长或门店范围 → STORE", () => {
    expect(
      resolvePersonalStockScope(
        user({
          roles: [
            {
              id: "r",
              code: "STORE_MANAGER",
              name: "店长",
              dataScope: "STORE",
            },
          ],
          storeId: "s1",
        }),
      ),
    ).toBe("STORE");
    expect(
      resolvePersonalStockScope(
        user({
          roles: [
            { id: "r", code: "SALES", name: "销售", dataScope: "STORE" },
          ],
          storeId: "s1",
        }),
      ),
    ).toBe("STORE");
  });

  it("销售本人范围 → SELF", () => {
    expect(resolvePersonalStockScope(user({}))).toBe("SELF");
  });
});

describe("generatePersonalStockCode 单号生成", () => {
  it("格式为 PST-YYYYMMDD-4位十六进制", () => {
    const code = generatePersonalStockCode(
      new Date("2026-08-16T10:00:00+08:00"),
    );
    expect(code).toMatch(/^PST-20260816-[0-9A-F]{4}$/);
  });

  it("连续生成的单号大概率不同", () => {
    const codes = new Set(
      Array.from({ length: 20 }, () => generatePersonalStockCode()),
    );
    expect(codes.size).toBeGreaterThan(1);
  });
});
