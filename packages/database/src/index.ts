import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

export * from "./generated/prisma/client.js";
export * from "./security.js";

export function createPrismaClient(connectionString: string): PrismaClient {
  if (!connectionString.trim()) {
    throw new Error("DATABASE_URL 不能为空");
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
}
