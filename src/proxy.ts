import { NextResponse, type NextRequest } from "next/server";
import { refreshSession } from "@/shared/supabase/proxy-session";

const PUBLIC_PATHS = ["/login", "/~offline"];

export async function proxy(request: NextRequest) {
  const { response, userId } = await refreshSession(request);
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  if (!userId && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (userId && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  // Tout sauf les fichiers statiques, le service worker, le manifeste et les icônes.
  matcher: ["/((?!_next/static|_next/image|serwist/|manifest.webmanifest|icons/|favicon.ico|.*\\.(?:png|svg|ico|webp|txt)$).*)"],
};
