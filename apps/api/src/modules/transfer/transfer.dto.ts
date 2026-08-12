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
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

/** 与 Prisma TransferStatus 对应(DTO 层枚举便于 class-validator 校验) */
export enum TransferStatusDto {
  DRAFT = "DRAFT",
  SUBMITTED = "SUBMITTED",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  LOCKED = "LOCKED",
  IN_TRANSIT = "IN_TRANSIT",
  PARTIALLY_RECEIVED = "PARTIALLY_RECEIVED",
  RECEIVED = "RECEIVED",
  EXCEPTION = "EXCEPTION",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

/** 与 Prisma TransferExceptionType 对应 */
export enum TransferExceptionTypeDto {
  MISSING = "MISSING",
  WRONG_ITEM = "WRONG_ITEM",
  DAMAGED = "DAMAGED",
  REJECTED = "REJECTED",
  TIMEOUT = "TIMEOUT",
}

export class ListTransfersQueryDto {
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
  @IsEnum(TransferStatusDto)
  status?: TransferStatusDto;

  /** 按仓库过滤:命中调出方或调入方 */
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  /** 按单号模糊搜索 */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  search?: string;
}

export class CreateTransferDto {
  @IsUUID()
  fromWarehouseId!: string;

  @IsUUID()
  toWarehouseId!: string;

  /** 序列号商品明细:一机一行,单次最多 200 台 */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID("all", { each: true })
  serialIds!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}

export class RejectTransferDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class ReceiveTransferDto {
  /** 本次扫码接收的序列号(支持部分接收) */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID("all", { each: true })
  serialIds!: string[];
}

export class TransferExceptionItemDto {
  @IsUUID()
  serialId!: string;

  @IsEnum(TransferExceptionTypeDto)
  type!: TransferExceptionTypeDto;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class MarkTransferExceptionsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => TransferExceptionItemDto)
  exceptions!: TransferExceptionItemDto[];
}
