import { Module } from "@nestjs/common";
import { StocktakeModule } from "../stocktake/stocktake.module.js";
import { PersonalStockController } from "./personal-stock.controller.js";
import { PersonalStockService } from "./personal-stock.service.js";

/** 个人库存:领用/归还/转交握手 + 我的库存(AC-F-007) */
@Module({
  imports: [StocktakeModule],
  controllers: [PersonalStockController],
  providers: [PersonalStockService],
})
export class PersonalStockModule {}
