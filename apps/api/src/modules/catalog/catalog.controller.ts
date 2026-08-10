import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { randomUUID } from "node:crypto";
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

@ApiTags("catalog")
@Controller("catalog")
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get("products")
  @ApiOperation({ summary: "分页查询商品、SKU 与条码" })
  listProducts(@Query() query: ListCatalogProductsQueryDto) {
    return this.catalog.listProducts(query);
  }

  @Get("organizations")
  @ApiOperation({ summary: "查询可用于货品归属的组织" })
  listOrganizations() {
    return this.catalog.listOrganizations();
  }

  @Post("products")
  @UseGuards(CatalogWriteGuard)
  @ApiOperation({ summary: "创建商品及首批 SKU" })
  createProduct(
    @Body() body: CreateCatalogProductDto,
    @Headers("x-request-id") requestId?: string,
  ) {
    return this.catalog.createProduct(body, requestId || randomUUID());
  }

  @Patch("products/:id")
  @UseGuards(CatalogWriteGuard)
  @ApiOperation({ summary: "修改商品分类、名称或启停状态" })
  updateProduct(
    @Param("id") id: string,
    @Body() body: UpdateCatalogProductDto,
    @Headers("x-request-id") requestId?: string,
  ) {
    return this.catalog.updateProduct(id, body, requestId || randomUUID());
  }

  @Post("products/:id/skus")
  @UseGuards(CatalogWriteGuard)
  @ApiOperation({ summary: "给现有商品新增 SKU" })
  addSku(
    @Param("id") id: string,
    @Body() body: CreateCatalogSkuDto,
    @Headers("x-request-id") requestId?: string,
  ) {
    return this.catalog.addSku(id, body, requestId || randomUUID());
  }

  @Patch("skus/:id")
  @UseGuards(CatalogWriteGuard)
  @ApiOperation({ summary: "修改 SKU、条码或序列号管理规则" })
  updateSku(
    @Param("id") id: string,
    @Body() body: UpdateCatalogSkuDto,
    @Headers("x-request-id") requestId?: string,
  ) {
    return this.catalog.updateSku(id, body, requestId || randomUUID());
  }

  @Get("imports")
  @ApiOperation({ summary: "查询最近的管家婆货品导入批次" })
  listImports() {
    return this.catalog.listImportBatches();
  }

  @Post("imports/bytestar/preview")
  @UseGuards(CatalogWriteGuard)
  @ApiOperation({ summary: "只读解析智储星配置的管家婆 CDS，并生成预校验批次" })
  previewBytestarImport() {
    return this.catalog.previewBytestarImport();
  }

  @Post("imports/:id/apply")
  @UseGuards(CatalogWriteGuard)
  @ApiOperation({ summary: "把已校验批次应用为待归类商品与 SKU，不生成库存" })
  applyImport(
    @Param("id") id: string,
    @Body() body: ApplyCatalogImportDto,
    @Headers("x-request-id") requestId?: string,
  ) {
    return this.catalog.applyImport(id, body, requestId || randomUUID());
  }
}
