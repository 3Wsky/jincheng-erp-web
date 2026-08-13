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
  CreateTransferDto,
  ListTransfersQueryDto,
  MarkTransferExceptionsDto,
  ReceiveTransferDto,
  RejectTransferDto,
} from "./transfer.dto.js";
import { TransferService } from "./transfer.service.js";

/**
 * 调拨接口:双向握手状态机(docs/12 第 2 节)。
 * 读需 transfer:read,全部命令需 transfer:write;
 * 审批金额/数量分级待权限矩阵(docs/11)签字后细化为独立审批权限。
 */
@ApiTags("transfers")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("transfers")
export class TransferController {
  constructor(private readonly transfers: TransferService) {}

  @Get()
  @UseGuards(requirePermissions("transfer:read"))
  @ApiOperation({ summary: "调拨单分页列表(状态/仓库/单号过滤)" })
  list(@Query() query: ListTransfersQueryDto) {
    return this.transfers.list(query);
  }

  @Post()
  @UseGuards(requirePermissions("transfer:write"))
  @ApiOperation({ summary: "创建调拨草稿(序列号一机一行)" })
  create(@Body() body: CreateTransferDto, @Req() request: AuthenticatedRequest) {
    return this.transfers.create(body, request);
  }

  @Get(":id")
  @UseGuards(requirePermissions("transfer:read"))
  @ApiOperation({ summary: "调拨单详情(含明细与握手时间线)" })
  detail(@Param("id", ParseUUIDPipe) id: string) {
    return this.transfers.detail(id);
  }

  @Post(":id/submit")
  @UseGuards(requirePermissions("transfer:write"))
  @ApiOperation({ summary: "提交申请:DRAFT → SUBMITTED" })
  submit(@Param("id", ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    return this.transfers.submit(id, request);
  }

  @Post(":id/approve")
  @UseGuards(requirePermissions("transfer:write"))
  @ApiOperation({ summary: "审批通过:SUBMITTED → APPROVED" })
  approve(@Param("id", ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    return this.transfers.approve(id, request);
  }

  @Post(":id/reject")
  @UseGuards(requirePermissions("transfer:write"))
  @ApiOperation({ summary: "审批拒绝:SUBMITTED → REJECTED(必填原因)" })
  reject(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: RejectTransferDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.transfers.reject(id, body, request);
  }

  @Post(":id/lock")
  @UseGuards(requirePermissions("transfer:write"))
  @ApiOperation({ summary: "锁定来源库存:APPROVED → LOCKED(序列号 NORMAL → LOCKED)" })
  lock(@Param("id", ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    return this.transfers.lock(id, request);
  }

  @Post(":id/unlock")
  @UseGuards(requirePermissions("transfer:write"))
  @ApiOperation({
    summary: "解锁退回:LOCKED → APPROVED(释放已锁定序列号,可重新锁定或撤单)",
  })
  unlock(@Param("id", ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    return this.transfers.unlock(id, request);
  }

  @Post(":id/ship")
  @UseGuards(requirePermissions("transfer:write"))
  @ApiOperation({ summary: "发出:LOCKED → IN_TRANSIT(写 TRANSFER_OUT 流水)" })
  ship(@Param("id", ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    return this.transfers.ship(id, request);
  }

  @Post(":id/receive")
  @UseGuards(requirePermissions("transfer:write"))
  @ApiOperation({
    summary: "扫码接收(支持部分):序列号落位调入仓,写 TRANSFER_IN 流水,主单按明细聚合",
  })
  receive(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: ReceiveTransferDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.transfers.receive(id, body, request);
  }

  @Post(":id/exceptions")
  @UseGuards(requirePermissions("transfer:write"))
  @ApiOperation({
    summary: "差异登记(少货/错货/损坏/拒收/超时):设备转异常状态,待差异闭环",
  })
  markExceptions(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: MarkTransferExceptionsDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.transfers.markExceptions(id, body, request);
  }

  @Post(":id/complete")
  @UseGuards(requirePermissions("transfer:write"))
  @ApiOperation({ summary: "对账完成:RECEIVED → COMPLETED" })
  complete(@Param("id", ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    return this.transfers.complete(id, request);
  }

  @Post(":id/cancel")
  @UseGuards(requirePermissions("transfer:write"))
  @ApiOperation({ summary: "取消/撤回:DRAFT/SUBMITTED → CANCELLED(锁库后不可取消)" })
  cancel(@Param("id", ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    return this.transfers.cancel(id, request);
  }
}
