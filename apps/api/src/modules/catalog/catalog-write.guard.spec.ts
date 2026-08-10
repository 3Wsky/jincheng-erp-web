import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import type { ExecutionContext } from "@nestjs/common";
import { CatalogWriteGuard } from "./catalog-write.guard.js";

function contextWithKey(value?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { "x-catalog-write-key": value } }),
    }),
  } as unknown as ExecutionContext;
}

describe("CatalogWriteGuard", () => {
  it("开发环境未配置密钥时允许本机开发", () => {
    const guard = new CatalogWriteGuard(
      new ConfigService({ NODE_ENV: "development" }),
    );
    expect(guard.canActivate(contextWithKey())).toBe(true);
  });

  it("生产环境要求恒定时间比较的写入密钥", () => {
    const guard = new CatalogWriteGuard(
      new ConfigService({
        NODE_ENV: "production",
        CATALOG_WRITE_KEY: "safe-key",
      }),
    );
    expect(() => guard.canActivate(contextWithKey("wrong-key"))).toThrow(
      /无效/,
    );
    expect(guard.canActivate(contextWithKey("safe-key"))).toBe(true);
  });
});
