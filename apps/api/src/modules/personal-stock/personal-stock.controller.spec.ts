/**
 * 个人库存接口鉴权装配回归测试(TC-PST-002):
 * 类级 JwtAuthGuard;全部接口要求 inventory:read(确认细规则在服务层)。
 */
import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { JwtAuthGuard, PermissionsGuard } from "../auth/auth.guard.js";
import { PersonalStockController } from "./personal-stock.controller.js";

const GUARDS_METADATA = "__guards__";

function classGuards(): unknown[] {
  return (
    (Reflect.getMetadata(GUARDS_METADATA, PersonalStockController) as unknown[]) ??
    []
  );
}

function methodGuards(method: string): unknown[] {
  const handler = PersonalStockController.prototype[
    method as keyof PersonalStockController
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

const METHODS = [
  "mine",
  "list",
  "create",
  "detail",
  "submit",
  "confirm",
  "cancel",
];

describe("PersonalStockController 鉴权装配", () => {
  it("类级启用 JwtAuthGuard,所有接口要求登录", () => {
    expect(classGuards()).toContain(JwtAuthGuard);
  });

  it.each(METHODS)("接口 %s 要求 inventory:read", (method) => {
    expect(permissionCodes(methodGuards(method))).toContain("inventory:read");
  });
});
