import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/auth.guard.js";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import { TasksService } from "./tasks.service.js";

/**
 * 我的待办:登录即可访问,分组内容在服务端按用户权限过滤
 * (出纳只见待付款、库管只见待收货/发出等)。
 */
@ApiTags("tasks")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("tasks")
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get("summary")
  @ApiOperation({
    summary: "待办汇总:按当前用户权限聚合调拨/采购/盘点/异常设备事项",
  })
  summary(@Req() request: AuthenticatedRequest) {
    return this.tasks.summary(request);
  }
}
