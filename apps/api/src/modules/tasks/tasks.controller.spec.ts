/**
 * 待办接口鉴权装配回归测试(TC-TASK-002):
 * 类级必须启用 JwtAuthGuard(登录即可访问,分组按权限在服务端过滤)。
 */
import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { TasksController } from "./tasks.controller.js";
import { JwtAuthGuard } from "../auth/auth.guard.js";

const GUARDS_METADATA = "__guards__";

describe("TasksController 鉴权装配", () => {
  it("类级启用 JwtAuthGuard,待办接口要求登录", () => {
    const guards =
      (Reflect.getMetadata(GUARDS_METADATA, TasksController) as unknown[]) ??
      [];
    expect(guards).toContain(JwtAuthGuard);
  });
});
