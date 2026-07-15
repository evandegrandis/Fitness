import { NextResponse, type NextRequest } from "next/server";

/**
 * Garde d'accès par passcode (app perso mono-utilisateur).
 * Laisse passer les assets, l'API d'auth et la page de login ;
 * sinon exige un cookie de session valide.
 */
const PUBLIC_PATHS = ["/login", "/api/login"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/manifest.webmanifest"
  ) {
    return NextResponse.next();
  }

  const expected = process.env.SESSION_SECRET;
  // Si aucun secret configuré (dev local sans .env), on n'entrave pas.
  if (!expected) return NextResponse.next();

  const session = req.cookies.get("jeera_session")?.value;
  if (session === expected) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("from", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
