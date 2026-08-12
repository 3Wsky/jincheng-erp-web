import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

type RouteContext = { params: Promise<{ path?: string[] }> };

const TOKEN_COOKIE = "erp_session";

/** 允许转发的后端资源前缀(供应商与采购单,避免代理被用于访问其他接口) */
const ALLOWED_PREFIXES = new Set(["suppliers", "purchase-orders"]);

function apiBaseUrl(): string {
  return (process.env.API_BASE_URL ?? "http://localhost:3100/api/v1").replace(
    /\/$/,
    "",
  );
}

/**
 * 采购 BFF 代理:携带登录 Cookie 中的令牌转发到后端。
 * 去掉 /api/procurement 前缀直接拼 API base:
 * - /api/procurement/suppliers → {apiBase}/suppliers
 * - /api/procurement/purchase-orders/{id}/submit → {apiBase}/purchase-orders/{id}/submit
 */
async function proxy(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const { path } = await context.params;
  const segments = path ?? [];
  const resource = segments[0];
  if (!resource || !ALLOWED_PREFIXES.has(resource)) {
    return Response.json(
      { code: "PROCUREMENT_ROUTE_NOT_FOUND", message: "未知的采购接口路径" },
      { status: 404 },
    );
  }
  const target = new URL(
    `${apiBaseUrl()}/${segments.map(encodeURIComponent).join("/")}`,
  );
  target.search = request.nextUrl.search;

  const headers = new Headers({
    accept: "application/json",
    "x-request-id": request.headers.get("x-request-id") ?? randomUUID(),
  });
  const token = request.cookies.get(TOKEN_COOKIE)?.value;
  if (token) headers.set("authorization", `Bearer ${token}`);
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
        code: "PROCUREMENT_API_UNAVAILABLE",
        message: "采购服务暂时不可用，请确认后端已启动",
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
