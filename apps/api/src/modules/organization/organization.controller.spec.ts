/**
 * 组织/角色接口鉴权装配回归测试(TC-AUTH-006):
 * - 类级必须启用 JwtAuthGuard;
 * - 角色读接口要求 role:read,角色写接口要求 role:write(仅管理员,内置角色保护在服务层);
 * - 账号写接口要求 account:write。
 */
import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { OrganizationController } from "./organization.controller.js";
import { JwtAuthGuard, PermissionsGuard } from "../auth/auth.guard.js";

const GUARDS_METADATA = "__guards__";

function classGuards(): unknown[] {
  return (
    (Reflect.getMetadata(GUARDS_METADATA, OrganizationController) as unknown[]) ??
    []
  );
}

function methodGuards(method: string): unknown[] {
  const handler = OrganizationController.prototype[
    method as keyof OrganizationController
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

const ROLE_READ_METHODS = ["listRoles", "listPermissions"];
const ROLE_WRITE_METHODS = ["createRole", "updateRole", "archiveRole", "restoreRole"];
const ACCOUNT_WRITE_METHODS = ["createAccount", "updateAccount"];

describe("OrganizationController 鉴权装配", () => {
  it("类级启用 JwtAuthGuard,所有接口要求登录", () => {
    expect(classGuards()).toContain(JwtAuthGuard);
  });

  it.each(ROLE_READ_METHODS)("角色读接口 %s 要求 role:read", (method) => {
    expect(permissionCodes(methodGuards(method))).toContain("role:read");
  });

  it.each(ROLE_WRITE_METHODS)("角色写接口 %s 要求 role:write", (method) => {
    expect(permissionCodes(methodGuards(method))).toContain("role:write");
  });

  it.each(ROLE_WRITE_METHODS)(
    "角色写接口 %s 不接受 role:read 越权",
    (method) => {
      expect(permissionCodes(methodGuards(method))).not.toContain("role:read");
    },
  );

  it.each(ACCOUNT_WRITE_METHODS)("账号写接口 %s 要求 account:write", (method) => {
    expect(permissionCodes(methodGuards(method))).toContain("account:write");
  });
});
