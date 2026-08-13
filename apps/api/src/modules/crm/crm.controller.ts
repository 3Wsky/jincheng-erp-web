import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard, requirePermissions } from "../auth/auth.guard.js";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import {
  CreateCustomerDto,
  CreateFollowupDto,
  ListCustomersQueryDto,
  UpdateCustomerDto,
} from "./crm.dto.js";
import { CrmService } from "./crm.service.js";

/**
 * 客户管理接口(AC-F-015/016):读需 customer:read,写需 customer:write。
 * 手机号一律脱敏返回(明文可见角色待 Field 维度签字,docs/11);
 * 客户合并(customer-merges)待去重规则签字后实现。
 */
@ApiTags("customers")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("customers")
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  @Get()
  @UseGuards(requirePermissions("customer:read"))
  @ApiOperation({ summary: "客户分页列表(姓名/手机号搜索,手机号脱敏返回)" })
  list(@Query() query: ListCustomersQueryDto) {
    return this.crm.list(query);
  }

  @Post()
  @UseGuards(requirePermissions("customer:write"))
  @ApiOperation({
    summary: "建档:同手机号已有客户返回 409 提示,allowDuplicate 显式放行",
  })
  create(@Body() body: CreateCustomerDto, @Req() request: AuthenticatedRequest) {
    return this.crm.create(body, request);
  }

  @Get(":id")
  @UseGuards(requirePermissions("customer:read"))
  @ApiOperation({ summary: "客户详情:档案 + 外部身份 + 回访时间线" })
  detail(@Param("id", ParseUUIDPipe) id: string) {
    return this.crm.detail(id);
  }

  @Patch(":id")
  @UseGuards(requirePermissions("customer:write"))
  @ApiOperation({ summary: "更新客户基础资料(已作废客户拒绝修改)" })
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: UpdateCustomerDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.crm.update(id, body, request);
  }

  @Post(":id/archive")
  @UseGuards(requirePermissions("customer:write"))
  @ApiOperation({ summary: "作废客户(软删,回访历史保留可追溯)" })
  archive(
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.crm.archive(id, request);
  }

  @Post(":id/followups")
  @UseGuards(requirePermissions("customer:write"))
  @ApiOperation({
    summary: "添加回访:结果为 8 个标准枚举,nextFollowupAt 到期进待办",
  })
  addFollowup(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: CreateFollowupDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.crm.addFollowup(id, body, request);
  }
}
