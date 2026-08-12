import { Module } from "@nestjs/common";
import { StocktakeModule } from "../stocktake/stocktake.module.js";
import { ProcurementController } from "./procurement.controller.js";
import { ProcurementService } from "./procurement.service.js";

/** 采购模块:供应商主档 + 采购单三维度状态机(审批/付款/收货) + 扫码收货入库 */
@Module({
  imports: [StocktakeModule],
  controllers: [ProcurementController],
  providers: [ProcurementService],
})
export class ProcurementModule {}
