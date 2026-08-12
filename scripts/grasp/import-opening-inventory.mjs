/**
 * 库存期初迁移导入脚本(批量版,幂等可续跑):读取管家婆序列号库存 JSON,导入 ERP 数据库。
 *
 * 遵循 AGENTS.md:
 * - 库存变化必须由业务单据驱动 → 每台序列号生成一条 PURCHASE_RECEIPT 期初流水,
 *   统一使用一个期初单据 documentId,避免直接改余额。
 * - 序列号一机一码,IMEI/SN 全公司唯一。
 * - 幂等:已存在序列号跳过;仓库/商品/SKU 已存在则复用。
 *
 * 用法: node import-opening-inventory.mjs <json路径>
 */
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const require = createRequire(import.meta.url);
const { createPrismaClient } = require("../../packages/database/dist/index.js");

// 安全要求：连接串只从环境变量读取，禁止把数据库密码写进代码仓库
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("[import] 缺少 DATABASE_URL 环境变量（可在根目录 .env 配置后用 dotenv 方式注入）");
  process.exit(1);
}

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error("用法: node import-opening-inventory.mjs <json路径>");
  process.exit(1);
}

const TYPE_TO_STATUS = {
  PERSONAL: "PERSONAL",
};

async function main() {
  const database = createPrismaClient(connectionString);
  await database.$connect();
  console.log("[import] 已连接数据库");

  const payload = JSON.parse(await readFile(jsonPath, "utf-8"));
  const { warehouses, items } = payload;

  const organization = await database.organization.findFirst({
    where: { name: "锦程科技" },
  });
  if (!organization) throw new Error("缺少默认组织,请先运行 db:seed");

  // 1. 仓库:已存在跳过
  const warehouseByCode = new Map();
  const existingWarehouses = await database.warehouse.findMany({
    select: { id: true, code: true, name: true },
  });
  for (const record of existingWarehouses) {
    warehouseByCode.set(record.name, record);
  }
  for (const warehouse of warehouses) {
    if (!warehouseByCode.has(warehouse.name)) {
      const record = await database.warehouse.create({
        data: {
          code: warehouse.code,
          name: warehouse.name,
          type: warehouse.type,
        },
      });
      warehouseByCode.set(warehouse.name, record);
      console.log(`[import] 创建仓库 ${warehouse.name} (${warehouse.type})`);
    }
  }

  // 2. 商品/SKU:已存在跳过,新 SKU 用 createMany 批量
  const skuByCode = new Map();
  const existingSkus = await database.sku.findMany({
    select: { id: true, code: true, name: true, productId: true },
  });
  for (const record of existingSkus) {
    skuByCode.set(record.code, record);
  }
  const newSkus = items.filter(
    (item) => item.skuCode && !skuByCode.has(item.skuCode),
  );
  const uniqueNewSkus = [
    ...new Map(newSkus.map((item) => [item.skuCode, item])).values(),
  ];
  if (uniqueNewSkus.length > 0) {
    // 商品与 SKU 一一对应:先用 Product 批量建
    const productData = uniqueNewSkus.map((item) => ({
      organizationId: organization.id,
      code: item.skuCode,
      brand: "",
      category: "",
      modelName: item.skuName || item.skuCode,
      classificationStatus: "PENDING",
    }));
    const createdProducts = await database.$transaction(
      productData.map((data) => database.product.create({ data })),
    );
    const skuData = createdProducts.map((product, index) => ({
      productId: product.id,
      code: uniqueNewSkus[index].skuCode,
      name: uniqueNewSkus[index].skuName || uniqueNewSkus[index].skuCode,
      serialManaged: true,
    }));
    const createdSkus = await database.$transaction(
      skuData.map((data) => database.sku.create({ data })),
    );
    createdSkus.forEach((sku) => skuByCode.set(sku.code, sku));
    console.log(`[import] 创建商品/SKU ${createdSkus.length} 个`);
  }

  // 3. 序列号:已存在跳过
  const existingSerials = await database.serialItem.findMany({
    select: { imeiPrimary: true },
    where: { imeiPrimary: { in: items.map((item) => item.serial) } },
  });
  const existingSerialSet = new Set(existingSerials.map((s) => s.imeiPrimary));

  const pendingItems = items.filter(
    (item) =>
      item.serial &&
      !existingSerialSet.has(item.serial) &&
      warehouseByCode.has(item.warehouseName) &&
      skuByCode.has(item.skuCode),
  );
  console.log(
    `[import] 待导入 ${pendingItems.length} 台(已有 ${existingSerialSet.size} 台跳过)`,
  );

  const openingDocumentId = randomUUID();
  const occurredAt = new Date("2026-08-11T10:55:00+08:00");

  let created = 0;
  const BATCH = 100;
  for (let start = 0; start < pendingItems.length; start += BATCH) {
    const batch = pendingItems.slice(start, start + BATCH);
    await database.$transaction(
      async (tx) => {
        for (const item of batch) {
          const warehouse = warehouseByCode.get(item.warehouseName);
          const sku = skuByCode.get(item.skuCode);
          const serial = await tx.serialItem.create({
            data: {
              skuId: sku.id,
              imeiPrimary: item.serial,
              currentWarehouseId: warehouse.id,
              status: TYPE_TO_STATUS[warehouse.type] ?? "NORMAL",
              unitCost: 0,
              receivedAt: occurredAt,
            },
          });
          await tx.inventoryMovement.create({
            data: {
              documentId: openingDocumentId,
              documentType: "OPENING_BALANCE",
              movementType: "PURCHASE_RECEIPT",
              skuId: sku.id,
              serialId: serial.id,
              quantity: 1,
              toWarehouseId: warehouse.id,
              occurredAt,
            },
          });
        }
      },
      { timeout: 60000 },
    );
    created += batch.length;
    console.log(`[import] 已导入 ${created}/${pendingItems.length} 台…`);
  }

  console.log(`[import] 完成: 本次新增 ${created} 台`);
  await database.$disconnect();
}

main().catch(async (error) => {
  console.error("[import] 导入失败:", error);
  process.exitCode = 1;
});
