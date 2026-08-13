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
  CreatePurchaseOrderDto,
  CreatePurchasePaymentDto,
  CreatePurchaseReceiptDto,
  CreateSupplierDto,
  ListPurchaseOrdersQueryDto,
  ListSuppliersQueryDto,
  RejectPurchaseOrderDto,
  UpdateSupplierDto,
} from "./procurement.dto.js";
import { ProcurementService } from "./procurement.service.js";

/**
 * 采购接口:审批/付款/收货三维度状态机(docs/12 第 3 节)。
 * 读需 procurement:read,全部命令需 procurement:write;
 * 审批金额分级待权限矩阵(docs/11)签字后细化为独立审批权限。
 */
@ApiTags("procurement")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class ProcurementController {
  constructor(private readonly procurement: ProcurementService) {}

  // ---------- 供应商 ----------

  @Get("suppliers")
  @UseGuards(requirePermissions("procurement:read"))
  @ApiOperation({ summary: "供应商分页列表(编码/名称搜索,状态过滤)" })
  listSuppliers(@Query() query: ListSuppliersQueryDto) {
    return this.procurement.listSuppliers(query);
  }

  @Post("suppliers")
  @UseGuards(requirePermissions("procurement:write"))
  @ApiOperation({ summary: "创建供应商(编码公司范围唯一)" })
  createSupplier(
    @Body() body: CreateSupplierDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.procurement.createSupplier(body, request);
  }

  @Patch("suppliers/:id")
  @UseGuards(requirePermissions("procurement:write"))
  @ApiOperation({ summary: "更新供应商(改名/联系人/停用)" })
  updateSupplier(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: UpdateSupplierDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.procurement.updateSupplier(id, body, request);
  }

  // ---------- 采购单 ----------

  @Get("purchase-orders")
  @UseGuards(requirePermissions("procurement:read"))
  @ApiOperation({ summary: "采购单分页列表(审批状态/供应商/单号过滤)" })
  listOrders(@Query() query: ListPurchaseOrdersQueryDto) {
    return this.procurement.listOrders(query);
  }

  @Post("purchase-orders")
  @UseGuards(requirePermissions("procurement:write"))
  @ApiOperation({ summary: "创建采购草稿(SKU+数量+单价,总额自动汇总)" })
  create(
    @Body() body: CreatePurchaseOrderDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.procurement.create(body, request);
  }

  @Get("purchase-orders/:id")
  @UseGuards(requirePermissions("procurement:read"))
  @ApiOperation({
    summary: "采购单详情(行/付款记录/收货批次/三维度状态与已付未到指标)",
  })
  detail(@Param("id", ParseUUIDPipe) id: string) {
    return this.procurement.detail(id);
  }

  @Post("purchase-orders/:id/submit")
  @UseGuards(requirePermissions("procurement:write"))
  @ApiOperation({ summary: "提交审批:DRAFT → SUBMITTED" })
  submit(
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.procurement.submit(id, request);
  }

  @Post("purchase-orders/:id/approve")
  @UseGuards(requirePermissions("procurement:write"))
  @ApiOperation({ summary: "审批通过:SUBMITTED → APPROVED(审批分级待签字)" })
  approve(
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.procurement.approve(id, request);
  }

  @Post("purchase-orders/:id/reject")
  @UseGuards(requirePermissions("procurement:write"))
  @ApiOperation({ summary: "审批拒绝:SUBMITTED → REJECTED(必填原因)" })
  reject(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: RejectPurchaseOrderDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.procurement.reject(id, body, request);
  }

  @Post("purchase-orders/:id/cancel")
  @UseGuards(requirePermissions("procurement:write"))
  @ApiOperation({ summary: "取消:DRAFT/SUBMITTED → CANCELLED(审批通过后不可取消)" })
  cancel(
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.procurement.cancel(id, request);
  }

  @Post("purchase-orders/:id/payments")
  @UseGuards(requirePermissions("procurement:pay"))
  @ApiOperation({
    summary:
      "登记付款:创建付款单据并累加已付金额(钱账分离,需 procurement:pay——出纳/管理员;超付拒绝,容差待签字)",
  })
  addPayment(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: CreatePurchasePaymentDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.procurement.addPayment(id, body, request);
  }

  @Post("purchase-orders/:id/receipts")
  @UseGuards(requirePermissions("procurement:write"))
  @ApiOperation({
    summary: "扫码收货:逐台生成序列号入库并写 PURCHASE_RECEIPT 流水(超收拒绝)",
  })
  addReceipt(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: CreatePurchaseReceiptDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.procurement.addReceipt(id, body, request);
  }

  @Post("purchase-orders/:id/complete")
  @UseGuards(requirePermissions("procurement:write"))
  @ApiOperation({
    summary: "完成:校验审批+付款+收货三维度全部满足后写 completedAt",
  })
  complete(
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.procurement.complete(id, request);
  }
}
