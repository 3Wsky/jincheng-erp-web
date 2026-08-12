import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

type RouteContext = { params: Promise<{ path?: string[] }> };

const TOKEN_COOKIE = "erp_session";

function apiBaseUrl(): string {
  return (process.env.API_BASE_URL ?? "http://localhost:3100/api/v1").replace(
    /\/$/,
    "",
  );
}

/**
 * 调拨 BFF 代理:携带登录 Cookie 中的令牌转发到后端 /transfers/*。
 * 可选 catch-all:GET/POST /api/transfers 与 /api/transfers/{id}/submit 均可命中。
 */
async function proxy(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const { path } = await context.params;
  const pathname = (path ?? []).map(encodeURIComponent).join("/");
  const target = new URL(
    `${apiBaseUrl()}/transfers${pathname ? `/${pathname}` : ""}`,
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
        code: "TRANSFER_API_UNAVAILABLE",
        message: "调拨服务暂时不可用，请确认后端已启动",
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
