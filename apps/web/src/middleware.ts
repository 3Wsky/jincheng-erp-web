import { NextResponse, type NextRequest } from "next/server";

const TOKEN_COOKIE = "erp_session";

/** 无需登录即可访问的路径 */
const PUBLIC_PATHS = ["/login"];

/**
 * 登录会话保护：访问业务页面前检查 erp_session Cookie。
 * 无凭证时跳转到登录页，并携带 next 参数便于登录后回跳。
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  if (isPublic) return NextResponse.next();

  const token = request.cookies.get(TOKEN_COOKIE)?.value;
  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * 匹配所有页面路由，跳过：
     * - /api/*（BFF 代理自行处理鉴权）
     * - /_next/*、静态资源
     * - 图标与图片
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)).*)",
  ],
};
