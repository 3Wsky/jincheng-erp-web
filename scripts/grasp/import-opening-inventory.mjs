/**
 * 库存期初迁移导入脚本(批量版,幂等可续跑):读取管家婆序列号库存 JSON,导入 ERP 数据库。
 *
 * 遵循 AGENTS.md:
 * - 库存变化必须由业务单据驱动 → 每台序列号生成一条 PURCHASE_RECEIPT 期初流水,
 *   统一使用一个期初单据 documentId,避免直接改余额。
 * - 序列号一机一码,IMEI/SN 全公司唯一。
 * - 幂等:已存在序列号跳过;仓库/商品/SKU 已存在则复用,并刷新仓库 type/责任人。
 *
 * 用法: node import-opening-inventory.mjs <json路径>
 */
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
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
  console.error("[import] 缺少 DATABASE_URL 环境变量");
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

function employeeMatchKey(name) {
  return String(name ?? "")
    .trim()
    .replace(/\d+$/, "");
}

async function main() {
  const database = createPrismaClient(connectionString);
  await database.$connect();
  console.log("[import] 已连接数据库");

  const payload = JSON.parse(await readFile(jsonPath, "utf-8"));
  const { warehouses, items, skippedDuplicates = [], source } = payload;
  const occurredAt = new Date(source?.occurredAt ?? "2026-08-17T12:50:51+08:00");
  console.log(
    `[import] 来源 ${source?.file ?? jsonPath} 重复跳过 ${skippedDuplicates.length} 条`,
  );

  const organization = await database.organization.findFirst();
  if (!organization) throw new Error("缺少默认组织,请先运行 db:seed");
  console.log(`[import] 组织 ${organization.name}`);

  const employees = await database.employee.findMany({
    where: { organizationId: organization.id, status: "ACTIVE" },
    select: { id: true, name: true, storeId: true },
  });
  const employeesByName = new Map();
  const ambiguousNames = new Set();
  for (const employee of employees) {
    const key = employeeMatchKey(employee.name);
    if (employeesByName.has(key)) ambiguousNames.add(key);
    else employeesByName.set(key, employee);
  }
  for (const name of ambiguousNames) employeesByName.delete(name);

  const warehouseByName = new Map();
  const existingWarehouses = await database.warehouse.findMany();
  for (const record of existingWarehouses) {
    warehouseByName.set(record.name, record);
  }

  let createdWarehouses = 0;
  let updatedWarehouses = 0;
  let personalLinked = 0;
  for (const warehouse of warehouses) {
    const owner =
      warehouse.type === "PERSONAL"
        ? employeesByName.get(employeeMatchKey(warehouse.name))
        : null;
    const existing = warehouseByName.get(warehouse.name);
    if (!existing) {
      const record = await database.warehouse.create({
        data: {
          code: warehouse.name,
          name: warehouse.name,
          type: warehouse.type,
          ownerEmployeeId: owner?.id ?? null,
          storeId: owner?.storeId ?? null,
        },
      });
      warehouseByName.set(warehouse.name, record);
      createdWarehouses += 1;
      if (owner) personalLinked += 1;
      continue;
    }
    const nextOwnerId =
      warehouse.type === "PERSONAL" ? (owner?.id ?? existing.ownerEmployeeId) : existing.ownerEmployeeId;
    if (existing.type !== warehouse.type || existing.ownerEmployeeId !== nextOwnerId) {
      const record = await database.warehouse.update({
        where: { id: existing.id },
        data: {
          type: warehouse.type,
          ownerEmployeeId: nextOwnerId,
        },
      });
      warehouseByName.set(warehouse.name, record);
      updatedWarehouses += 1;
    }
    if (warehouse.type === "PERSONAL" && nextOwnerId) personalLinked += 1;
  }
  console.log(
    `[import] 仓库新建 ${createdWarehouses} 更新类型/责任人 ${updatedWarehouses} 人名仓已挂员工 ${personalLinked}`,
  );

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

  const existingSerials = await database.serialItem.findMany({
    select: { imeiPrimary: true },
  });
  const existingSerialSet = new Set(existingSerials.map((s) => s.imeiPrimary));

  const pendingItems = items.filter(
    (item) =>
      item.serial &&
      !existingSerialSet.has(item.serial) &&
      warehouseByName.has(item.warehouseName) &&
      skuByCode.has(item.skuCode),
  );
  const skippedMissing = items.length - pendingItems.length - existingSerialSet.size;
  console.log(
    `[import] 待导入 ${pendingItems.length} 台(已有 ${existingSerialSet.size} 台跳过, 缺仓库或SKU ${Math.max(skippedMissing, 0)} 台)`,
  );

  const openingDocumentId = randomUUID();
  let created = 0;
  const BATCH = 50;
  for (let start = 0; start < pendingItems.length; start += BATCH) {
    const batch = pendingItems.slice(start, start + BATCH);
    for (const item of batch) {
      const warehouse = warehouseByName.get(item.warehouseName);
      const sku = skuByCode.get(item.skuCode);
      try {
        await database.$transaction(async (tx) => {
          const serial = await tx.serialItem.create({
            data: {
              skuId: sku.id,
              imeiPrimary: item.serial,
              currentWarehouseId: warehouse.id,
              responsibleEmployeeId: warehouse.ownerEmployeeId ?? null,
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
        });
        created += 1;
      } catch (error) {
        if (error?.code !== "P2002") throw error;
      }
    }
    console.log(`[import] 已导入 ${created}/${pendingItems.length} 台…`);
  }

  const byType = await database.warehouse.groupBy({
    by: ["type"],
    _count: { id: true },
  });
  const serialCount = await database.serialItem.count();
  const movementCount = await database.inventoryMovement.count({
    where: { documentType: "OPENING_BALANCE" },
  });
  console.log(`[import] 完成: 本次新增 ${created} 台; 库内序列号 ${serialCount}; 期初流水 ${movementCount}`);
  console.log("[import] 仓库类型", Object.fromEntries(byType.map((row) => [row.type, row._count.id])));
  await database.$disconnect();
}

main().catch(async (error) => {
  console.error("[import] 导入失败:", error);
  process.exitCode = 1;
});
