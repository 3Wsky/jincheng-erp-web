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
  /** 内置角色(seed 权威管理):管理台锁定不可改不可停用 */
  isSystem: z.boolean(),
  /** 非空 = 已停用(软删,有账号挂载的角色不可停用) */
  archivedAt: z.iso.datetime().nullable(),
  /** 当前挂载账号数 */
  accountCount: z.number().int().nonnegative(),
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

// ---- 全局查货(AC-F-004)与单机档案(AC-F-005) ----

export const SerialStatusSchema = z.enum([
  "NORMAL",
  "LOCKED",
  "IN_TRANSIT",
  "PENDING_CONFIRM",
  "PERSONAL",
  "SOLD",
  "AFTER_SALES",
  "ABNORMAL",
]);

export const SerialSearchItemSchema = z.object({
  id: z.uuid(),
  imeiPrimary: z.string(),
  imeiSecondary: z.string().nullable(),
  serialNumber: z.string().nullable(),
  status: SerialStatusSchema,
  skuCode: z.string(),
  skuName: z.string(),
  productBrand: z.string().nullable(),
  productModel: z.string().nullable(),
  retailPrice: z.string().nullable(),
  warehouseId: z.uuid(),
  warehouseName: z.string(),
  warehouseType: WarehouseTypeSchema,
  storeName: z.string().nullable(),
  responsibleEmployeeName: z.string().nullable(),
  receivedAt: z.iso.datetime(),
  unitCost: z.string(),
});

export const SerialSearchResultSchema = z.object({
  items: z.array(SerialSearchItemSchema),
  byStatus: z.array(
    z.object({
      status: SerialStatusSchema,
      count: z.number().int().nonnegative(),
    }),
  ),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

/** 查货聚合视图:按商品汇总各仓库可售/占用/其他数量(找货第一步) */
export const SearchSummaryWarehouseSchema = z.object({
  warehouseId: z.uuid(),
  warehouseName: z.string(),
  warehouseType: WarehouseTypeSchema,
  storeName: z.string().nullable(),
  available: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  other: z.number().int().nonnegative(),
});

export const SearchSummarySkuGroupSchema = z.object({
  skuId: z.uuid(),
  skuCode: z.string(),
  skuName: z.string(),
  /** primary=真机/主商品(视觉焦点);accessory=配件;demo=演示机(往下排) */
  kind: z.enum(["primary", "accessory", "demo"]),
  /** 从商品名解析的颜色(极夜黑/皓月银);null=无法识别 */
  color: z.string().nullable(),
  /** 从商品名解析的规格(手机 12+512 / 电脑 i5 16+512 / 手表 42mm / 显示器 28.2寸) */
  spec: z.string().nullable(),
  productBrand: z.string().nullable(),
  productModel: z.string().nullable(),
  /** 零售指导价(官网价同步或手工维护);null=未定价 */
  retailPrice: z.string().nullable(),
  availableTotal: z.number().int().nonnegative(),
  pendingTotal: z.number().int().nonnegative(),
  otherTotal: z.number().int().nonnegative(),
  warehouses: z.array(SearchSummaryWarehouseSchema),
});

export const SearchFacetSchema = z.object({
  value: z.string(),
  count: z.number().int().nonnegative(),
});

export const SearchSummarySchema = z.object({
  totalSerials: z.number().int().nonnegative(),
  skuCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
  /** 分类筛选桶:颜色与规格(按返回分组统计) */
  facets: z.object({
    colors: z.array(SearchFacetSchema),
    specs: z.array(SearchFacetSchema),
  }),
  skuGroups: z.array(SearchSummarySkuGroupSchema),
});

export const SerialMovementSchema = z.object({
  id: z.uuid(),
  documentId: z.uuid(),
  documentType: z.string(),
  movementType: z.string(),
  quantity: z.number().int(),
  fromWarehouseName: z.string().nullable(),
  toWarehouseName: z.string().nullable(),
  occurredAt: z.iso.datetime(),
});

export const SerialDetailSchema = z.object({
  id: z.uuid(),
  imeiPrimary: z.string(),
  imeiSecondary: z.string().nullable(),
  serialNumber: z.string().nullable(),
  status: SerialStatusSchema,
  skuCode: z.string(),
  skuName: z.string(),
  productBrand: z.string().nullable(),
  productModel: z.string().nullable(),
  productCategory: z.string().nullable(),
  retailPrice: z.string().nullable(),
  warehouseId: z.uuid(),
  warehouseCode: z.string(),
  warehouseName: z.string(),
  warehouseType: WarehouseTypeSchema,
  storeName: z.string().nullable(),
  responsibleEmployeeName: z.string().nullable(),
  unitCost: z.string(),
  receivedAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  movements: z.array(SerialMovementSchema),
});

export type WarehouseType = z.infer<typeof WarehouseTypeSchema>;
export type WarehouseOverviewItem = z.infer<typeof WarehouseOverviewItemSchema>;
export type InventoryOverview = z.infer<typeof InventoryOverviewSchema>;
export type WarehouseSerialItem = z.infer<typeof WarehouseSerialItemSchema>;
export type WarehouseSerialList = z.infer<typeof WarehouseSerialListSchema>;
export type SerialStatusValue = z.infer<typeof SerialStatusSchema>;
export type SerialSearchItem = z.infer<typeof SerialSearchItemSchema>;
export type SerialSearchResult = z.infer<typeof SerialSearchResultSchema>;
export type SerialMovement = z.infer<typeof SerialMovementSchema>;
export type SerialDetail = z.infer<typeof SerialDetailSchema>;
export type SearchSummaryWarehouse = z.infer<
  typeof SearchSummaryWarehouseSchema
>;
export type SearchSummarySkuGroup = z.infer<typeof SearchSummarySkuGroupSchema>;
export type SearchSummary = z.infer<typeof SearchSummarySchema>;

// ---- 调拨(AC-F-008/009,docs/12 状态机) ----

export const TransferStatusSchema = z.enum([
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "LOCKED",
  "IN_TRANSIT",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
  "EXCEPTION",
  "COMPLETED",
  "CANCELLED",
]);

export const TransferLineStatusSchema = z.enum([
  "PENDING",
  "LOCKED",
  "SHIPPED",
  "RECEIVED",
  "EXCEPTION",
]);

export const TransferExceptionTypeSchema = z.enum([
  "MISSING",
  "WRONG_ITEM",
  "DAMAGED",
  "REJECTED",
  "TIMEOUT",
]);

export const TransferWarehouseSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  type: WarehouseTypeSchema,
});

export const TransferListItemSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  status: TransferStatusSchema,
  fromWarehouse: TransferWarehouseSchema,
  toWarehouse: TransferWarehouseSchema,
  lineCount: z.number().int().nonnegative(),
  remark: z.string().nullable(),
  createdByName: z.string().nullable(),
  createdAt: z.iso.datetime(),
  shippedAt: z.iso.datetime().nullable(),
  receivedAt: z.iso.datetime().nullable(),
});

export const TransferListSchema = z.object({
  items: z.array(TransferListItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const TransferLineSchema = z.object({
  id: z.uuid(),
  serialId: z.uuid(),
  imeiPrimary: z.string(),
  serialNumber: z.string().nullable(),
  serialStatus: SerialStatusSchema,
  skuCode: z.string(),
  skuName: z.string(),
  productBrand: z.string().nullable(),
  productModel: z.string().nullable(),
  status: TransferLineStatusSchema,
  exceptionType: TransferExceptionTypeSchema.nullable(),
  exceptionNote: z.string().nullable(),
  receivedByName: z.string().nullable(),
  receivedAt: z.iso.datetime().nullable(),
});

export const TransferDetailSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  status: TransferStatusSchema,
  fromWarehouse: TransferWarehouseSchema,
  toWarehouse: TransferWarehouseSchema,
  remark: z.string().nullable(),
  rejectedReason: z.string().nullable(),
  createdByName: z.string().nullable(),
  approvedByName: z.string().nullable(),
  shippedByName: z.string().nullable(),
  createdAt: z.iso.datetime(),
  submittedAt: z.iso.datetime().nullable(),
  approvedAt: z.iso.datetime().nullable(),
  lockedAt: z.iso.datetime().nullable(),
  shippedAt: z.iso.datetime().nullable(),
  receivedAt: z.iso.datetime().nullable(),
  completedAt: z.iso.datetime().nullable(),
  cancelledAt: z.iso.datetime().nullable(),
  lines: z.array(TransferLineSchema),
});

export type TransferStatusValue = z.infer<typeof TransferStatusSchema>;
export type TransferLineStatusValue = z.infer<typeof TransferLineStatusSchema>;
export type TransferExceptionTypeValue = z.infer<
  typeof TransferExceptionTypeSchema
>;
export type TransferWarehouse = z.infer<typeof TransferWarehouseSchema>;
export type TransferListItem = z.infer<typeof TransferListItemSchema>;
export type TransferList = z.infer<typeof TransferListSchema>;
export type TransferLine = z.infer<typeof TransferLineSchema>;
export type TransferDetail = z.infer<typeof TransferDetailSchema>;

// ---- 盘点(docs/12 第 6 节;盘点期间仓库封存,2026-08-12 业务确认) ----

export const StocktakeStatusSchema = z.enum([
  "DRAFT",
  "COUNTING",
  "SUBMITTED",
  "APPROVED",
  "POSTED",
  "CANCELLED",
]);

export const StocktakeDifferenceTypeSchema = z.enum(["MISSING", "UNEXPECTED"]);

export const StocktakeListItemSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  status: StocktakeStatusSchema,
  warehouse: TransferWarehouseSchema,
  snapshotCount: z.number().int().nonnegative().nullable(),
  scanCount: z.number().int().nonnegative(),
  differenceCount: z.number().int().nonnegative(),
  remark: z.string().nullable(),
  createdByName: z.string().nullable(),
  createdAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  postedAt: z.iso.datetime().nullable(),
});

export const StocktakeListSchema = z.object({
  items: z.array(StocktakeListItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const StocktakeDifferenceSchema = z.object({
  id: z.uuid(),
  type: StocktakeDifferenceTypeSchema,
  imei: z.string(),
  serialId: z.uuid().nullable(),
  skuCode: z.string().nullable(),
  skuName: z.string().nullable(),
  serialStatus: z.string().nullable(),
  note: z.string().nullable(),
});

export const StocktakeDetailSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  status: StocktakeStatusSchema,
  warehouse: TransferWarehouseSchema,
  snapshotCount: z.number().int().nonnegative().nullable(),
  bookCount: z.number().int().nonnegative(),
  scanCount: z.number().int().nonnegative(),
  matchedCount: z.number().int().nonnegative(),
  /** 已录入的实盘清单(imei + 匹配到的序列号 id;对照勾选盘点用) */
  scans: z.array(
    z.object({ imei: z.string(), serialId: z.uuid().nullable() }),
  ),
  remark: z.string().nullable(),
  rejectedReason: z.string().nullable(),
  createdByName: z.string().nullable(),
  approvedByName: z.string().nullable(),
  createdAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  submittedAt: z.iso.datetime().nullable(),
  approvedAt: z.iso.datetime().nullable(),
  postedAt: z.iso.datetime().nullable(),
  cancelledAt: z.iso.datetime().nullable(),
  differences: z.array(StocktakeDifferenceSchema),
});

export const StocktakeScanResultSchema = z.object({
  inserted: z.number().int().nonnegative(),
  duplicated: z.number().int().nonnegative(),
});

// ---- 我的待办(业务单据状态实时推导,按用户权限过滤) ----

export const TaskItemSchema = z.object({
  id: z.string(),
  code: z.string(),
  title: z.string(),
  at: z.iso.datetime(),
});

export const TaskGroupSchema = z.object({
  key: z.string(),
  label: z.string(),
  route: z.string(),
  count: z.number().int().nonnegative(),
  items: z.array(TaskItemSchema),
});

export const TaskSummarySchema = z.object({
  totalCount: z.number().int().nonnegative(),
  groups: z.array(TaskGroupSchema),
});

export type TaskItem = z.infer<typeof TaskItemSchema>;
export type TaskGroup = z.infer<typeof TaskGroupSchema>;
export type TaskSummary = z.infer<typeof TaskSummarySchema>;

export type StocktakeStatusValue = z.infer<typeof StocktakeStatusSchema>;
export type StocktakeDifferenceTypeValue = z.infer<
  typeof StocktakeDifferenceTypeSchema
>;
export type StocktakeListItem = z.infer<typeof StocktakeListItemSchema>;
export type StocktakeList = z.infer<typeof StocktakeListSchema>;
export type StocktakeDifference = z.infer<typeof StocktakeDifferenceSchema>;
export type StocktakeDetail = z.infer<typeof StocktakeDetailSchema>;
export type StocktakeScanResult = z.infer<typeof StocktakeScanResultSchema>;

// ---- 采购(docs/12 第 3 节:审批/付款/收货三维度) ----

export const PurchaseApprovalStatusSchema = z.enum([
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
]);

export const PurchasePaymentStatusSchema = z.enum([
  "UNPAID",
  "PARTIALLY_PAID",
  "PAID",
]);

export const PurchaseReceiptStatusSchema = z.enum([
  "NOT_RECEIVED",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
]);

export const SupplierSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  contactName: z.string().nullable(),
  contactPhone: z.string().nullable(),
  status: ProductStatusSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const SupplierListSchema = z.object({
  items: z.array(SupplierSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const PurchaseSupplierRefSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
});

/** 金额均为后端 Decimal 序列化的字符串 */
export const PurchaseOrderListItemSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  approvalStatus: PurchaseApprovalStatusSchema,
  paymentStatus: PurchasePaymentStatusSchema,
  receiptStatus: PurchaseReceiptStatusSchema,
  supplier: PurchaseSupplierRefSchema,
  warehouse: TransferWarehouseSchema,
  totalAmount: z.string(),
  paidAmount: z.string(),
  orderedQuantitySum: z.number().int().nonnegative(),
  receivedQuantitySum: z.number().int().nonnegative(),
  lineCount: z.number().int().nonnegative(),
  remark: z.string().nullable(),
  createdByName: z.string().nullable(),
  createdAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
});

export const PurchaseOrderListSchema = z.object({
  items: z.array(PurchaseOrderListItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const PurchaseOrderLineSchema = z.object({
  id: z.uuid(),
  skuId: z.uuid(),
  skuCode: z.string(),
  skuName: z.string(),
  productBrand: z.string().nullable(),
  productModel: z.string().nullable(),
  quantity: z.number().int().positive(),
  unitPrice: z.string(),
  lineTotal: z.string(),
  receivedQuantity: z.number().int().nonnegative(),
});

export const PurchasePaymentRecordSchema = z.object({
  id: z.uuid(),
  amount: z.string(),
  method: z.string(),
  note: z.string().nullable(),
  paidAt: z.iso.datetime(),
  createdByName: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export const PurchaseReceiptItemRecordSchema = z.object({
  id: z.uuid(),
  purchaseLineId: z.uuid(),
  serialId: z.uuid(),
  imeiPrimary: z.string(),
});

export const PurchaseReceiptRecordSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  note: z.string().nullable(),
  receivedAt: z.iso.datetime(),
  receivedByName: z.string().nullable(),
  itemCount: z.number().int().nonnegative(),
  items: z.array(PurchaseReceiptItemRecordSchema),
});

export const PurchaseOrderDetailSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  approvalStatus: PurchaseApprovalStatusSchema,
  paymentStatus: PurchasePaymentStatusSchema,
  receiptStatus: PurchaseReceiptStatusSchema,
  supplier: PurchaseSupplierRefSchema,
  warehouse: TransferWarehouseSchema,
  totalAmount: z.string(),
  paidAmount: z.string(),
  orderedQuantitySum: z.number().int().nonnegative(),
  receivedQuantitySum: z.number().int().nonnegative(),
  remark: z.string().nullable(),
  rejectedReason: z.string().nullable(),
  createdByName: z.string().nullable(),
  approvedByName: z.string().nullable(),
  createdAt: z.iso.datetime(),
  submittedAt: z.iso.datetime().nullable(),
  approvedAt: z.iso.datetime().nullable(),
  completedAt: z.iso.datetime().nullable(),
  cancelledAt: z.iso.datetime().nullable(),
  lines: z.array(PurchaseOrderLineSchema),
  payments: z.array(PurchasePaymentRecordSchema),
  receipts: z.array(PurchaseReceiptRecordSchema),
});

export type PurchaseApprovalStatusValue = z.infer<
  typeof PurchaseApprovalStatusSchema
>;
export type PurchasePaymentStatusValue = z.infer<
  typeof PurchasePaymentStatusSchema
>;
export type PurchaseReceiptStatusValue = z.infer<
  typeof PurchaseReceiptStatusSchema
>;
export type Supplier = z.infer<typeof SupplierSchema>;
export type SupplierList = z.infer<typeof SupplierListSchema>;
export type PurchaseOrderListItem = z.infer<typeof PurchaseOrderListItemSchema>;
export type PurchaseOrderList = z.infer<typeof PurchaseOrderListSchema>;
export type PurchaseOrderLine = z.infer<typeof PurchaseOrderLineSchema>;
export type PurchasePaymentRecord = z.infer<typeof PurchasePaymentRecordSchema>;
export type PurchaseReceiptRecord = z.infer<typeof PurchaseReceiptRecordSchema>;
export type PurchaseOrderDetail = z.infer<typeof PurchaseOrderDetailSchema>;

// ---- 客户管理(AC-F-015/016;手机号一律脱敏返回,明文可见权限待 Field 维度签字) ----

/** 回访结果(REQ-PEOPLE-010 的 8 个标准值) */
export const FollowupResultSchema = z.enum([
  "NO_DEMAND",
  "INTERESTED",
  "PENDING_QUOTE",
  "PENDING_VISIT",
  "DEAL_DONE",
  "REFUSED_CONTACT",
  "INVALID_NUMBER",
  "FOLLOW_UP_LATER",
]);

export const CustomerListItemSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  /** 服务端已脱敏(138****5678),前端不接触明文 */
  phoneMasked: z.string().nullable(),
  sourceChannel: z.string().nullable(),
  ownerStoreName: z.string().nullable(),
  ownerEmployeeName: z.string().nullable(),
  remark: z.string().nullable(),
  archivedAt: z.iso.datetime().nullable(),
  lastFollowupAt: z.iso.datetime().nullable(),
  nextFollowupAt: z.iso.datetime().nullable(),
  followupCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
});

export const CustomerListSchema = z.object({
  items: z.array(CustomerListItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const FollowupRecordItemSchema = z.object({
  id: z.uuid(),
  method: z.string().nullable(),
  result: FollowupResultSchema,
  note: z.string().nullable(),
  intentProduct: z.string().nullable(),
  expectedBuyAt: z.iso.datetime().nullable(),
  nextFollowupAt: z.iso.datetime().nullable(),
  occurredAt: z.iso.datetime(),
  createdByName: z.string().nullable(),
});

export const CustomerIdentityItemSchema = z.object({
  id: z.uuid(),
  sourceSystem: z.string(),
  sourceId: z.string(),
  createdAt: z.iso.datetime(),
});

export const CustomerDetailSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  phoneMasked: z.string().nullable(),
  sourceChannel: z.string().nullable(),
  ownerStoreId: z.uuid().nullable(),
  ownerStoreName: z.string().nullable(),
  ownerEmployeeId: z.uuid().nullable(),
  ownerEmployeeName: z.string().nullable(),
  remark: z.string().nullable(),
  archivedAt: z.iso.datetime().nullable(),
  createdByName: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  identities: z.array(CustomerIdentityItemSchema),
  followups: z.array(FollowupRecordItemSchema),
});

/** 创建时同手机号冲突(409)返回的已有客户摘要 */
export const CustomerDuplicateSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  phoneMasked: z.string().nullable(),
  ownerEmployeeName: z.string().nullable(),
});

export type FollowupResultValue = z.infer<typeof FollowupResultSchema>;
export type CustomerListItem = z.infer<typeof CustomerListItemSchema>;
export type CustomerList = z.infer<typeof CustomerListSchema>;
export type FollowupRecordItem = z.infer<typeof FollowupRecordItemSchema>;
export type CustomerIdentityItem = z.infer<typeof CustomerIdentityItemSchema>;
export type CustomerDetail = z.infer<typeof CustomerDetailSchema>;
export type CustomerDuplicate = z.infer<typeof CustomerDuplicateSchema>;
