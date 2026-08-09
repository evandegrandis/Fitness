import { NextResponse, type NextRequest } from "next/server";

/**
 * Garde d'accès par passcode (app perso mono-utilisateur).
 * Laisse passer les assets, l'API d'auth et la page de login ;
 * sinon exige un cookie de session valide.
 */
const PUBLIC_PATHS = new Set([
  "/login",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/sw.js",
  "/icon",
  "/apple-icon",
]);

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    PUBLIC_PATHS.has(pathname) ||
    pathname.startsWith("/_next/")
  ) {
    return NextResponse.next();
  }

  // L'app est volontairement publique lorsque ce choix est explicite côté hébergeur.
  // On ne déduit jamais ce mode de l'absence accidentelle d'un secret.
  if (process.env.JEERA_PUBLIC_MODE === "true") return NextResponse.next();

  const expected = process.env.SESSION_SECRET;
  // Dev local explicite : mode sans auth toléré. Un build déployé ne doit en revanche JAMAIS
  // devenir public silencieusement parce qu'une variable Vercel manque.
  if (!expected && process.env.NODE_ENV !== "production") return NextResponse.next();

  const session = req.cookies.get("jeera_session")?.value;
  if (session === expected) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("from", pathname);
  if (!expected) url.searchParams.set("configuration", "missing");
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
