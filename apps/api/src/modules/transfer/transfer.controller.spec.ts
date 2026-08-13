/**
 * 调拨接口鉴权装配回归测试(TC-TRF-003):
 * - 类级必须启用 JwtAuthGuard(全部接口要求登录);
 * - 读接口要求 transfer:read,全部状态机命令要求 transfer:write。
 */
import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { TransferController } from "./transfer.controller.js";
import { JwtAuthGuard, PermissionsGuard } from "../auth/auth.guard.js";

const GUARDS_METADATA = "__guards__";

function classGuards(): unknown[] {
  return (
    (Reflect.getMetadata(GUARDS_METADATA, TransferController) as unknown[]) ??
    []
  );
}

function methodGuards(method: string): unknown[] {
  const handler = TransferController.prototype[
    method as keyof TransferController
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
  "submit",
  "approve",
  "reject",
  "lock",
  "unlock",
  "ship",
  "receive",
  "markExceptions",
  "complete",
  "cancel",
];

describe("TransferController 鉴权装配", () => {
  it("类级启用 JwtAuthGuard,所有接口要求登录", () => {
    expect(classGuards()).toContain(JwtAuthGuard);
  });

  it.each(READ_METHODS)("读接口 %s 要求 transfer:read", (method) => {
    expect(permissionCodes(methodGuards(method))).toContain("transfer:read");
  });

  it.each(WRITE_METHODS)("命令接口 %s 要求 transfer:write", (method) => {
    expect(permissionCodes(methodGuards(method))).toContain("transfer:write");
  });
});
