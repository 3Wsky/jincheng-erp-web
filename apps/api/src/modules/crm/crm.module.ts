import { Module } from "@nestjs/common";
import { CrmController } from "./crm.controller.js";
import { CrmService } from "./crm.service.js";

/** 客户管理模块(AC-F-015/016):客户主档 + 回访;合并功能待去重规则签字 */
@Module({
  controllers: [CrmController],
  providers: [CrmService],
})
export class CrmModule {}
