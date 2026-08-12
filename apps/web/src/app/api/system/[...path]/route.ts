import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

type RouteContext = { params: Promise<{ path: string[] }> };

const TOKEN_COOKIE = "erp_session";

/**
 * 允许代理的后端路径白名单（系统设置页只读）：
 * - health               → API /health（无鉴权，健康检查）
 * - audit/logs           → API /audit/logs（audit:read）
 * - audit/outbox/pending → API /audit/outbox/pending（audit:read）
 */
const ALLOWED_PATHS = new Set(["health", "audit/logs", "audit/outbox/pending"]);

function apiBaseUrl(): string {
  return (process.env.API_BASE_URL ?? "http://localhost:3100/api/v1").replace(
    /\/$/,
    "",
  );
}

/**
 * 系统设置 BFF 代理：把 /api/system/* 转发到后端根路径，仅支持 GET。
 * 携带登录 Cookie 中的令牌；health 本身无鉴权，照转不受影响；
 * 审计接口未登录时由后端 JwtAuthGuard 返回 401。
 */
async function proxy(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const { path } = await context.params;
  const joined = path.join("/");
  if (!ALLOWED_PATHS.has(joined)) {
    return Response.json(
      { code: "NOT_FOUND", message: "不支持的系统设置接口" },
      { status: 404 },
    );
  }

  const target = new URL(
    `${apiBaseUrl()}/${path.map(encodeURIComponent).join("/")}`,
  );
  target.search = request.nextUrl.search;

  const headers = new Headers({
    accept: "application/json",
    "x-request-id": request.headers.get("x-request-id") ?? randomUUID(),
  });
  const token = request.cookies.get(TOKEN_COOKIE)?.value;
  if (token) headers.set("authorization", `Bearer ${token}`);

  try {
    const response = await fetch(target, {
      method: "GET",
      headers,
      cache: "no-store",
    });
    return new Response(response.body, {
      status: response.status,
      headers: {
        "content-type":
          response.headers.get("content-type") ?? "application/json",
      },
    });
  } catch {
    return Response.json(
      {
        code: "SYSTEM_API_UNAVAILABLE",
        message: "系统服务暂时不可用，请确认后端已启动",
      },
      { status: 503 },
    );
  }
}

export const dynamic = "force-dynamic";

export function GET(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}
