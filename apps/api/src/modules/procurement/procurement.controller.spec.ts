/**
 * 采购接口鉴权装配回归测试(TC-PUR-003):
 * - 类级必须启用 JwtAuthGuard(全部接口要求登录);
 * - 读接口要求 procurement:read,全部命令要求 procurement:write。
 */
import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { ProcurementController } from "./procurement.controller.js";
import { JwtAuthGuard, PermissionsGuard } from "../auth/auth.guard.js";

const GUARDS_METADATA = "__guards__";

function classGuards(): unknown[] {
  return (
    (Reflect.getMetadata(GUARDS_METADATA, ProcurementController) as unknown[]) ??
    []
  );
}

function methodGuards(method: string): unknown[] {
  const handler = ProcurementController.prototype[
    method as keyof ProcurementController
  ] as object;
  return (Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[]) ?? [];
}

function permissionCodes(guards: unknown[]): string[] {
  return guards
    .filter(
      (guard): guard is PermissionsGuard => guard instanceof PermissionsGuard,
    )
    .flatMap((guard) => (guard as unknown as { required: string[] }).required);
}

const READ_METHODS = ["listSuppliers", "listOrders", "detail"];
const WRITE_METHODS = [
  "createSupplier",
  "updateSupplier",
  "create",
  "submit",
  "approve",
  "reject",
  "cancel",
  "addReceipt",
  "complete",
];

describe("ProcurementController 鉴权装配", () => {
  it("类级启用 JwtAuthGuard,所有接口要求登录", () => {
    expect(classGuards()).toContain(JwtAuthGuard);
  });

  it.each(READ_METHODS)("读接口 %s 要求 procurement:read", (method) => {
    expect(permissionCodes(methodGuards(method))).toContain("procurement:read");
  });

  it.each(WRITE_METHODS)("命令接口 %s 要求 procurement:write", (method) => {
    expect(permissionCodes(methodGuards(method))).toContain(
      "procurement:write",
    );
  });

  it("付款接口 addPayment 要求 procurement:pay(钱账分离,2026-08-12 业务确认)", () => {
    const codes = permissionCodes(methodGuards("addPayment"));
    expect(codes).toContain("procurement:pay");
    expect(codes).not.toContain("procurement:write");
  });
});
