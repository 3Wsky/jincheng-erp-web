import { Module } from "@nestjs/common";
import { StocktakeController } from "./stocktake.controller.js";
import { StocktakeFreezeService } from "./stocktake-freeze.service.js";
import { StocktakeService } from "./stocktake.service.js";

/**
 * 盘点模块:整仓盘点 + 盘点期间仓库封存。
 * StocktakeFreezeService 导出给调拨/采购/个人库存(未来含销售)做库存变动前的封存检查。
 */
@Module({
  controllers: [StocktakeController],
  providers: [StocktakeService, StocktakeFreezeService],
  exports: [StocktakeFreezeService],
})
export class StocktakeModule {}
