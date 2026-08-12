/**
 * 盘点接口鉴权装配回归测试(TC-STK-003):
 * - 类级必须启用 JwtAuthGuard(全部接口要求登录);
 * - 读接口要求 inventory:read,全部命令要求 inventory:write。
 */
import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { StocktakeController } from "./stocktake.controller.js";
import { JwtAuthGuard, PermissionsGuard } from "../auth/auth.guard.js";

const GUARDS_METADATA = "__guards__";

function classGuards(): unknown[] {
  return (
    (Reflect.getMetadata(GUARDS_METADATA, StocktakeController) as unknown[]) ??
    []
  );
}

function methodGuards(method: string): unknown[] {
  const handler = StocktakeController.prototype[
    method as keyof StocktakeController
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
const WRITE_METHODS = [
  "create",
  "start",
  "scan",
  "submit",
  "approve",
  "reject",
  "post",
  "cancel",
];

describe("StocktakeController 鉴权装配", () => {
  it("类级启用 JwtAuthGuard,所有接口要求登录", () => {
    expect(classGuards()).toContain(JwtAuthGuard);
  });

  it.each(READ_METHODS)("读接口 %s 要求 inventory:read", (method) => {
    expect(permissionCodes(methodGuards(method))).toContain("inventory:read");
  });

  it.each(WRITE_METHODS)("命令接口 %s 要求 inventory:write", (method) => {
    expect(permissionCodes(methodGuards(method))).toContain("inventory:write");
  });
});
