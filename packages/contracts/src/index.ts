import { z } from "zod";

export const HealthResponseSchema = z.object({
  service: z.literal("jincheng-erp-api"),
  status: z.literal("ok"),
  time: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const ProductStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);
export const CatalogClassificationStatusSchema = z.enum([
  "PENDING",
  "CONFIRMED",
]);

export const CatalogSkuSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  barcode: z.string().nullable(),
  barcodes: z.array(z.string()),
  color: z.string().nullable(),
  capacity: z.string().nullable(),
  serialManaged: z.boolean(),
  status: ProductStatusSchema,
});

export const CatalogProductSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  brand: z.string(),
  category: z.string(),
  modelName: z.string(),
  status: ProductStatusSchema,
  classificationStatus: CatalogClassificationStatusSchema,
  skus: z.array(CatalogSkuSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const CatalogProductListSchema = z.object({
  items: z.array(CatalogProductSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const CreateCatalogSkuSchema = z.object({
  code: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  barcode: z.string().trim().min(1).max(100).optional(),
  additionalBarcodes: z
    .array(z.string().trim().min(1).max(100))
    .max(20)
    .default([]),
  color: z.string().trim().max(100).optional(),
  capacity: z.string().trim().max(100).optional(),
  serialManaged: z.boolean().default(false),
});

export const CreateCatalogProductSchema = z.object({
  organizationId: z.uuid(),
  code: z.string().trim().min(1).max(100),
  brand: z.string().trim().min(1).max(100),
  category: z.string().trim().min(1).max(100),
  modelName: z.string().trim().min(1).max(200),
  skus: z.array(CreateCatalogSkuSchema).min(1).max(100),
});

export const UpdateCatalogProductSchema = z
  .object({
    brand: z.string().trim().min(1).max(100).optional(),
    category: z.string().trim().min(1).max(100).optional(),
    modelName: z.string().trim().min(1).max(200).optional(),
    status: ProductStatusSchema.optional(),
    classificationStatus: CatalogClassificationStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "至少提供一个待修改字段");

export const CatalogImportStatusSchema = z.enum([
  "PREVIEW",
  "APPLIED",
  "REJECTED",
]);

export const CatalogImportBatchSchema = z.object({
  id: z.uuid(),
  sourceSystem: z.string(),
  sourceRef: z.string(),
  sourceCapturedAt: z.iso.datetime(),
  status: CatalogImportStatusSchema,
  totalRows: z.number().int().nonnegative(),
  validRows: z.number().int().nonnegative(),
  invalidRows: z.number().int().nonnegative(),
  uniqueSkus: z.number().int().nonnegative(),
  warehouseCount: z.number().int().nonnegative(),
  appliedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  duplicate: z.boolean().optional(),
});

export const CatalogImportApplyResultSchema = z.object({
  batch: CatalogImportBatchSchema,
  productsCreated: z.number().int().nonnegative(),
  productsUpdated: z.number().int().nonnegative(),
  skusCreated: z.number().int().nonnegative(),
  skusUpdated: z.number().int().nonnegative(),
  serialRowsStaged: z.number().int().nonnegative(),
  inventoryRowsCreated: z.literal(0),
});

export type ProductStatus = z.infer<typeof ProductStatusSchema>;
export type CatalogClassificationStatus = z.infer<
  typeof CatalogClassificationStatusSchema
>;
export type CatalogSku = z.infer<typeof CatalogSkuSchema>;
export type CatalogProduct = z.infer<typeof CatalogProductSchema>;
export type CatalogProductList = z.infer<typeof CatalogProductListSchema>;
export type CreateCatalogSku = z.input<typeof CreateCatalogSkuSchema>;
export type CreateCatalogProduct = z.input<typeof CreateCatalogProductSchema>;
export type UpdateCatalogProduct = z.input<typeof UpdateCatalogProductSchema>;
export type CatalogImportBatch = z.infer<typeof CatalogImportBatchSchema>;
export type CatalogImportApplyResult = z.infer<
  typeof CatalogImportApplyResultSchema
>;
