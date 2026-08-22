import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard, requirePermissions } from "../auth/auth.guard.js";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import {
  CreatePersonalStockDto,
  ListPersonalStockQueryDto,
  MinePersonalStockQueryDto,
} from "./personal-stock.dto.js";
import { PersonalStockService } from "./personal-stock.service.js";

/**
 * 个人库存接口(AC-F-007):
 * 读/建单/提交/取消挂 inventory:read(销售可对自己个人仓办理);
 * 领用/归还确认在服务层要求 inventory:write;转交确认要求接收方本人。
 */
@ApiTags("personal-stock")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("personal-stock")
export class PersonalStockController {
  constructor(private readonly personalStock: PersonalStockService) {}

  @Get("mine")
  @UseGuards(requirePermissions("inventory:read"))
  @ApiOperation({
    summary: "我的库存:按个人仓列出在库设备(销售本人/店长本店/组织范围全部)",
  })
  mine(
    @Query() query: MinePersonalStockQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.personalStock.mine(query, request);
  }

  @Get("orders")
  @UseGuards(requirePermissions("inventory:read"))
  @ApiOperation({ summary: "个人库存单据分页列表" })
  list(
    @Query() query: ListPersonalStockQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.personalStock.list(query, request);
  }

  @Post("orders")
  @UseGuards(requirePermissions("inventory:read"))
  @ApiOperation({ summary: "创建领用/归还/转交草稿(提交后锁库,确认后落位)" })
  create(
    @Body() body: CreatePersonalStockDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.personalStock.create(body, request);
  }

  @Get("orders/:id")
  @UseGuards(requirePermissions("inventory:read"))
  @ApiOperation({ summary: "个人库存单据详情" })
  detail(
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.personalStock.detail(id, request);
  }

  @Post("orders/:id/submit")
  @UseGuards(requirePermissions("inventory:read"))
  @ApiOperation({ summary: "提交并锁库:DRAFT → SUBMITTED" })
  submit(
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.personalStock.submit(id, request);
  }

  @Post("orders/:id/confirm")
  @UseGuards(requirePermissions("inventory:read"))
  @ApiOperation({
    summary:
      "确认落位:SUBMITTED → CONFIRMED(领用/归还需库管;转交需接收方本人)",
  })
  confirm(
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.personalStock.confirm(id, request);
  }

  @Post("orders/:id/cancel")
  @UseGuards(requirePermissions("inventory:read"))
  @ApiOperation({
    summary: "取消:DRAFT 直接作废;SUBMITTED 解锁并恢复锁库前状态",
  })
  cancel(
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.personalStock.cancel(id, request);
  }
}
