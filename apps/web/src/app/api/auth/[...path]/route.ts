import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

type RouteContext = { params: Promise<{ path: string[] }> };

const TOKEN_COOKIE = "erp_session";
const TOKEN_MAX_AGE = 8 * 60 * 60; // 与后端 AUTH_TOKEN_TTL_SECONDS 默认一致

function apiBaseUrl(): string {
  return (process.env.API_BASE_URL ?? "http://localhost:3100/api/v1").replace(
    /\/$/,
    "",
  );
}

/**
 * 认证 BFF 代理：
 * - POST /api/auth/login → 转发登录，成功后把 accessToken 写入 httpOnly Cookie。
 * - POST /api/auth/logout → 转发登出并清除 Cookie。
 * - GET /api/auth/me 等 → 携带 Cookie 中的令牌转发。
 */
async function proxy(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const { path } = await context.params;
  const pathname = path.map(encodeURIComponent).join("/");
  const target = new URL(`${apiBaseUrl()}/auth/${pathname}`);
  target.search = request.nextUrl.search;

  const headers = new Headers({
    accept: "application/json",
    "x-request-id": request.headers.get("x-request-id") ?? randomUUID(),
  });
  const token = request.cookies.get(TOKEN_COOKIE)?.value;
  if (token) headers.set("authorization", `Bearer ${token}`);
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  if (hasBody) headers.set("content-type", "application/json");

  let response: Response;
  try {
    response = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.text() : undefined,
      cache: "no-store",
    });
  } catch {
    return Response.json(
      { code: "AUTH_API_UNAVAILABLE", message: "登录服务暂时不可用，请确认后端已启动" },
      { status: 503 },
    );
  }

  const isLogin = pathname === "login" && request.method === "POST";
  const isLogout = pathname === "logout" && request.method === "POST";

  let bodyBuffer: ArrayBuffer | null = null;
  let loginPayload: { accessToken?: string } | null = null;
  if (isLogin) {
    bodyBuffer = await response.arrayBuffer();
    try {
      loginPayload = JSON.parse(
        new TextDecoder().decode(bodyBuffer),
      ) as { accessToken?: string };
    } catch {
      loginPayload = null;
    }
  }

  // 生产环境（HTTPS）必须带 Secure，防止令牌经明文传输
  const secureFlag = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const setCookie: string[] = [];
  if (isLogin && response.ok && loginPayload?.accessToken) {
    setCookie.push(
      `${TOKEN_COOKIE}=${loginPayload.accessToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TOKEN_MAX_AGE}${secureFlag}`,
    );
  }
  if (isLogout) {
    setCookie.push(
      `${TOKEN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`,
    );
  }

  const passthrough = new Response(bodyBuffer ?? response.body, {
    status: response.status,
    headers: {
      "content-type":
        response.headers.get("content-type") ?? "application/json",
      ...(setCookie.length > 0 ? { "set-cookie": setCookie.join(", ") } : {}),
    },
  });
  return passthrough;
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
