/**
 * 库存接口鉴权装配回归测试(TC-INV-005):
 * - 类级必须启用 JwtAuthGuard(全部接口要求登录);
 * - 所有读接口(总览/全局查货/单机档案/仓库明细)要求 inventory:read。
 *
 * 通过 Nest 的 @UseGuards 元数据做静态断言,防止后续改动悄悄移除鉴权。
 */
import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { InventoryController } from "./inventory.controller.js";
import { JwtAuthGuard, PermissionsGuard } from "../auth/auth.guard.js";

const GUARDS_METADATA = "__guards__";

function classGuards(): unknown[] {
  return (
    (Reflect.getMetadata(GUARDS_METADATA, InventoryController) as unknown[]) ??
    []
  );
}

function methodGuards(method: string): unknown[] {
  const handler = InventoryController.prototype[
    method as keyof InventoryController
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

const READ_METHODS = [
  "overview",
  "search",
  "searchSummary",
  "serialDetail",
  "warehouseSerials",
];

describe("InventoryController 鉴权装配", () => {
  it("类级启用 JwtAuthGuard,所有接口要求登录", () => {
    expect(classGuards()).toContain(JwtAuthGuard);
  });

  it.each(READ_METHODS)("读接口 %s 要求 inventory:read", (method) => {
    expect(permissionCodes(methodGuards(method))).toContain("inventory:read");
  });
});
