/**
 * 客户接口鉴权装配回归测试(TC-CRM-001):
 * - 类级必须启用 JwtAuthGuard(全部接口要求登录);
 * - 读接口要求 customer:read,写接口要求 customer:write。
 */
import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { CrmController } from "./crm.controller.js";
import { JwtAuthGuard, PermissionsGuard } from "../auth/auth.guard.js";

const GUARDS_METADATA = "__guards__";

function classGuards(): unknown[] {
  return (
    (Reflect.getMetadata(GUARDS_METADATA, CrmController) as unknown[]) ?? []
  );
}

function methodGuards(method: string): unknown[] {
  const handler = CrmController.prototype[
    method as keyof CrmController
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

const READ_METHODS = ["list", "detail"];
const WRITE_METHODS = ["create", "update", "archive", "addFollowup"];

describe("CrmController 鉴权装配", () => {
  it("类级启用 JwtAuthGuard,所有接口要求登录", () => {
    expect(classGuards()).toContain(JwtAuthGuard);
  });

  it.each(READ_METHODS)("读接口 %s 要求 customer:read", (method) => {
    expect(permissionCodes(methodGuards(method))).toContain("customer:read");
  });

  it.each(WRITE_METHODS)("写接口 %s 要求 customer:write", (method) => {
    expect(permissionCodes(methodGuards(method))).toContain("customer:write");
  });
});
