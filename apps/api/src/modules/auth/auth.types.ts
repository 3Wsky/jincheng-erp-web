import type { JwtPayload } from "@jincheng/database";

/**
 * 认证请求上下文。由 JwtAuthGuard 填充，供控制器和审计使用。
 */
export interface AuthenticatedRequest {
  user: {
    userId: string;
    username: string;
    employeeId: string;
    organizationId: string;
    employeeNo: string;
    employeeName: string;
    storeId: string | null;
    isFrozen: boolean;
    roles: Array<{ id: string; code: string; name: string; dataScope: string }>;
    permissions: string[];
    tokenId: string;
  };
  tokenPayload: JwtPayload;
  requestId: string;
}
