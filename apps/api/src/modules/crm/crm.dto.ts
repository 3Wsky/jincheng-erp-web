import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { Transform, Type } from "class-transformer";
import { FollowupResult } from "@jincheng/database";

/** 客户列表查询:search 同时匹配姓名/手机号(明文仅在服务端查询层使用) */
export class ListCustomersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  search?: string;

  /** 默认排除已作废客户 */
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  includeArchived?: boolean;
}

export class CreateCustomerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string;

  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(20)
  phone?: string;

  /** 来源渠道枚举待业务确认,先收自由文本 */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  sourceChannel?: string;

  @IsOptional()
  @IsUUID()
  ownerStoreId?: string;

  @IsOptional()
  @IsUUID()
  ownerEmployeeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;

  /** 同手机号已有客户时默认 409;显式 true 才允许建重复档(受控识别,AC-F-015) */
  @IsOptional()
  @IsBoolean()
  allowDuplicate?: boolean;
}

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(20)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  sourceChannel?: string | null;

  @IsOptional()
  @IsUUID()
  ownerStoreId?: string | null;

  @IsOptional()
  @IsUUID()
  ownerEmployeeId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string | null;
}

/** 添加回访(REQ-PEOPLE-009/010):结果必填标准枚举,实名由登录态提供 */
export class CreateFollowupDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  method?: string;

  @IsEnum(FollowupResult)
  result!: FollowupResult;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  intentProduct?: string;

  @IsOptional()
  @IsISO8601()
  expectedBuyAt?: string;

  @IsOptional()
  @IsISO8601()
  nextFollowupAt?: string;
}
