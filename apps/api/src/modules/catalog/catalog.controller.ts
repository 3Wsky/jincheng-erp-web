import {
  Body,
  Controller,
  Get,
  Param,
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
  ApplyCatalogImportDto,
  CreateCatalogProductDto,
  CreateCatalogSkuDto,
  ListCatalogProductsQueryDto,
  UpdateCatalogProductDto,
  UpdateCatalogSkuDto,
} from "./catalog.dto.js";
import { CatalogService } from "./catalog.service.js";
import { CatalogWriteGuard } from "./catalog-write.guard.js";
import { PriceFeedService } from "./price-feed.service.js";

/**
 * 货品接口鉴权模型（2026-08-11 整改）：
 * - 全部接口要求登录（JwtAuthGuard），读需 catalog:read，写需 catalog:write；
 * - 写接口在权限之外保留 CatalogWriteGuard 共享密钥作为第二道防线
 *   （密钥只存在于服务端与 BFF，浏览器不可见）；
 * - 所有写入动作的审计日志必须携带操作人 actorUserId。
 */
@ApiTags("catalog")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("catalog")
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly priceFeed: PriceFeedService,
  ) {}

  @Get("products")
  @UseGuards(requirePermissions("catalog:read"))
  @ApiOperation({ summary: "分页查询商品、SKU 与条码" })
  listProducts(@Query() query: ListCatalogProductsQueryDto) {
    return this.catalog.listProducts(query);
  }

  @Post("prices/sync-from-feed")
  @UseGuards(requirePermissions("catalog:write"), CatalogWriteGuard)
  @ApiOperation({
    summary:
      "同步官网零售价:读取价签项目 products.json,按型号+容量匹配 SKU 回填(演示机跳过)",
  })
  syncPricesFromFeed(@Req() request: AuthenticatedRequest) {
    return this.priceFeed.syncFromFeed(request.requestId, request.user.userId);
  }

  @Get("organizations")
  @UseGuards(requirePermissions("catalog:read"))
  @ApiOperation({ summary: "查询可用于货品归属的组织" })
  listOrganizations() {
    return this.catalog.listOrganizations();
  }

  @Post("products")
  @UseGuards(requirePermissions("catalog:write"), CatalogWriteGuard)
  @ApiOperation({ summary: "创建商品及首批 SKU" })
  createProduct(
    @Body() body: CreateCatalogProductDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalog.createProduct(
      body,
      request.requestId,
      request.user.userId,
    );
  }

  @Patch("products/:id")
  @UseGuards(requirePermissions("catalog:write"), CatalogWriteGuard)
  @ApiOperation({ summary: "修改商品分类、名称或启停状态" })
  updateProduct(
    @Param("id") id: string,
    @Body() body: UpdateCatalogProductDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalog.updateProduct(
      id,
      body,
      request.requestId,
      request.user.userId,
    );
  }

  @Post("products/:id/skus")
  @UseGuards(requirePermissions("catalog:write"), CatalogWriteGuard)
  @ApiOperation({ summary: "给现有商品新增 SKU" })
  addSku(
    @Param("id") id: string,
    @Body() body: CreateCatalogSkuDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalog.addSku(
      id,
      body,
      request.requestId,
      request.user.userId,
    );
  }

  @Patch("skus/:id")
  @UseGuards(requirePermissions("catalog:write"), CatalogWriteGuard)
  @ApiOperation({ summary: "修改 SKU、条码或序列号管理规则" })
  updateSku(
    @Param("id") id: string,
    @Body() body: UpdateCatalogSkuDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalog.updateSku(
      id,
      body,
      request.requestId,
      request.user.userId,
    );
  }

  @Get("imports")
  @UseGuards(requirePermissions("catalog:read"))
  @ApiOperation({ summary: "查询最近的管家婆货品导入批次" })
  listImports() {
    return this.catalog.listImportBatches();
  }

  @Post("imports/bytestar/preview")
  @UseGuards(requirePermissions("catalog:write"), CatalogWriteGuard)
  @ApiOperation({ summary: "只读解析智储星配置的管家婆 CDS，并生成预校验批次" })
  previewBytestarImport() {
    return this.catalog.previewBytestarImport();
  }

  @Post("imports/:id/apply")
  @UseGuards(requirePermissions("catalog:write"), CatalogWriteGuard)
  @ApiOperation({ summary: "把已校验批次应用为待归类商品与 SKU，不生成库存" })
  applyImport(
    @Param("id") id: string,
    @Body() body: ApplyCatalogImportDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalog.applyImport(
      id,
      body,
      request.requestId,
      request.user.userId,
    );
  }
}
