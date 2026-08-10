import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DatabaseModule } from "./database/database.module.js";
import { CatalogModule } from "./modules/catalog/catalog.module.js";
import { HealthController } from "./modules/health/health.controller.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["../../.env", ".env"],
    }),
    DatabaseModule,
    CatalogModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
