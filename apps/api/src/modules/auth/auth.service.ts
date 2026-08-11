import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  hashPassword,
  signJwt,
  verifyPassword,
} from "@jincheng/database";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../../database/database.service.js";
import { LoginDto } from "./auth.dto.js";

const DEFAULT_TOKEN_TTL_SECONDS = 8 * 60 * 60; // 8 小时

/**
 * 登录限流：内存滑动窗口，按 (ip, username) 组合限流。
 * 试点单实例部署可用；未来多实例需切换到 Redis 计数器。
 */
export class LoginRateLimiter {
  private readonly attempts = new Map<string, number[]>();
  private readonly maxAttempts: number;
  private readonly windowMs: number;

  constructor(maxAttempts = 5, windowMs = 5 * 60 * 1000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
  }

  check(ip: string, username: string): void {
    const key = `${ip}|${username.toLowerCase()}`;
    const now = Date.now();
    const recent = (this.attempts.get(key) ?? []).filter(
      (timestamp) => now - timestamp < this.windowMs,
    );
    if (recent.length >= this.maxAttempts) {
      const oldest = recent[0];
      const waitSeconds =
        oldest === undefined
          ? this.windowMs / 1000
          : Math.ceil((this.windowMs - (now - oldest)) / 1000);
      throw new ForbiddenException(
        `登录尝试过于频繁，请在 ${waitSeconds} 秒后重试`,
      );
    }
    this.attempts.set(key, recent);
  }

  recordFailure(ip: string, username: string): void {
    const key = `${ip}|${username.toLowerCase()}`;
    const now = Date.now();
    const recent = (this.attempts.get(key) ?? []).filter(
      (timestamp) => now - timestamp < this.windowMs,
    );
    recent.push(now);
    this.attempts.set(key, recent);
  }

  reset(ip: string, username: string): void {
    const key = `${ip}|${username.toLowerCase()}`;
    this.attempts.delete(key);
  }
}

@Injectable()
export class AuthService {
  readonly loginRateLimiter = new LoginRateLimiter();

  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  private get secret(): string {
    const value = this.config.get<string>("SESSION_SECRET")?.trim();
    if (!value) {
      throw new UnauthorizedException("服务端未配置会话密钥，无法完成认证");
    }
    return value;
  }

  private get tokenTtlSeconds(): number {
    const configured = Number(this.config.get<string>("AUTH_TOKEN_TTL_SECONDS"));
    return Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_TOKEN_TTL_SECONDS;
  }

  async login(input: LoginDto, ipAddress?: string) {
    const ip = ipAddress ?? "unknown";
    const username = input.username.trim();
    this.loginRateLimiter.check(ip, username);

    const account = await this.database.client.userAccount.findUnique({
      where: { username },
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

    const valid = await verifyPassword(
      input.password,
      account?.passwordHash ?? null,
    );
    if (!account || !valid) {
      this.loginRateLimiter.recordFailure(ip, username);
      await this.database.client.auditLog.create({
        data: {
          action: "auth.login_failed",
          resource: "auth",
          resourceId: account?.id ?? username,
          requestId: randomUUID(),
          ipAddress: ip,
          afterData: { username, reason: "bad_credentials" },
        },
      });
      throw new UnauthorizedException("账号或密码错误");
    }

    if (account.isFrozen) {
      this.loginRateLimiter.recordFailure(ip, username);
      throw new ForbiddenException("账号已被冻结，请联系管理员");
    }
    if (
      account.employee.status === "INACTIVE" ||
      account.employee.status === "LEAVING"
    ) {
      this.loginRateLimiter.recordFailure(ip, username);
      throw new ForbiddenException("员工状态不允许登录，请联系管理员");
    }

    const user = this.buildAuthUser(account);
    const token = signJwt(
      {
        sub: account.id,
        username: account.username,
        employeeId: account.employeeId,
        organizationId: account.employee.organizationId,
        exp: Math.floor(Date.now() / 1000) + this.tokenTtlSeconds,
      },
      this.secret,
    );

    this.loginRateLimiter.reset(ip, username);
    await this.database.client.auditLog.create({
      data: {
        actorUserId: account.id,
        action: "auth.login",
        resource: "auth",
        resourceId: account.id,
        requestId: randomUUID(),
        ipAddress: ip,
        afterData: { username: account.username, organizationId: user.organizationId },
      },
    });

    return {
      accessToken: token,
      expiresInSeconds: this.tokenTtlSeconds,
      user,
    };
  }

  async me(userId: string) {
    const account = await this.loadAccount(userId);
    if (!account) {
      throw new UnauthorizedException("账号不存在或已被移除");
    }
    if (account.isFrozen) {
      throw new ForbiddenException("账号已被冻结，请联系管理员");
    }
    return this.buildAuthUser(account);
  }

  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
    requestId: string,
  ) {
    const account = await this.loadAccount(userId);
    if (!account) {
      throw new UnauthorizedException("账号不存在或已被移除");
    }
    const valid = await verifyPassword(oldPassword, account.passwordHash);
    if (!valid) {
      throw new UnauthorizedException("原密码不正确");
    }
    const nextHash = await hashPassword(newPassword);
    await this.database.client.$transaction([
      this.database.client.userAccount.update({
        where: { id: userId },
        data: { passwordHash: nextHash },
      }),
      this.database.client.auditLog.create({
        data: {
          actorUserId: userId,
          action: "auth.change_password",
          resource: "user_account",
          resourceId: userId,
          requestId,
          afterData: { changedAt: new Date().toISOString() },
        },
      }),
    ]);
    return { success: true };
  }

  async changeUsername(
    userId: string,
    nextUsername: string,
    requestId: string,
  ) {
    const account = await this.loadAccount(userId);
    if (!account) {
      throw new UnauthorizedException("账号不存在或已被移除");
    }
    const normalized = nextUsername.trim();
    const exists = await this.database.client.userAccount.findUnique({
      where: { username: normalized },
      select: { id: true },
    });
    if (exists && exists.id !== userId) {
      throw new ConflictException("该登录名已被其他账号使用");
    }
    await this.database.client.$transaction([
      this.database.client.userAccount.update({
        where: { id: userId },
        data: { username: normalized },
      }),
      this.database.client.auditLog.create({
        data: {
          actorUserId: userId,
          action: "auth.change_username",
          resource: "user_account",
          resourceId: userId,
          requestId,
          beforeData: { username: account.username },
          afterData: { username: normalized },
        },
      }),
    ]);
    return { success: true };
  }

  async recordLogout(userId: string, username: string) {
    await this.database.client.auditLog.create({
      data: {
        actorUserId: userId,
        action: "auth.logout",
        resource: "auth",
        resourceId: userId,
        requestId: randomUUID(),
        afterData: { username },
      },
    });
    return { success: true };
  }

  private async loadAccount(userId: string) {
    return this.database.client.userAccount.findUnique({
      where: { id: userId },
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
  }

  private buildAuthUser(account: NonNullable<Awaited<ReturnType<AuthService["loadAccount"]>>>) {
    const permissions = [
      ...new Set(
        account.roles.flatMap((relation) =>
          relation.role.permissions.map((item) => item.permission.code),
        ),
      ),
    ];
    return {
      userId: account.id,
      username: account.username,
      employeeId: account.employeeId,
      employeeNo: account.employee.employeeNo,
      employeeName: account.employee.name,
      status: account.employee.status,
      isFrozen: account.isFrozen,
      organizationId: account.employee.organizationId,
      organizationName: account.employee.organization.name,
      storeId: account.employee.storeId,
      storeName: account.employee.store?.name ?? null,
      permissions,
      roles: account.roles.map((relation) => ({
        roleId: relation.role.id,
        roleCode: relation.role.code,
        roleName: relation.role.name,
        dataScope: relation.dataScope,
        approvalLimit:
          relation.approvalLimit === null || relation.approvalLimit === undefined
            ? null
            : relation.approvalLimit.toString(),
      })),
    };
  }
}
