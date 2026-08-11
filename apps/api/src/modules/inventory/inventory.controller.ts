import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";
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
