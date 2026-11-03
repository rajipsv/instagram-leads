import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, sessionToken } from "@/lib/session";

/**
 * Optional password lock. Set APP_PASSWORD (in the hosting env or the project .env) before putting the app
 * on the internet, because it shows lead data and can change it. With no APP_PASSWORD, the app is open, which is fine
 * on 127.0.0.1. On Vercel it refuses to serve until APP_PASSWORD is set.
 */
export async function middleware(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) {
    // On a public host (Vercel), never serve lead data without a lock.
    if (process.env.VERCEL) {
      return new NextResponse(
        "APP_PASSWORD is not set. Add it in Vercel → Project → Settings → Environment Variables, then redeploy.",
        { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
      );
    }
    return NextResponse.next();
  }
  const { pathname } = req.nextUrl;
  if (pathname === "/login") return NextResponse.next();
  if (req.cookies.get(COOKIE)?.value === (await sessionToken(password))) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icons/|sw.js|offline.html|manifest.webmanifest|favicon.ico).*)"],
};
