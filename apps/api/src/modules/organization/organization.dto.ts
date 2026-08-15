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
  Matches,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export enum EmployeeStatusDto {
  ACTIVE = "ACTIVE",
  LEAVING = "LEAVING",
  INACTIVE = "INACTIVE",
}

export class ListEmployeesQueryDto {
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
  @IsEnum(EmployeeStatusDto)
  status?: EmployeeStatusDto;

  @IsOptional()
  @IsUUID()
  storeId?: string;
}

export class CreateOrganizationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}

export class UpdateOrganizationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}

export class CreateStoreDto {
  @IsUUID()
  organizationId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}

export class UpdateStoreDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;
}

export class CreateEmployeeDto {
  @IsUUID()
  organizationId!: string;

  @IsOptional()
  @IsUUID()
  storeId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  employeeNo!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  mobile?: string;

  @IsOptional()
  @IsEnum(EmployeeStatusDto)
  status?: EmployeeStatusDto;
}

export class UpdateEmployeeDto {
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  mobile?: string;

  @IsOptional()
  @IsEnum(EmployeeStatusDto)
  status?: EmployeeStatusDto;
}

export class CreateAccountDto {
  @IsUUID()
  employeeId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9_.-]+$/, {
    message: "账号只能包含字母、数字、下划线、点和短横线",
  })
  username!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsUUID("all", { each: true })
  roleIds!: string[];

  /** 销售角色必填:所属门店 */
  @IsOptional()
  @IsUUID()
  storeId?: string;

  /** 销售角色必填:可操作仓库 */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID("all", { each: true })
  warehouseIds?: string[];
}

export class UpdateAccountDto {
  @IsOptional()
  @IsBoolean()
  isFrozen?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsUUID("all", { each: true })
  roleIds?: string[];

  @IsOptional()
  @IsUUID()
  storeId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID("all", { each: true })
  warehouseIds?: string[];
}

/** 创建自定义角色(内置角色由 seed 权威管理,不走本接口) */
export class CreateRoleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(30)
  @Matches(/^[A-Z][A-Z0-9_]*$/, {
    message: "角色编码只能包含大写字母、数字和下划线,且以字母开头",
  })
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(30)
  name!: string;

  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID("all", { each: true })
  permissionIds!: string[];
}

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  name?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID("all", { each: true })
  permissionIds?: string[];
}
