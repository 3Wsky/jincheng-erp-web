import { Module } from "@nestjs/common";
import { TasksController } from "./tasks.controller.js";
import { TasksService } from "./tasks.service.js";

/** 我的待办:业务单据状态实时推导的跨模块待办聚合 */
@Module({
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
