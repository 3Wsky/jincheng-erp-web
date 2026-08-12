import { Module } from "@nestjs/common";
import { StocktakeModule } from "../stocktake/stocktake.module.js";
import { TransferController } from "./transfer.controller.js";
import { TransferService } from "./transfer.service.js";

/** 调拨模块:仓库间序列号商品调拨,双向握手 + 单据驱动库存流水 */
@Module({
  imports: [StocktakeModule],
  controllers: [TransferController],
  providers: [TransferService],
})
export class TransferModule {}
