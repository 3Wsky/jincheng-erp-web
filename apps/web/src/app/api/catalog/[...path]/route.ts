import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

type RouteContext = { params: Promise<{ path: string[] }> };

async function proxy(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const { path } = await context.params;
  const baseUrl = (
    process.env.API_BASE_URL ?? "http://localhost:3100/api/v1"
  ).replace(/\/$/, "");
  const target = new URL(
    `${baseUrl}/catalog/${path.map(encodeURIComponent).join("/")}`,
  );
  target.search = request.nextUrl.search;

  const headers = new Headers({
    accept: "application/json",
    "x-request-id": request.headers.get("x-request-id") ?? randomUUID(),
  });
  const writeKey = process.env.CATALOG_WRITE_KEY?.trim();
  if (writeKey) headers.set("x-catalog-write-key", writeKey);
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  if (hasBody) headers.set("content-type", "application/json");

  try {
    const response = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.text() : undefined,
      cache: "no-store",
    });
    if (response.status >= 500) {
      return Response.json(
        {
          code: "CATALOG_SERVICE_UNAVAILABLE",
          message: "货品服务暂时不可用，请确认后端和数据库已启动",
        },
        { status: response.status },
      );
    }
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
        code: "CATALOG_API_UNAVAILABLE",
        message: "货品 API 暂时不可用，请确认后端和数据库已启动",
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
