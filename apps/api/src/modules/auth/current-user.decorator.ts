import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AuthenticatedRequest } from "./auth.types.js";

/**
 * 从请求上下文读取当前登录用户信息。
 * 用法：@CurrentUser() user: AuthenticatedRequest["user"]
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();
    return request.user;
  },
);
