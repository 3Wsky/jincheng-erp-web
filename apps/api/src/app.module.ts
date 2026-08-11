import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DatabaseModule } from "./database/database.module.js";
import { AuditModule } from "./modules/audit/audit.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { CatalogModule } from "./modules/catalog/catalog.module.js";
import { HealthController } from "./modules/health/health.controller.js";
import { InventoryModule } from "./modules/inventory/inventory.module.js";
import { OrganizationModule } from "./modules/organization/organization.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["../../.env", ".env"],
    }),
    DatabaseModule,
    AuditModule,
    AuthModule,
    CatalogModule,
    OrganizationModule,
    InventoryModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
