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
} from "class-validator";

/** 与 Prisma StocktakeStatus 对应(DTO 层枚举便于校验) */
export enum StocktakeStatusDto {
  DRAFT = "DRAFT",
  COUNTING = "COUNTING",
  SUBMITTED = "SUBMITTED",
  APPROVED = "APPROVED",
  POSTED = "POSTED",
  CANCELLED = "CANCELLED",
}

export class ListStocktakesQueryDto {
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
  @IsEnum(StocktakeStatusDto)
  status?: StocktakeStatusDto;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;
}

export class CreateStocktakeDto {
  @IsUUID()
  warehouseId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}

export class ScanStocktakeDto {
  /** 本次录入的实盘 IMEI/SN(扫码枪连续扫描,单次最多 500 条) */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MinLength(4, { each: true })
  @MaxLength(50, { each: true })
  imeis!: string[];
}

export class RejectStocktakeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
