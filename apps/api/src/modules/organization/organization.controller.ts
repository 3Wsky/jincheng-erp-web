import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { randomUUID } from "node:crypto";
import { JwtAuthGuard, requirePermissions } from "../auth/auth.guard.js";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import {
  CreateAccountDto,
  CreateEmployeeDto,
  CreateOrganizationDto,
  CreateStoreDto,
  ListEmployeesQueryDto,
  UpdateAccountDto,
  UpdateEmployeeDto,
  UpdateOrganizationDto,
  UpdateStoreDto,
} from "./organization.dto.js";
import { OrganizationService } from "./organization.service.js";

@ApiTags("organization")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class OrganizationController {
  constructor(private readonly organization: OrganizationService) {}

  private requestOf(request: AuthenticatedRequest, header?: string): AuthenticatedRequest {
    if (!request.requestId) {
      request.requestId = header?.trim() || randomUUID();
    }
    return request;
  }

  // ---------- 组织 ----------

  @Get("organizations")
  @UseGuards(requirePermissions("organization:read"))
  @ApiOperation({ summary: "组织列表" })
  listOrganizations() {
    return this.organization.listOrganizations();
  }

  @Post("organizations")
  @UseGuards(requirePermissions("organization:write"))
  @ApiOperation({ summary: "创建组织" })
  createOrganization(
    @Body() body: CreateOrganizationDto,
    @Req() request: AuthenticatedRequest,
    @Headers("x-request-id") requestId?: string,
  ) {
    return this.organization.createOrganization(
      body,
      this.requestOf(request, requestId),
    );
  }

  @Patch("organizations/:id")
  @UseGuards(requirePermissions("organization:write"))
  @ApiOperation({ summary: "修改组织名称" })
  updateOrganization(
    @Param("id") id: string,
    @Body() body: UpdateOrganizationDto,
    @Req() request: AuthenticatedRequest,
    @Headers("x-request-id") requestId?: string,
  ) {
    return this.organization.updateOrganization(
      id,
      body,
      this.requestOf(request, requestId),
    );
  }

  // ---------- 门店 ----------

  @Get("organizations/:organizationId/stores")
  @UseGuards(requirePermissions("organization:read"))
  @ApiOperation({ summary: "指定组织的门店列表" })
  listStores(@Param("organizationId") organizationId: string) {
    return this.organization.listStores(organizationId);
  }

  @Post("stores")
  @UseGuards(requirePermissions("organization:write"))
  @ApiOperation({ summary: "创建门店" })
  createStore(
    @Body() body: CreateStoreDto,
    @Req() request: AuthenticatedRequest,
    @Headers("x-request-id") requestId?: string,
  ) {
    return this.organization.createStore(body, this.requestOf(request, requestId));
  }

  @Patch("stores/:id")
  @UseGuards(requirePermissions("organization:write"))
  @ApiOperation({ summary: "修改门店编码或名称" })
  updateStore(
    @Param("id") id: string,
    @Body() body: UpdateStoreDto,
    @Req() request: AuthenticatedRequest,
    @Headers("x-request-id") requestId?: string,
  ) {
    return this.organization.updateStore(id, body, this.requestOf(request, requestId));
  }

  // ---------- 员工 ----------

  @Get("organizations/:organizationId/employees")
  @UseGuards(requirePermissions("organization:read"))
  @ApiOperation({ summary: "分页查询组织下员工" })
  listEmployees(
    @Param("organizationId") organizationId: string,
    @Query() query: ListEmployeesQueryDto,
  ) {
    return this.organization.listEmployees(organizationId, query);
  }

  @Post("employees")
  @UseGuards(requirePermissions("organization:write"))
  @ApiOperation({ summary: "创建员工档案" })
  createEmployee(
    @Body() body: CreateEmployeeDto,
    @Req() request: AuthenticatedRequest,
    @Headers("x-request-id") requestId?: string,
  ) {
    return this.organization.createEmployee(body, this.requestOf(request, requestId));
  }

  @Patch("employees/:id")
  @UseGuards(requirePermissions("organization:write"))
  @ApiOperation({ summary: "修改员工门店归属、状态或联系方式" })
  updateEmployee(
    @Param("id") id: string,
    @Body() body: UpdateEmployeeDto,
    @Req() request: AuthenticatedRequest,
    @Headers("x-request-id") requestId?: string,
  ) {
    return this.organization.updateEmployee(id, body, this.requestOf(request, requestId));
  }

  // ---------- 账号 ----------

  @Post("accounts")
  @UseGuards(requirePermissions("account:write"))
  @ApiOperation({ summary: "为员工开通登录账号并分配角色" })
  createAccount(
    @Body() body: CreateAccountDto,
    @Req() request: AuthenticatedRequest,
    @Headers("x-request-id") requestId?: string,
  ) {
    return this.organization.createAccount(body, this.requestOf(request, requestId));
  }

  @Patch("accounts/:id")
  @UseGuards(requirePermissions("account:write"))
  @ApiOperation({ summary: "冻结/解冻账号、重置密码或调整角色" })
  updateAccount(
    @Param("id") id: string,
    @Body() body: UpdateAccountDto,
    @Req() request: AuthenticatedRequest,
    @Headers("x-request-id") requestId?: string,
  ) {
    return this.organization.updateAccount(id, body, this.requestOf(request, requestId));
  }

  // ---------- 角色与权限 ----------

  @Get("roles")
  @UseGuards(requirePermissions("role:read"))
  @ApiOperation({ summary: "角色列表（含权限码）" })
  listRoles() {
    return this.organization.listRoles();
  }

  @Get("permissions")
  @UseGuards(requirePermissions("role:read"))
  @ApiOperation({ summary: "权限清单" })
  listPermissions() {
    return this.organization.listPermissions();
  }
}
