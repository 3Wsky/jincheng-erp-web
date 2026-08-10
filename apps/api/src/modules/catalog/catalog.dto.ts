import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
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

export enum CatalogProductStatusDto {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
}

export enum CatalogClassificationStatusDto {
  PENDING = "PENDING",
  CONFIRMED = "CONFIRMED",
}

export class ListCatalogProductsQueryDto {
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
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsEnum(CatalogProductStatusDto)
  status?: CatalogProductStatusDto;
}

export class CreateCatalogSkuDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  barcode?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  additionalBarcodes: string[] = [];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  capacity?: string;

  @IsOptional()
  @IsBoolean()
  serialManaged = false;
}

export class CreateCatalogProductDto {
  @IsUUID()
  organizationId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  brand!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  category!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  modelName!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateCatalogSkuDto)
  skus!: CreateCatalogSkuDto[];
}

export class UpdateCatalogProductDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  brand?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  modelName?: string;

  @IsOptional()
  @IsEnum(CatalogProductStatusDto)
  status?: CatalogProductStatusDto;

  @IsOptional()
  @IsEnum(CatalogClassificationStatusDto)
  classificationStatus?: CatalogClassificationStatusDto;
}

export class UpdateCatalogSkuDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  barcode?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  additionalBarcodes?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  capacity?: string;

  @IsOptional()
  @IsBoolean()
  serialManaged?: boolean;

  @IsOptional()
  @IsEnum(CatalogProductStatusDto)
  status?: CatalogProductStatusDto;
}

export class ApplyCatalogImportDto {
  @IsUUID()
  organizationId!: string;
}
