import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { CatalogController } from "./catalog.controller.js";
import { CatalogService } from "./catalog.service.js";
import { CatalogWriteGuard } from "./catalog-write.guard.js";
import { PriceFeedService } from "./price-feed.service.js";

@Module({
  imports: [AuthModule],
  controllers: [CatalogController],
  providers: [CatalogService, CatalogWriteGuard, PriceFeedService],
})
export class CatalogModule {}
