/**
 * 货品接口鉴权装配回归测试（对应 2026-08-11 安全整改）：
 * - 类级必须启用 JwtAuthGuard（全部接口要求登录）；
 * - 读接口要求 catalog:read，写接口要求 catalog:write 并保留 CatalogWriteGuard。
 *
 * 通过 Nest 的 @UseGuards 元数据做静态断言，防止后续改动悄悄移除鉴权。
 */
import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { CatalogController } from "./catalog.controller.js";
import { CatalogWriteGuard } from "./catalog-write.guard.js";
import { JwtAuthGuard, PermissionsGuard } from "../auth/auth.guard.js";

const GUARDS_METADATA = "__guards__";

function classGuards(): unknown[] {
  return (
    (Reflect.getMetadata(GUARDS_METADATA, CatalogController) as unknown[]) ?? []
  );
}

function methodGuards(method: string): unknown[] {
  const handler = CatalogController.prototype[
    method as keyof CatalogController
  ] as object;
  return (Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[]) ?? [];
}

function permissionCodes(guards: unknown[]): string[] {
  return guards
    .filter((guard): guard is PermissionsGuard => guard instanceof PermissionsGuard)
    .flatMap((guard) =>
      (guard as unknown as { required: string[] }).required,
    );
}

const READ_METHODS = ["listProducts", "listOrganizations", "listImports"];
const WRITE_METHODS = [
  "createProduct",
  "updateProduct",
  "addSku",
  "updateSku",
  "previewBytestarImport",
  "applyImport",
  "syncPricesFromFeed",
];

describe("CatalogController 鉴权装配", () => {
  it("类级启用 JwtAuthGuard，所有接口要求登录", () => {
    expect(classGuards()).toContain(JwtAuthGuard);
  });

  it.each(READ_METHODS)("读接口 %s 要求 catalog:read", (method) => {
    expect(permissionCodes(methodGuards(method))).toContain("catalog:read");
  });

  it.each(WRITE_METHODS)(
    "写接口 %s 要求 catalog:write 且保留写入密钥防线",
    (method) => {
      const guards = methodGuards(method);
      expect(permissionCodes(guards)).toContain("catalog:write");
      expect(guards).toContain(CatalogWriteGuard);
    },
  );
});
