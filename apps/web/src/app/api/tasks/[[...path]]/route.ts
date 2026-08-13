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

/** 待办 BFF 代理:携带登录 Cookie 中的令牌转发到后端 /tasks/*(只读) */
async function proxy(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const { path } = await context.params;
  const pathname = (path ?? []).map(encodeURIComponent).join("/");
  const target = new URL(
    `${apiBaseUrl()}/tasks${pathname ? `/${pathname}` : ""}`,
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
        code: "TASKS_API_UNAVAILABLE",
        message: "待办服务暂时不可用，请确认后端已启动",
      },
      { status: 503 },
    );
  }
}

export const dynamic = "force-dynamic";

export function GET(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}
