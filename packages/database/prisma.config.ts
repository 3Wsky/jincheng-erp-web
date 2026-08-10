import "dotenv/config";
import { defineConfig } from "prisma/config";

const developmentDatabaseUrl =
  "postgresql://jincheng_erp:change_me@localhost:5432/jincheng_erp";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? developmentDatabaseUrl,
  },
});
