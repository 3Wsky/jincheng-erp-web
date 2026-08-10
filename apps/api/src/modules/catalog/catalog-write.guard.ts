import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeEqual } from "node:crypto";

@Injectable()
export class CatalogWriteGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>("CATALOG_WRITE_KEY")?.trim();
    const environment = this.config.get<string>("NODE_ENV") ?? "development";
    if (!expected && environment !== "production") return true;
    if (!expected) {
      throw new ServiceUnavailableException(
        "生产环境未配置 CATALOG_WRITE_KEY，货品写接口已关闭",
      );
    }

    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const raw = request.headers["x-catalog-write-key"];
    const provided = Array.isArray(raw) ? raw[0] : raw;
    if (!provided || !sameSecret(expected, provided)) {
      throw new UnauthorizedException("缺少或无效的货品写入凭证");
    }
    return true;
  }
}

function sameSecret(expected: string, provided: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  return left.length === right.length && timingSafeEqual(left, right);
}
