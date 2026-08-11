import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from "class-validator";
import { JwtAuthGuard, requirePermissions } from "../auth/auth.guard.js";
import { AuditService } from "./audit.service.js";

class ListAuditLogsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize = 20;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  resource?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  resourceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;

  @IsOptional()
  @IsUUID()
  actorUserId?: string;
}

@ApiTags("audit")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("audit")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get("logs")
  @UseGuards(requirePermissions("audit:read"))
  @ApiOperation({ summary: "分页查询审计日志（按操作人、对象、动作过滤）" })
  listLogs(@Query() query: ListAuditLogsQueryDto) {
    return this.audit.listAuditLogs(query);
  }

  @Get("outbox/pending")
  @UseGuards(requirePermissions("audit:read"))
  @ApiOperation({ summary: "待发布事件数量（运维监控用）" })
  async pendingOutbox() {
    return { pending: await this.audit.countPendingOutbox() };
  }
}
