import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

type RouteContext = { params: Promise<{ path: string[] }> };

const TOKEN_COOKIE = "erp_session";

/** 允许代理的后端资源前缀（组织中心涉及的接口都挂在 API 根路径下） */
const ALLOWED_PREFIXES = new Set([
  "organizations",
  "stores",
  "warehouses",
  "employees",
  "accounts",
  "roles",
  "permissions",
]);

function apiBaseUrl(): string {
  return (process.env.API_BASE_URL ?? "http://localhost:3100/api/v1").replace(
    /\/$/,
    "",
  );
}

/**
 * 组织中心 BFF 代理：把 /api/org/* 转发到后端根路径（organizations、stores、
 * warehouses、employees、accounts、roles、permissions），并携带登录 Cookie 中的令牌。
 * 后端按 organization:read/write、account:write、role:read 鉴权。
 */
async function proxy(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const { path } = await context.params;
  if (path.length === 0 || !ALLOWED_PREFIXES.has(path[0]!)) {
    return Response.json(
      { code: "NOT_FOUND", message: "不支持的组织中心接口" },
      { status: 404 },
    );
  }

  const token = request.cookies.get(TOKEN_COOKIE)?.value;
  if (!token) {
    return Response.json(
      { code: "UNAUTHENTICATED", message: "请先登录后再访问组织数据" },
      { status: 401 },
    );
  }

  const target = new URL(
    `${apiBaseUrl()}/${path.map(encodeURIComponent).join("/")}`,
  );
  target.search = request.nextUrl.search;

  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${token}`,
    "x-request-id": request.headers.get("x-request-id") ?? randomUUID(),
  });
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  if (hasBody) headers.set("content-type", "application/json");

  try {
    const response = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.text() : undefined,
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
        code: "ORG_API_UNAVAILABLE",
        message: "组织服务暂时不可用，请确认后端已启动",
      },
      { status: 503 },
    );
  }
}

export const dynamic = "force-dynamic";

export function GET(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}

export function POST(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}

export function PATCH(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}
