import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

/** 与 Prisma PurchaseApprovalStatus 对应(DTO 层枚举便于 class-validator 校验) */
export enum PurchaseApprovalStatusDto {
  DRAFT = "DRAFT",
  SUBMITTED = "SUBMITTED",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  CANCELLED = "CANCELLED",
}

/** 供应商状态:复用 ProductStatus(ACTIVE/INACTIVE)语义 */
export enum SupplierStatusDto {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
}

/** 金额字符串:Decimal(18,2) 存储,最多 16 位整数 + 2 位小数,避免浮点误差 */
const AMOUNT_PATTERN = /^\d{1,16}(\.\d{1,2})?$/;
const AMOUNT_MESSAGE = "金额必须是最多两位小数的非负数字字符串";

export class ListSuppliersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize = 20;

  /** 按编码/名称模糊搜索 */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  search?: string;

  @IsOptional()
  @IsEnum(SupplierStatusDto)
  status?: SupplierStatusDto;
}

export class CreateSupplierDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  contactPhone?: string;
}

export class UpdateSupplierDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  contactPhone?: string;

  @IsOptional()
  @IsEnum(SupplierStatusDto)
  status?: SupplierStatusDto;
}

export class ListPurchaseOrdersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize = 20;

  @IsOptional()
  @IsEnum(PurchaseApprovalStatusDto)
  approvalStatus?: PurchaseApprovalStatusDto;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  /** 按单号模糊搜索 */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  search?: string;
}

export class PurchaseLineInputDto {
  @IsUUID()
  skuId!: string;

  /** 采购数量:1~9999 */
  @IsInt()
  @Min(1)
  @Max(9999)
  quantity!: number;

  /** 采购单价(字符串,Decimal 存储) */
  @IsString()
  @Matches(AMOUNT_PATTERN, { message: AMOUNT_MESSAGE })
  unitPrice!: string;
}

export class CreatePurchaseOrderDto {
  @IsUUID()
  supplierId!: string;

  /** 收货仓 */
  @IsUUID()
  warehouseId!: string;

  /** 明细行:SKU + 数量 + 单价,同一 SKU 不允许重复行 */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PurchaseLineInputDto)
  lines!: PurchaseLineInputDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}

export class RejectPurchaseOrderDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class CreatePurchasePaymentDto {
  /** 付款金额(字符串,必须大于 0) */
  @IsString()
  @Matches(AMOUNT_PATTERN, { message: AMOUNT_MESSAGE })
  amount!: string;

  /** 付款方式:如 BANK/CASH/OTHER */
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  method!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ReceiptItemInputDto {
  @IsUUID()
  purchaseLineId!: string;

  /** 本次扫码收货的 IMEI 列表(一机一码,公司范围内唯一) */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MinLength(5, { each: true })
  @MaxLength(50, { each: true })
  imeis!: string[];
}

export class CreatePurchaseReceiptDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ReceiptItemInputDto)
  items!: ReceiptItemInputDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
