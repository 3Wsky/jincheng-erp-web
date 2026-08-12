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
  CreateStocktakeDto,
  ListStocktakesQueryDto,
  RejectStocktakeDto,
  ScanStocktakeDto,
} from "./stocktake.dto.js";
import { StocktakeService } from "./stocktake.service.js";

/**
 * 盘点接口:按仓库整仓盘点(docs/12 第 6 节状态机)。
 * 盘点开始后仓库封存,禁止调拨与出入库(2026-08-12 业务确认)。
 * 读需 inventory:read,全部命令需 inventory:write;审批分级待权限矩阵签字。
 */
@ApiTags("stocktakes")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("stocktakes")
export class StocktakeController {
  constructor(private readonly stocktakes: StocktakeService) {}

  @Get()
  @UseGuards(requirePermissions("inventory:read"))
  @ApiOperation({ summary: "盘点单分页列表(状态/仓库过滤)" })
  list(@Query() query: ListStocktakesQueryDto) {
    return this.stocktakes.list(query);
  }

  @Post()
  @UseGuards(requirePermissions("inventory:write"))
  @ApiOperation({ summary: "创建盘点草稿(同仓库不允许并存未完结盘点单)" })
  create(@Body() body: CreateStocktakeDto, @Req() request: AuthenticatedRequest) {
    return this.stocktakes.create(body, request);
  }

  @Get(":id")
  @UseGuards(requirePermissions("inventory:read"))
  @ApiOperation({ summary: "盘点单详情(进度、差异清单)" })
  detail(@Param("id", ParseUUIDPipe) id: string) {
    return this.stocktakes.detail(id);
  }

  @Post(":id/start")
  @UseGuards(requirePermissions("inventory:write"))
  @ApiOperation({
    summary: "开始盘点:DRAFT → COUNTING,仓库进入封存(禁调拨/出入库)",
  })
  start(@Param("id", ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    return this.stocktakes.start(id, request);
  }

  @Post(":id/scan")
  @UseGuards(requirePermissions("inventory:write"))
  @ApiOperation({ summary: "录入实盘 IMEI(批量,单内自动去重)" })
  scan(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: ScanStocktakeDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.stocktakes.scan(id, body, request);
  }

  @Post(":id/submit")
  @UseGuards(requirePermissions("inventory:write"))
  @ApiOperation({ summary: "提交盘点:COUNTING → SUBMITTED,计算差异快照" })
  submit(@Param("id", ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    return this.stocktakes.submit(id, request);
  }

  @Post(":id/approve")
  @UseGuards(requirePermissions("inventory:write"))
  @ApiOperation({ summary: "审批通过:SUBMITTED → APPROVED" })
  approve(@Param("id", ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    return this.stocktakes.approve(id, request);
  }

  @Post(":id/reject")
  @UseGuards(requirePermissions("inventory:write"))
  @ApiOperation({ summary: "驳回重盘:SUBMITTED → COUNTING(保持封存,必填原因)" })
  reject(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: RejectStocktakeDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.stocktakes.reject(id, body, request);
  }

  @Post(":id/post")
  @UseGuards(requirePermissions("inventory:write"))
  @ApiOperation({
    summary: "过账:APPROVED → POSTED,盘亏转异常并写 STOCK_LOSS 流水,解除封存",
  })
  post(@Param("id", ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    return this.stocktakes.post(id, request);
  }

  @Post(":id/cancel")
  @UseGuards(requirePermissions("inventory:write"))
  @ApiOperation({ summary: "取消:DRAFT/COUNTING → CANCELLED,解除封存" })
  cancel(@Param("id", ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    return this.stocktakes.cancel(id, request);
  }
}
