import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = process.env.JWT_SECRET || "secret-jwt-key-lucky-wheel-12345";
const key = new TextEncoder().encode(JWT_SECRET);
const ADMIN_COOKIE_NAME = "admin_session_token";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect admin routes using dedicated admin session
  if (pathname.startsWith("/admin")) {
    const adminToken = request.cookies.get(ADMIN_COOKIE_NAME)?.value;

    // Allow accessing admin login page if not logged in
    if (pathname === "/admin/login") {
      if (adminToken) {
        try {
          const { payload } = await jwtVerify(adminToken, key, {
            algorithms: ["HS256"],
          });
          if (payload.role === "admin") {
            return NextResponse.redirect(new URL("/admin", request.url));
          }
        } catch {
          // Invalid token, allow reaching login
        }
      }
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set("x-pathname", pathname);
      return NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      });
    }

    // All other /admin routes require valid admin session
    if (!adminToken) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }

    try {
      const { payload } = await jwtVerify(adminToken, key, {
        algorithms: ["HS256"],
      });

      if (payload.role !== "admin") {
        const response = NextResponse.redirect(new URL("/admin/login", request.url));
        response.cookies.delete(ADMIN_COOKIE_NAME);
        return response;
      }
    } catch {
      const response = NextResponse.redirect(new URL("/admin/login", request.url));
      response.cookies.delete(ADMIN_COOKIE_NAME);
      return response;
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-pathname", pathname);
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
