/**
 * 钱账分离边界规则(TC-ORG-005):
 * 采购单据/审批(procurement:write)与付款执行(procurement:pay)
 * 不可由同一角色或同一账号兼有;ADMIN 技术兜底角色除外。
 */
import { describe, expect, it } from "vitest";
import {
  moneySeparationConflictMessage,
  permissionSetViolatesMoneySeparation,
} from "./role-boundaries.js";

describe("permissionSetViolatesMoneySeparation(自定义角色配权)", () => {
  it("同时勾选单据写入与付款执行 → 违反", () => {
    expect(
      permissionSetViolatesMoneySeparation([
        "procurement:read",
        "procurement:write",
        "procurement:pay",
      ]),
    ).toBe(true);
  });

  it("只有单据写入 → 允许", () => {
    expect(
      permissionSetViolatesMoneySeparation(["procurement:write", "finance:write"]),
    ).toBe(false);
  });

  it("只有付款执行 → 允许", () => {
    expect(
      permissionSetViolatesMoneySeparation(["procurement:pay", "finance:read"]),
    ).toBe(false);
  });

  it("与采购无关的权限集合 → 允许", () => {
    expect(permissionSetViolatesMoneySeparation(["catalog:read"])).toBe(false);
    expect(permissionSetViolatesMoneySeparation([])).toBe(false);
  });
});

describe("moneySeparationConflictMessage(账号角色组合)", () => {
  const finance = {
    code: "FINANCE",
    permissions: ["procurement:read", "procurement:write", "finance:write"],
  };
  const cashier = {
    code: "CASHIER",
    permissions: ["procurement:read", "procurement:pay", "finance:read"],
  };
  const admin = {
    code: "ADMIN",
    permissions: ["procurement:write", "procurement:pay", "role:write"],
  };

  it("财务 + 出纳同挂一个账号 → 拒绝并点名冲突角色", () => {
    const message = moneySeparationConflictMessage([finance, cashier]);
    expect(message).toContain("钱账分离");
    expect(message).toContain("FINANCE");
    expect(message).toContain("CASHIER");
  });

  it("单独财务或单独出纳 → 允许", () => {
    expect(moneySeparationConflictMessage([finance])).toBeNull();
    expect(moneySeparationConflictMessage([cashier])).toBeNull();
  });

  it("ADMIN 技术兜底角色持有全部权限码 → 不受限制", () => {
    expect(moneySeparationConflictMessage([admin])).toBeNull();
    expect(moneySeparationConflictMessage([admin, finance])).toBeNull();
  });

  it("单个自定义角色同时含两者 → 拒绝", () => {
    const custom = {
      code: "SUPER_BUYER",
      permissions: ["procurement:write", "procurement:pay"],
    };
    const message = moneySeparationConflictMessage([custom]);
    expect(message).toContain("SUPER_BUYER");
  });
});
