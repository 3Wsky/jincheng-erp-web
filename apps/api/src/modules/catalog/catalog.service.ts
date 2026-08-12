import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  CatalogClassificationStatus,
  CatalogImportRowStatus,
  CatalogImportStatus,
  Prisma,
  ProductStatus,
} from "@jincheng/database";
import { createHash, randomUUID } from "node:crypto";
import { basename } from "node:path";
import { readFile, realpath, stat } from "node:fs/promises";
import { DatabaseService } from "../../database/database.service.js";
import {
  ApplyCatalogImportDto,
  CreateCatalogProductDto,
  CreateCatalogSkuDto,
  ListCatalogProductsQueryDto,
  UpdateCatalogProductDto,
  UpdateCatalogSkuDto,
} from "./catalog.dto.js";
import {
  MAX_GRASP_CDS_BYTES,
  parseGraspCatalogCds,
} from "./grasp-cds.parser.js";

const productInclude = {
  skus: {
    orderBy: { code: "asc" },
    include: {
      barcodes: { orderBy: [{ isPrimary: "desc" }, { value: "asc" }] },
    },
  },
} satisfies Prisma.ProductInclude;

type ProductRecord = Prisma.ProductGetPayload<{
  include: typeof productInclude;
}>;

@Injectable()
export class CatalogService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  async listProducts(query: ListCatalogProductsQueryDto) {
    const page = Math.max(1, query.page);
    const pageSize = Math.min(100, Math.max(1, query.pageSize));
    const search = query.search?.trim();
    const where: Prisma.ProductWhereInput = {
      status: query.status as ProductStatus | undefined,
      ...(search
        ? {
            OR: [
              { code: { contains: search, mode: "insensitive" } },
              { brand: { contains: search, mode: "insensitive" } },
              { category: { contains: search, mode: "insensitive" } },
              { modelName: { contains: search, mode: "insensitive" } },
              {
                skus: {
                  some: {
                    OR: [
                      { code: { contains: search, mode: "insensitive" } },
                      { name: { contains: search, mode: "insensitive" } },
                      { barcode: { contains: search, mode: "insensitive" } },
                      {
                        barcodes: {
                          some: {
                            value: { contains: search, mode: "insensitive" },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await this.database.client.$transaction([
      this.database.client.product.findMany({
        where,
        include: productInclude,
        orderBy: [{ updatedAt: "desc" }, { code: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.database.client.product.count({ where }),
    ]);
    return {
      items: items.map(mapProduct),
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
    };
  }

  async listOrganizations() {
    return this.database.client.organization.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  }

  async createProduct(
    input: CreateCatalogProductDto,
    requestId: string = randomUUID(),
    actorUserId: string | null = null,
  ) {
    const skuCodes = input.skus.map((sku) => sku.code.trim());
    if (new Set(skuCodes).size !== skuCodes.length) {
      throw new BadRequestException("同一商品内不能出现重复 SKU 编码");
    }
    assertUniqueBarcodes(input.skus);

    try {
      const created = await this.database.client.$transaction(async (tx) => {
        const organization = await tx.organization.findUnique({
          where: { id: input.organizationId },
        });
        if (!organization) throw new NotFoundException("组织不存在");
        const product = await tx.product.create({
          data: {
            organizationId: input.organizationId,
            code: input.code.trim(),
            brand: input.brand.trim(),
            category: input.category.trim(),
            modelName: input.modelName.trim(),
            status: ProductStatus.ACTIVE,
            classificationStatus: CatalogClassificationStatus.CONFIRMED,
            skus: { create: input.skus.map(skuCreateData) },
          },
          include: productInclude,
        });
        await writeAuditAndEvent(tx, {
          action: "CATALOG_PRODUCT_CREATED",
          resource: "Product",
          resourceId: product.id,
          requestId,
          actorUserId,
          afterData: { code: product.code, skuCount: product.skus.length },
        });
        return product;
      });
      return mapProduct(created);
    } catch (error) {
      rethrowKnownDatabaseConflict(error, "商品编码、SKU 编码或条码已存在");
    }
  }

  async updateProduct(
    id: string,
    input: UpdateCatalogProductDto,
    requestId: string = randomUUID(),
    actorUserId: string | null = null,
  ) {
    const data = compact({
      brand: input.brand?.trim(),
      category: input.category?.trim(),
      modelName: input.modelName?.trim(),
      status: input.status as ProductStatus | undefined,
      classificationStatus: input.classificationStatus as
        CatalogClassificationStatus | undefined,
    });
    if (Object.keys(data).length === 0)
      throw new BadRequestException("至少提供一个待修改字段");

    const updated = await this.database.client.$transaction(async (tx) => {
      const before = await tx.product.findUnique({
        where: { id },
        include: productInclude,
      });
      if (!before) throw new NotFoundException("商品不存在");
      const product = await tx.product.update({
        where: { id },
        data,
        include: productInclude,
      });
      await writeAuditAndEvent(tx, {
        action: "CATALOG_PRODUCT_UPDATED",
        resource: "Product",
        resourceId: id,
        requestId,
        actorUserId,
        beforeData: summarizeProduct(before),
        afterData: summarizeProduct(product),
      });
      return product;
    });
    return mapProduct(updated);
  }

  async addSku(
    productId: string,
    input: CreateCatalogSkuDto,
    requestId: string = randomUUID(),
    actorUserId: string | null = null,
  ) {
    assertUniqueBarcodes([input]);
    try {
      const product = await this.database.client.$transaction(async (tx) => {
        const exists = await tx.product.findUnique({
          where: { id: productId },
        });
        if (!exists) throw new NotFoundException("商品不存在");
        const sku = await tx.sku.create({
          data: { productId, ...skuCreateData(input) },
        });
        await writeAuditAndEvent(tx, {
          action: "CATALOG_SKU_CREATED",
          resource: "Sku",
          resourceId: sku.id,
          requestId,
          actorUserId,
          afterData: { code: sku.code, productId },
        });
        return tx.product.findUniqueOrThrow({
          where: { id: productId },
          include: productInclude,
        });
      });
      return mapProduct(product);
    } catch (error) {
      rethrowKnownDatabaseConflict(error, "SKU 编码或条码已存在");
    }
  }

  async updateSku(
    id: string,
    input: UpdateCatalogSkuDto,
    requestId: string = randomUUID(),
    actorUserId: string | null = null,
  ) {
    if (Object.values(input).every((value) => value === undefined)) {
      throw new BadRequestException("至少提供一个待修改字段");
    }
    if (input.barcode || input.additionalBarcodes) {
      assertUniqueBarcodes([
        {
          code: id,
          name: input.name ?? id,
          barcode: input.barcode,
          additionalBarcodes: input.additionalBarcodes ?? [],
          serialManaged: input.serialManaged ?? false,
        },
      ]);
    }

    try {
      const product = await this.database.client.$transaction(async (tx) => {
        const before = await tx.sku.findUnique({
          where: { id },
          include: { barcodes: true },
        });
        if (!before) throw new NotFoundException("SKU 不存在");
        const replaceBarcodes =
          input.barcode !== undefined || input.additionalBarcodes !== undefined;
        const primaryBarcode =
          input.barcode !== undefined
            ? input.barcode
            : (before.barcode ?? undefined);
        const existingAdditional = before.barcodes
          .map((barcode) => barcode.value)
          .filter((value) => value !== before.barcode);
        const additionalBarcodes =
          input.additionalBarcodes !== undefined
            ? input.additionalBarcodes
            : existingAdditional;
        const requestedBarcodes = [primaryBarcode, ...additionalBarcodes]
          .map((value) => value?.trim())
          .filter(Boolean) as string[];
        if (new Set(requestedBarcodes).size !== requestedBarcodes.length) {
          throw new BadRequestException("同一 SKU 不能重复使用条码");
        }
        const barcodes = normalizedBarcodes(primaryBarcode, additionalBarcodes);
        const data = compact({
          name: input.name?.trim(),
          barcode: input.barcode?.trim(),
          color: input.color?.trim(),
          capacity: input.capacity?.trim(),
          // null=清除定价,undefined=不修改(compact 只滤 undefined)
          retailPrice: input.retailPrice as string | null | undefined,
          serialManaged: input.serialManaged,
          status: input.status as ProductStatus | undefined,
        });
        await tx.sku.update({
          where: { id },
          data: {
            ...data,
            ...(replaceBarcodes
              ? {
                  barcodes: {
                    deleteMany: {},
                    create: barcodes.map((value, index) => ({
                      value,
                      isPrimary: index === 0,
                    })),
                  },
                }
              : {}),
          },
        });
        await writeAuditAndEvent(tx, {
          action: "CATALOG_SKU_UPDATED",
          resource: "Sku",
          resourceId: id,
          requestId,
          actorUserId,
          beforeData: {
            code: before.code,
            name: before.name,
            status: before.status,
          },
          afterData: data,
        });
        return tx.product.findUniqueOrThrow({
          where: { id: before.productId },
          include: productInclude,
        });
      });
      return mapProduct(product);
    } catch (error) {
      rethrowKnownDatabaseConflict(error, "条码已被其他 SKU 使用");
    }
  }

  async listImportBatches() {
    const batches = await this.database.client.catalogImportBatch.findMany({
      orderBy: [{ sourceCapturedAt: "desc" }, { createdAt: "desc" }],
      take: 30,
    });
    return batches.map((batch) => mapBatch(batch));
  }

  async previewBytestarImport() {
    const configuredPath = this.config.get<string>("GRASP_CDS_FILE")?.trim();
    if (!configuredPath) {
      throw new ServiceUnavailableException(
        "未配置 GRASP_CDS_FILE，无法读取智储星的管家婆 CDS 来源",
      );
    }

    let resolvedPath: string;
    let fileInfo;
    let content: Buffer;
    try {
      resolvedPath = await realpath(configuredPath);
      fileInfo = await stat(resolvedPath);
      if (!fileInfo.isFile()) throw new Error("not a file");
      if (fileInfo.size > MAX_GRASP_CDS_BYTES) {
        throw new UnprocessableEntityException(
          "管家婆 CDS 文件超过 50MB 安全上限",
        );
      }
      content = await readFile(resolvedPath);
    } catch (error) {
      if (error instanceof UnprocessableEntityException) throw error;
      throw new ServiceUnavailableException("管家婆 CDS 文件不存在或不可读");
    }

    const contentHash = createHash("sha256").update(content).digest("hex");
    const duplicate = await this.database.client.catalogImportBatch.findUnique({
      where: { contentHash },
    });
    if (duplicate) return mapBatch(duplicate, true);

    const parsed = parseGraspCatalogCds(content);
    const batch = await this.database.client.$transaction(
      async (tx) => {
        const created = await tx.catalogImportBatch.create({
          data: {
            sourceSystem: "GRASP",
            sourceRef: basename(resolvedPath),
            sourceCapturedAt: fileInfo.mtime,
            contentHash,
            status: CatalogImportStatus.PREVIEW,
            totalRows: parsed.totalRows,
            validRows: parsed.validRows,
            invalidRows: parsed.invalidRows,
            uniqueSkus: parsed.uniqueSkus,
            warehouseCount: parsed.warehouseCount,
            metadata: {
              parserVersion: 1,
              duplicateSerials: parsed.duplicateSerials,
              conflictingSkuNames: parsed.conflictingSkuNames,
              inventoryApplicationBlocked: true,
            },
            document: {
              create: {
                fileName: basename(resolvedPath),
                content: Uint8Array.from(content),
              },
            },
          },
        });
        for (let start = 0; start < parsed.rows.length; start += 400) {
          const chunk = parsed.rows.slice(start, start + 400);
          await tx.catalogImportRow.createMany({
            data: chunk.map((row, index) => ({
              batchId: created.id,
              rowNumber: start + index + 1,
              sourceSkuCode: row.sourceSkuCode,
              sourceName: row.sourceName,
              sourceWarehouseCode: row.sourceWarehouseCode,
              sourceWarehouseName: row.sourceWarehouseName,
              sourceSerial: row.sourceSerial,
              quantity: row.quantity,
              status:
                row.errorCodes.length === 0
                  ? CatalogImportRowStatus.VALID
                  : CatalogImportRowStatus.INVALID,
              errorCodes: row.errorCodes,
              normalizedData: { sourceRowNumber: row.rowNumber },
            })),
          });
        }
        return created;
      },
      { maxWait: 10_000, timeout: 120_000 },
    );
    return mapBatch(batch);
  }

  async applyImport(
    batchId: string,
    input: ApplyCatalogImportDto,
    requestId: string = randomUUID(),
    actorUserId: string | null = null,
  ) {
    return this.database.client.$transaction(
      async (tx) => {
        const organization = await tx.organization.findUnique({
          where: { id: input.organizationId },
        });
        if (!organization) throw new NotFoundException("组织不存在");
        const batch = await tx.catalogImportBatch.findUnique({
          where: { id: batchId },
        });
        if (!batch) throw new NotFoundException("导入批次不存在");
        if (batch.status === CatalogImportStatus.REJECTED) {
          throw new ConflictException("已拒绝的导入批次不能应用");
        }
        if (batch.status === CatalogImportStatus.APPLIED) {
          return applyResultFromBatch(batch);
        }

        const validRows = await tx.catalogImportRow.findMany({
          where: { batchId, status: CatalogImportRowStatus.VALID },
          orderBy: { rowNumber: "asc" },
        });
        if (validRows.length === 0) {
          throw new UnprocessableEntityException(
            "该批次没有可应用的有效货品行",
          );
        }

        const grouped = new Map<string, (typeof validRows)[number][]>();
        for (const row of validRows) {
          const group = grouped.get(row.sourceSkuCode) ?? [];
          group.push(row);
          grouped.set(row.sourceSkuCode, group);
        }

        let productsCreated = 0;
        let productsUpdated = 0;
        let skusCreated = 0;
        let skusUpdated = 0;
        for (const [sourceSkuCode, rows] of grouped) {
          const sourceName = rows[0]!.sourceName;
          const existingIdentity = await tx.skuExternalIdentity.findUnique({
            where: {
              sourceSystem_sourceId: {
                sourceSystem: "GRASP",
                sourceId: sourceSkuCode,
              },
            },
            include: { sku: { include: { product: true } } },
          });

          let productId: string;
          let skuId: string;
          if (existingIdentity) {
            if (
              existingIdentity.sku.product.organizationId !==
              input.organizationId
            ) {
              throw new ConflictException(
                `管家婆编码 ${sourceSkuCode} 已绑定到其他组织`,
              );
            }
            productId = existingIdentity.sku.productId;
            skuId = existingIdentity.skuId;
            await tx.skuExternalIdentity.update({
              where: { id: existingIdentity.id },
              data: { importBatchId: batchId, sourcePayload: { sourceName } },
            });
            if (
              existingIdentity.sku.product.classificationStatus ===
              CatalogClassificationStatus.PENDING
            ) {
              await tx.product.update({
                where: { id: productId },
                data: { modelName: sourceName },
              });
              await tx.sku.update({
                where: { id: skuId },
                data: { name: sourceName, serialManaged: true },
              });
            }
            productsUpdated += 1;
            skusUpdated += 1;
          } else {
            const existingSku = await tx.sku.findUnique({
              where: { code: sourceSkuCode },
              include: { product: true },
            });
            if (
              existingSku &&
              existingSku.product.organizationId !== input.organizationId
            ) {
              throw new ConflictException(
                `SKU 编码 ${sourceSkuCode} 已被其他组织使用`,
              );
            }

            if (existingSku) {
              productId = existingSku.productId;
              skuId = existingSku.id;
              await tx.sku.update({
                where: { id: skuId },
                data: {
                  ...(existingSku.product.classificationStatus ===
                  CatalogClassificationStatus.PENDING
                    ? { name: sourceName }
                    : {}),
                  serialManaged: true,
                  externalIdentities: {
                    create: {
                      sourceSystem: "GRASP",
                      sourceId: sourceSkuCode,
                      sourcePayload: { sourceName },
                      importBatchId: batchId,
                    },
                  },
                },
              });
              productsUpdated += 1;
              skusUpdated += 1;
            } else {
              const existingProduct = await tx.product.findUnique({
                where: {
                  organizationId_code: {
                    organizationId: input.organizationId,
                    code: sourceSkuCode,
                  },
                },
              });
              if (existingProduct) {
                const sku = await tx.sku.create({
                  data: {
                    productId: existingProduct.id,
                    code: sourceSkuCode,
                    name: sourceName,
                    serialManaged: true,
                    externalIdentities: {
                      create: {
                        sourceSystem: "GRASP",
                        sourceId: sourceSkuCode,
                        sourcePayload: { sourceName },
                        importBatchId: batchId,
                      },
                    },
                  },
                });
                productId = existingProduct.id;
                skuId = sku.id;
                productsUpdated += 1;
                skusCreated += 1;
              } else {
                const product = await tx.product.create({
                  data: {
                    organizationId: input.organizationId,
                    code: sourceSkuCode,
                    brand: "待归类",
                    category: "待归类",
                    modelName: sourceName,
                    classificationStatus: CatalogClassificationStatus.PENDING,
                    skus: {
                      create: {
                        code: sourceSkuCode,
                        name: sourceName,
                        serialManaged: true,
                        externalIdentities: {
                          create: {
                            sourceSystem: "GRASP",
                            sourceId: sourceSkuCode,
                            sourcePayload: { sourceName },
                            importBatchId: batchId,
                          },
                        },
                      },
                    },
                  },
                  include: { skus: true },
                });
                productId = product.id;
                skuId = product.skus[0]!.id;
                productsCreated += 1;
                skusCreated += 1;
              }
            }
          }

          await tx.catalogImportRow.updateMany({
            where: {
              batchId,
              sourceSkuCode,
              status: CatalogImportRowStatus.VALID,
            },
            data: {
              status: CatalogImportRowStatus.APPLIED,
              appliedProductId: productId,
              appliedSkuId: skuId,
            },
          });
        }

        const summary = {
          productsCreated,
          productsUpdated,
          skusCreated,
          skusUpdated,
          serialRowsStaged: validRows.filter((row) => Boolean(row.sourceSerial))
            .length,
          inventoryRowsCreated: 0 as const,
        };
        const metadata = {
          ...jsonObject(batch.metadata),
          applySummary: summary,
        };
        const updatedBatch = await tx.catalogImportBatch.update({
          where: { id: batchId },
          data: {
            status: CatalogImportStatus.APPLIED,
            appliedAt: new Date(),
            metadata,
          },
        });
        await writeAuditAndEvent(tx, {
          action: "CATALOG_IMPORT_APPLIED",
          resource: "CatalogImportBatch",
          resourceId: batchId,
          requestId,
          actorUserId,
          afterData: { organizationId: input.organizationId, ...summary },
        });
        return { batch: mapBatch(updatedBatch), ...summary };
      },
      { maxWait: 10_000, timeout: 120_000 },
    );
  }
}

function skuCreateData(input: CreateCatalogSkuDto) {
  const barcodes = normalizedBarcodes(input.barcode, input.additionalBarcodes);
  return {
    code: input.code.trim(),
    name: input.name.trim(),
    barcode: input.barcode?.trim(),
    color: input.color?.trim(),
    capacity: input.capacity?.trim(),
    retailPrice: input.retailPrice ?? null,
    serialManaged: input.serialManaged,
    status: ProductStatus.ACTIVE,
    barcodes: {
      create: barcodes.map((value, index) => ({
        value,
        isPrimary: index === 0,
      })),
    },
  };
}

function normalizedBarcodes(
  primary: string | undefined,
  additional: string[],
): string[] {
  return [
    ...new Set(
      [primary, ...additional]
        .map((value) => value?.trim())
        .filter(Boolean) as string[],
    ),
  ];
}

function assertUniqueBarcodes(skus: CreateCatalogSkuDto[]): void {
  const all = skus.flatMap((sku) =>
    normalizedBarcodes(sku.barcode, sku.additionalBarcodes),
  );
  if (new Set(all).size !== all.length)
    throw new BadRequestException("同一请求内不能重复使用条码");
}

function mapProduct(product: ProductRecord) {
  return {
    id: product.id,
    code: product.code,
    brand: product.brand,
    category: product.category,
    modelName: product.modelName,
    status: product.status,
    classificationStatus: product.classificationStatus,
    skus: product.skus.map((sku) => ({
      id: sku.id,
      code: sku.code,
      name: sku.name,
      barcode: sku.barcode,
      barcodes: sku.barcodes.map((barcode) => barcode.value),
      color: sku.color,
      capacity: sku.capacity,
      retailPrice: sku.retailPrice?.toString() ?? null,
      serialManaged: sku.serialManaged,
      status: sku.status,
    })),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

function summarizeProduct(product: ProductRecord): Prisma.InputJsonObject {
  return {
    code: product.code,
    brand: product.brand,
    category: product.category,
    modelName: product.modelName,
    status: product.status,
    classificationStatus: product.classificationStatus,
  };
}

function mapBatch(
  batch: {
    id: string;
    sourceSystem: string;
    sourceRef: string;
    sourceCapturedAt: Date;
    status: CatalogImportStatus;
    totalRows: number;
    validRows: number;
    invalidRows: number;
    uniqueSkus: number;
    warehouseCount: number;
    appliedAt: Date | null;
    createdAt: Date;
  },
  duplicate?: boolean,
) {
  return {
    id: batch.id,
    sourceSystem: batch.sourceSystem,
    sourceRef: batch.sourceRef,
    sourceCapturedAt: batch.sourceCapturedAt.toISOString(),
    status: batch.status,
    totalRows: batch.totalRows,
    validRows: batch.validRows,
    invalidRows: batch.invalidRows,
    uniqueSkus: batch.uniqueSkus,
    warehouseCount: batch.warehouseCount,
    appliedAt: batch.appliedAt?.toISOString() ?? null,
    createdAt: batch.createdAt.toISOString(),
    ...(duplicate === undefined ? {} : { duplicate }),
  };
}

function applyResultFromBatch(batch: {
  id: string;
  sourceSystem: string;
  sourceRef: string;
  sourceCapturedAt: Date;
  status: CatalogImportStatus;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  uniqueSkus: number;
  warehouseCount: number;
  appliedAt: Date | null;
  createdAt: Date;
  metadata: Prisma.JsonValue;
}) {
  const metadata = jsonObject(batch.metadata);
  const summary = jsonObject(metadata.applySummary);
  return {
    batch: mapBatch(batch),
    productsCreated: numberValue(summary.productsCreated),
    productsUpdated: numberValue(summary.productsUpdated),
    skusCreated: numberValue(summary.skusCreated),
    skusUpdated: numberValue(summary.skusUpdated),
    serialRowsStaged: numberValue(summary.serialRowsStaged),
    inventoryRowsCreated: 0 as const,
  };
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function jsonObject(value: unknown): Record<string, Prisma.InputJsonValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Prisma.InputJsonValue>)
    : {};
}

function compact<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as Partial<T>;
}

async function writeAuditAndEvent(
  tx: Prisma.TransactionClient,
  input: {
    action: string;
    resource: string;
    resourceId: string;
    requestId: string;
    actorUserId?: string | null;
    beforeData?: Prisma.InputJsonObject;
    afterData: Prisma.InputJsonObject;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId,
      requestId: input.requestId,
      actorUserId: input.actorUserId ?? null,
      beforeData: input.beforeData,
      afterData: input.afterData,
    },
  });
  await tx.outboxEvent.create({
    data: {
      aggregateType: input.resource,
      aggregateId: input.resourceId,
      eventType: input.action,
      payload: input.afterData,
    },
  });
}

function rethrowKnownDatabaseConflict(error: unknown, message: string): never {
  if (
    error instanceof NotFoundException ||
    error instanceof BadRequestException
  )
    throw error;
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    throw new ConflictException(message);
  }
  throw error;
}
