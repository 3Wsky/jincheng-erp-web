import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

/** 进程启动时间：用于判断服务是否按预期重启/热加载 */
const STARTED_AT = new Date().toISOString();

@ApiTags("system")
@Controller("health")
export class HealthController {
  @Get()
  @ApiOperation({ summary: "服务健康检查" })
  health() {
    return {
      service: "jincheng-erp-api",
      status: "ok",
      time: new Date().toISOString(),
      startedAt: STARTED_AT,
    };
  }
}

