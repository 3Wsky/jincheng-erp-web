import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { verifyJwt } from "@jincheng/database";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../../database/database.service.js";
import type { AuthenticatedRequest } from "./auth.types.js";

/**
 * JWT 认证守卫：校验 Bearer Token，并从数据库加载账号、员工、角色与权限。
 * 每次请求都会检查账号冻结状态，确保冻结立即生效。
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest & { headers: Record<string, string | string[] | undefined> }>();
    const rawRequestId = request.headers["x-request-id"];
    (request as AuthenticatedRequest).requestId =
      (Array.isArray(rawRequestId) ? rawRequestId[0] : rawRequestId)?.trim() ||
      randomUUID();
    const header = request.headers["authorization"];
    const raw = Array.isArray(header) ? header[0] : header;
    if (!raw?.startsWith("Bearer ")) {
      throw new UnauthorizedException("缺少登录凭证，请先登录");
    }
    const token = raw.slice("Bearer ".length).trim();
    if (!token) {
      throw new UnauthorizedException("缺少登录凭证，请先登录");
    }

    const secret = this.config.get<string>("SESSION_SECRET")?.trim();
    if (!secret) {
      throw new UnauthorizedException("服务端未配置会话密钥，无法完成认证");
    }
    const payload = verifyJwt(token, secret);
    if (!payload) {
      throw new UnauthorizedException("登录凭证无效或已过期，请重新登录");
    }

    const account = await this.database.client.userAccount.findUnique({
      where: { id: payload.sub },
      include: {
        employee: {
          include: {
            store: { select: { id: true, name: true } },
            organization: { select: { id: true, name: true } },
          },
        },
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: { permission: { select: { code: true } } },
                },
              },
            },
          },
        },
      },
    });

    if (!account?.employee) {
      throw new UnauthorizedException("账号或员工档案不存在，请联系管理员");
    }
    if (account.isFrozen) {
      throw new ForbiddenException("账号已被冻结，请联系管理员");
    }
    if (account.employee.status === "INACTIVE" || account.employee.status === "LEAVING") {
      throw new ForbiddenException("员工状态不允许登录，请联系管理员");
    }
    // 令牌吊销:签发时间早于最后改密时间的 JWT 一律拒绝(改密/重置即踢掉旧会话)。
    // 双方都取整到秒比较,避免改密后同秒重新登录的新令牌被误杀。
    if (
      account.passwordChangedAt &&
      payload.iat < Math.floor(account.passwordChangedAt.getTime() / 1000)
    ) {
      throw new UnauthorizedException("密码已修改，请重新登录");
    }
    // 强制改密:未完成首次改密的账号只能访问改密/会话/登出接口,其余一律拒绝
    // (防止绕过前端跳转直接调业务接口)
    if (account.mustChangePassword) {
      const url = (request as unknown as { url?: string }).url ?? "";
      const allowed = ["/auth/password", "/auth/me", "/auth/logout"];
      if (!allowed.some((path) => url.includes(path))) {
        throw new ForbiddenException(
          "首次登录必须先修改密码（账号菜单 → 修改密码）",
        );
      }
    }

    const roles = account.roles.map((relation) => ({
      id: relation.role.id,
      code: relation.role.code,
      name: relation.role.name,
      dataScope: relation.dataScope,
    }));
    const permissions = [
      ...new Set(
        account.roles.flatMap((relation) =>
          relation.role.permissions.map((item) => item.permission.code),
        ),
      ),
    ];

    (request as AuthenticatedRequest).user = {
      userId: account.id,
      username: account.username,
      employeeId: account.employeeId,
      organizationId: account.employee.organizationId,
      employeeNo: account.employee.employeeNo,
      employeeName: account.employee.name,
      storeId: account.employee.storeId,
      isFrozen: account.isFrozen,
      roles,
      permissions,
      tokenId: payload.jti,
    };
    (request as AuthenticatedRequest).tokenPayload = payload;
    return true;
  }
}

/**
 * 权限守卫：要求当前用户拥有指定权限码（resource:action）。
 * 必须与 JwtAuthGuard 一起使用。
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly required: string[]) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();
    if (!request.user) {
      throw new UnauthorizedException("缺少登录凭证，请先登录");
    }
    const missing = this.required.filter(
      (code) => !request.user.permissions.includes(code),
    );
    if (missing.length > 0) {
      throw new ForbiddenException(`缺少权限：${missing.join("、")}`);
    }
    return true;
  }
}

/**
 * 便捷工厂：生成一个权限守卫实例，供 @UseGuards 使用。
 * 示例：@UseGuards(JwtAuthGuard, requirePermissions("organization:write"))
 */
export function requirePermissions(...codes: string[]): PermissionsGuard {
  return new PermissionsGuard(codes);
}
