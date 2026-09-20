import { updateSession } from "@/utils/supabase/middleware";

export async function middleware(request) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - API routes (health checks stay public)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico and common image assets
     */
    "/((?!api(?:/|$)|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
