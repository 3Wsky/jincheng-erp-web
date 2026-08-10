import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createPrismaClient, type PrismaClient } from "@jincheng/database";

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  readonly client: PrismaClient;

  constructor(config: ConfigService) {
    const connectionString = config.get<string>("DATABASE_URL");
    if (!connectionString) {
      throw new Error("缺少 DATABASE_URL，API 无法连接 ERP 数据库");
    }
    this.client = createPrismaClient(connectionString);
  }

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
