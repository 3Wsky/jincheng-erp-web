import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { randomUUID } from "node:crypto";
import { ChangePasswordDto, LoginDto } from "./auth.dto.js";
import { JwtAuthGuard } from "./auth.guard.js";
import { AuthService } from "./auth.service.js";
import { CurrentUser } from "./current-user.decorator.js";
import type { AuthenticatedRequest } from "./auth.types.js";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "账号密码登录，返回访问令牌与当前用户" })
  login(
    @Body() body: LoginDto,
    @Ip() ip: string,
  ) {
    return this.auth.login(body, ip);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "获取当前登录用户信息（含角色与权限）" })
  me(@CurrentUser() user: AuthenticatedRequest["user"]) {
    return this.auth.me(user.userId);
  }

  @Patch("password")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "修改当前账号密码" })
  changePassword(
    @CurrentUser() user: AuthenticatedRequest["user"],
    @Body() body: ChangePasswordDto,
    @Headers("x-request-id") requestId?: string,
  ) {
    return this.auth.changePassword(
      user.userId,
      body.oldPassword,
      body.newPassword,
      requestId || randomUUID(),
    );
  }

  @Post("logout")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: "登出（记录审计，客户端应丢弃令牌）" })
  async logout(@CurrentUser() user: AuthenticatedRequest["user"]) {
    await this.auth.recordLogout(user.userId, user.username);
    return { success: true };
  }
}
