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

// ---- 认证与会话 ----

export const EmployeeStatusSchema = z.enum(["ACTIVE", "LEAVING", "INACTIVE"]);

export const AuthUserRoleSchema = z.object({
  roleId: z.uuid(),
  roleCode: z.string(),
  roleName: z.string(),
  dataScope: z.string(),
  approvalLimit: z.string().nullable(),
});

export const AuthUserSchema = z.object({
  userId: z.uuid(),
  username: z.string(),
  employeeId: z.uuid(),
  employeeNo: z.string(),
  employeeName: z.string(),
  status: EmployeeStatusSchema,
  isFrozen: z.boolean(),
  organizationId: z.uuid(),
  organizationName: z.string(),
  storeId: z.uuid().nullable(),
  storeName: z.string().nullable(),
  permissions: z.array(z.string()),
  roles: z.array(AuthUserRoleSchema),
});

export const LoginRequestSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(6).max(200),
});

export const LoginResponseSchema = z.object({
  accessToken: z.string(),
  expiresInSeconds: z.number().int().positive(),
  user: AuthUserSchema,
});

export const AuthMeResponseSchema = AuthUserSchema;

export type EmployeeStatus = z.infer<typeof EmployeeStatusSchema>;
export type AuthUserRole = z.infer<typeof AuthUserRoleSchema>;
export type AuthUser = z.infer<typeof AuthUserSchema>;
export type LoginRequest = z.input<typeof LoginRequestSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export type AuthMeResponse = z.infer<typeof AuthMeResponseSchema>;

// ---- 组织 / 门店 / 员工 / 账号 ----

export const OrganizationSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const StoreSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  code: z.string(),
  name: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const EmployeeSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  storeId: z.uuid().nullable(),
  employeeNo: z.string(),
  name: z.string(),
  mobile: z.string().nullable(),
  status: EmployeeStatusSchema,
  account: z
    .object({
      id: z.uuid(),
      username: z.string(),
      isFrozen: z.boolean(),
    })
    .nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const OrganizationListSchema = z.object({
  items: z.array(OrganizationSchema),
  total: z.number().int().nonnegative(),
});

export const StoreListSchema = z.object({
  items: z.array(StoreSchema),
  total: z.number().int().nonnegative(),
});

export const EmployeeListSchema = z.object({
  items: z.array(EmployeeSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const CreateOrganizationSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export const UpdateOrganizationSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
  })
  .refine((value) => Object.keys(value).length > 0, "至少提供一个待修改字段");

export const CreateStoreSchema = z.object({
  organizationId: z.uuid(),
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(100),
});

export const CreateEmployeeSchema = z.object({
  organizationId: z.uuid(),
  storeId: z.uuid().optional(),
  employeeNo: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(100),
  mobile: z.string().trim().max(30).optional(),
  status: EmployeeStatusSchema.optional(),
});

export const UpdateEmployeeSchema = z
  .object({
    storeId: z.uuid().nullable().optional(),
    name: z.string().trim().min(1).max(100).optional(),
    mobile: z.string().trim().max(30).nullable().optional(),
    status: EmployeeStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "至少提供一个待修改字段");

export const CreateAccountSchema = z.object({
  employeeId: z.uuid(),
  username: z
    .string()
    .trim()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9_.-]+$/, "账号只能包含字母、数字、下划线、点和短横线"),
  password: z.string().min(8).max(100),
  roleIds: z.array(z.uuid()).min(1).max(20),
});

export const UpdateAccountSchema = z
  .object({
    isFrozen: z.boolean().optional(),
    password: z.string().min(8).max(100).optional(),
    roleIds: z.array(z.uuid()).min(1).max(20).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "至少提供一个待修改字段");

export const RoleSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  permissions: z.array(z.string()),
});

export const PermissionSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  resource: z.string(),
  action: z.string(),
});

export const RoleListSchema = z.object({
  items: z.array(RoleSchema),
  total: z.number().int().nonnegative(),
});

export const PermissionListSchema = z.object({
  items: z.array(PermissionSchema),
  total: z.number().int().nonnegative(),
});

export type Organization = z.infer<typeof OrganizationSchema>;
export type Store = z.infer<typeof StoreSchema>;
export type Employee = z.infer<typeof EmployeeSchema>;
export type OrganizationList = z.infer<typeof OrganizationListSchema>;
export type StoreList = z.infer<typeof StoreListSchema>;
export type EmployeeList = z.infer<typeof EmployeeListSchema>;
export type CreateOrganization = z.input<typeof CreateOrganizationSchema>;
export type UpdateOrganization = z.input<typeof UpdateOrganizationSchema>;
export type CreateStore = z.input<typeof CreateStoreSchema>;
export type CreateEmployee = z.input<typeof CreateEmployeeSchema>;
export type UpdateEmployee = z.input<typeof UpdateEmployeeSchema>;
export type CreateAccount = z.input<typeof CreateAccountSchema>;
export type UpdateAccount = z.input<typeof UpdateAccountSchema>;
export type Role = z.infer<typeof RoleSchema>;
export type Permission = z.infer<typeof PermissionSchema>;
export type RoleList = z.infer<typeof RoleListSchema>;
export type PermissionList = z.infer<typeof PermissionListSchema>;

// ---- 库存总览 ----

export const WarehouseTypeSchema = z.enum([
  "COMPANY",
  "STORE",
  "PERSONAL",
  "AFTER_SALES",
  "ABNORMAL",
]);

export const WarehouseOverviewItemSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  type: WarehouseTypeSchema,
  storeName: z.string().nullable(),
  ownerEmployeeName: z.string().nullable(),
  serialCount: z.number().int().nonnegative(),
});

export const InventoryOverviewSchema = z.object({
  totalSerials: z.number().int().nonnegative(),
  companySerials: z.number().int().nonnegative(),
  personalSerials: z.number().int().nonnegative(),
  warehouses: z.array(WarehouseOverviewItemSchema),
});

export const WarehouseSerialItemSchema = z.object({
  id: z.uuid(),
  imeiPrimary: z.string(),
  imeiSecondary: z.string().nullable(),
  serialNumber: z.string().nullable(),
  status: z.string(),
  skuCode: z.string(),
  skuName: z.string(),
  productBrand: z.string().nullable(),
  productModel: z.string().nullable(),
  receivedAt: z.iso.datetime(),
  unitCost: z.string(),
});

export const WarehouseSerialListSchema = z.object({
  items: z.array(WarehouseSerialItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export type WarehouseType = z.infer<typeof WarehouseTypeSchema>;
export type WarehouseOverviewItem = z.infer<typeof WarehouseOverviewItemSchema>;
export type InventoryOverview = z.infer<typeof InventoryOverviewSchema>;
export type WarehouseSerialItem = z.infer<typeof WarehouseSerialItemSchema>;
export type WarehouseSerialList = z.infer<typeof WarehouseSerialListSchema>;
