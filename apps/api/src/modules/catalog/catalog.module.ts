import { Module } from "@nestjs/common";
import { CatalogController } from "./catalog.controller.js";
import { CatalogService } from "./catalog.service.js";
import { CatalogWriteGuard } from "./catalog-write.guard.js";

@Module({
  controllers: [CatalogController],
  providers: [CatalogService, CatalogWriteGuard],
})
export class CatalogModule {}
