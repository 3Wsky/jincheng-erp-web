import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
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
  CreateRoleDto,
  CreateStoreDto,
  ListEmployeesQueryDto,
  UpdateAccountDto,
  UpdateEmployeeDto,
  UpdateOrganizationDto,
  UpdateRoleDto,
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

  @Get("organizations/:organizationId/warehouses")
  @UseGuards(requirePermissions("organization:read"))
  @ApiOperation({
    summary: "地点清单：全部仓库（含个人仓），按类型供组织页分组展示",
  })
  listWarehouses(@Param("organizationId") organizationId: string) {
    return this.organization.listWarehouses(organizationId);
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

  @Post("organizations/:organizationId/stores/sync-from-warehouses")
  @UseGuards(requirePermissions("organization:write"))
  @ApiOperation({
    summary: "从门店类仓库同步门店主数据（幂等；总仓/售后/个人仓不参与）",
  })
  syncStoresFromWarehouses(
    @Param("organizationId") organizationId: string,
    @Req() request: AuthenticatedRequest,
    @Headers("x-request-id") requestId?: string,
  ) {
    return this.organization.syncStoresFromWarehouses(
      organizationId,
      this.requestOf(request, requestId),
    );
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
  @ApiOperation({
    summary: "为员工开通登录账号并分配角色；销售岗须同时划分门店和仓库",
  })
  createAccount(
    @Body() body: CreateAccountDto,
    @Req() request: AuthenticatedRequest,
    @Headers("x-request-id") requestId?: string,
  ) {
    return this.organization.createAccount(body, this.requestOf(request, requestId));
  }

  @Patch("accounts/:id")
  @UseGuards(requirePermissions("account:write"))
  @ApiOperation({
    summary: "冻结/解冻、重置密码、调整角色；销售岗可同步划分门店和仓库",
  })
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
  @ApiOperation({ summary: "角色列表（含权限码/系统标记/挂载账号数）" })
  listRoles() {
    return this.organization.listRoles();
  }

  @Get("permissions")
  @UseGuards(requirePermissions("role:read"))
  @ApiOperation({ summary: "权限清单" })
  listPermissions() {
    return this.organization.listPermissions();
  }

  @Get("roles/:id/accounts")
  @UseGuards(requirePermissions("role:read"))
  @ApiOperation({ summary: "指定角色的持有账号清单（核对谁有该权限）" })
  listRoleAccounts(@Param("id", ParseUUIDPipe) id: string) {
    return this.organization.listRoleAccounts(id);
  }

  @Post("roles")
  @UseGuards(requirePermissions("role:write"))
  @ApiOperation({
    summary: "创建自定义角色（内置角色由 seed 权威管理，不走本接口）",
  })
  createRole(
    @Body() body: CreateRoleDto,
    @Req() request: AuthenticatedRequest,
    @Headers("x-request-id") requestId?: string,
  ) {
    return this.organization.createRole(body, this.requestOf(request, requestId));
  }

  @Patch("roles/:id")
  @UseGuards(requirePermissions("role:write"))
  @ApiOperation({ summary: "更新自定义角色名称/权限（内置角色 422 拒绝）" })
  updateRole(
    @Param("id") id: string,
    @Body() body: UpdateRoleDto,
    @Req() request: AuthenticatedRequest,
    @Headers("x-request-id") requestId?: string,
  ) {
    return this.organization.updateRole(id, body, this.requestOf(request, requestId));
  }

  @Post("roles/:id/archive")
  @UseGuards(requirePermissions("role:write"))
  @ApiOperation({ summary: "停用自定义角色（软删；有账号挂载时 422 拒绝）" })
  archiveRole(
    @Param("id") id: string,
    @Req() request: AuthenticatedRequest,
    @Headers("x-request-id") requestId?: string,
  ) {
    return this.organization.archiveRole(id, this.requestOf(request, requestId));
  }

  @Post("roles/:id/restore")
  @UseGuards(requirePermissions("role:write"))
  @ApiOperation({ summary: "恢复已停用的自定义角色" })
  restoreRole(
    @Param("id") id: string,
    @Req() request: AuthenticatedRequest,
    @Headers("x-request-id") requestId?: string,
  ) {
    return this.organization.restoreRole(id, this.requestOf(request, requestId));
  }
}
