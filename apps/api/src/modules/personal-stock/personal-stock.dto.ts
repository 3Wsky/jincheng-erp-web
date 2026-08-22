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
} from "class-validator";

export enum PersonalStockTypeDto {
  ISSUE = "ISSUE",
  RETURN = "RETURN",
  HANDOVER = "HANDOVER",
}

export enum PersonalStockStatusDto {
  DRAFT = "DRAFT",
  SUBMITTED = "SUBMITTED",
  CONFIRMED = "CONFIRMED",
  CANCELLED = "CANCELLED",
}

export class ListPersonalStockQueryDto {
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
  @IsEnum(PersonalStockStatusDto)
  status?: PersonalStockStatusDto;

  @IsOptional()
  @IsEnum(PersonalStockTypeDto)
  type?: PersonalStockTypeDto;
}

export class MinePersonalStockQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize = 50;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;
}

export class CreatePersonalStockDto {
  @IsEnum(PersonalStockTypeDto)
  type!: PersonalStockTypeDto;

  @IsUUID()
  fromWarehouseId!: string;

  @IsUUID()
  toWarehouseId!: string;

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
