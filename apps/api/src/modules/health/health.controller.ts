import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

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
    };
  }
}

