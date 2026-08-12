import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { SerialStatus } from "@jincheng/database";
import { JwtAuthGuard, requirePermissions } from "../auth/auth.guard.js";
import { InventoryService } from "./inventory.service.js";

class WarehouseSerialsQueryDto {
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
  search?: string;
}

/** 全局查货入参:关键字必填,状态/仓库/SKU 可选过滤 */
class InventorySearchQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  q!: string;

  @IsOptional()
  @IsIn(Object.values(SerialStatus))
  status?: SerialStatus;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  /** 聚合视图点击商品后下钻明细用 */
  @IsOptional()
  @IsUUID()
  skuId?: string;

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
}

/** 查货聚合视图入参:仅关键字 */
class InventorySearchSummaryQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  q!: string;
}

@ApiTags("inventory")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("inventory")
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get("overview")
  @UseGuards(requirePermissions("inventory:read"))
  @ApiOperation({ summary: "仓库总览:按仓库聚合序列号数量,区分公司/个人仓库" })
  overview() {
    return this.inventory.overview();
  }

  @Get("search")
  @UseGuards(requirePermissions("inventory:read"))
  @ApiOperation({
    summary:
      "全局查货:按 IMEI/SN/SKU/条码/品牌/型号跨仓检索序列号(AC-F-004)",
  })
  search(@Query() query: InventorySearchQueryDto) {
    return this.inventory.search(query);
  }

  @Get("search/summary")
  @UseGuards(requirePermissions("inventory:read"))
  @ApiOperation({
    summary: "查货聚合视图:按商品汇总各仓库可售/占用数量(找货第一步)",
  })
  searchSummary(@Query() query: InventorySearchSummaryQueryDto) {
    return this.inventory.searchSummary(query.q);
  }

  @Get("serials/:id")
  @UseGuards(requirePermissions("inventory:read"))
  @ApiOperation({
    summary: "单机档案:序列号详情与完整库存流水时间线(AC-F-005)",
  })
  serialDetail(@Param("id", ParseUUIDPipe) id: string) {
    return this.inventory.serialDetail(id);
  }

  @Get("warehouses/:id/serials")
  @UseGuards(requirePermissions("inventory:read"))
  @ApiOperation({ summary: "指定仓库的序列号明细(分页,支持 SKU/IMEI/SN 搜索)" })
  warehouseSerials(
    @Param("id") id: string,
    @Query() query: WarehouseSerialsQueryDto,
  ) {
    return this.inventory.warehouseSerials(id, query);
  }
}
