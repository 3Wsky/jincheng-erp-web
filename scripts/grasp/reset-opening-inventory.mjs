/**
 * 清空演练库中的库存业务单据与序列号，保留组织/账号/商品/仓库主档。
 *
 * 用法: node reset-opening-inventory.mjs --yes
 */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const { createPrismaClient } = require("../../packages/database/dist/index.js");

function loadEnvFile(file) {
  const result = {};
  if (!existsSync(file)) return result;
  const text = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

const dotenv = loadEnvFile(path.join(ROOT, ".env"));
const connectionString = process.env.DATABASE_URL ?? dotenv.DATABASE_URL;
if (!connectionString) {
  console.error("[reset] 缺少 DATABASE_URL");
  process.exit(1);
}
if (!process.argv.includes("--yes")) {
  console.error("[reset] 将删除调拨/采购/盘点/个人库存/序列号/流水。确认后加 --yes");
  process.exit(1);
}

async function main() {
  const database = createPrismaClient(connectionString);
  await database.$connect();
  const before = {
    serials: await database.serialItem.count(),
    movements: await database.inventoryMovement.count(),
    transfers: await database.transferOrder.count(),
    purchases: await database.purchaseOrder.count(),
    stocktakes: await database.stocktakeOrder.count(),
    personal: await database.personalStockOrder.count(),
  };
  console.log("[reset] before", before);

  await database.$transaction(
    async (tx) => {
      await tx.personalStockLine.deleteMany();
      await tx.personalStockOrder.deleteMany();
      await tx.stocktakeScan.deleteMany();
      await tx.stocktakeDifference.deleteMany();
      await tx.stocktakeOrder.deleteMany();
      await tx.transferLine.deleteMany();
      await tx.transferOrder.deleteMany();
      await tx.purchaseReceiptItem.deleteMany();
      await tx.purchaseReceipt.deleteMany();
      await tx.purchasePayment.deleteMany();
      await tx.purchaseLine.deleteMany();
      await tx.purchaseOrder.deleteMany();
      await tx.inventoryMovement.deleteMany();
      await tx.serialItem.deleteMany();
    },
    { timeout: 120000 },
  );

  const after = {
    serials: await database.serialItem.count(),
    movements: await database.inventoryMovement.count(),
    transfers: await database.transferOrder.count(),
    purchases: await database.purchaseOrder.count(),
    stocktakes: await database.stocktakeOrder.count(),
    personal: await database.personalStockOrder.count(),
  };
  console.log("[reset] after", after);
  await database.$disconnect();
}

main().catch(async (error) => {
  console.error("[reset] 失败:", error);
  process.exitCode = 1;
});
