/**
 * Jeton porteur des routes machine à machine. L'app tourne en accès public (`JEERA_PUBLIC_MODE`) :
 * toute route `/api/*` est ouverte à Internet, seule la possession du jeton autorise l'appel.
 * Sans jeton configuré côté serveur, la route refuse tout.
 */
function constantTimeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let diff = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    diff |= (a[index % Math.max(a.length, 1)] ?? 0) ^ (b[index % Math.max(b.length, 1)] ?? 0);
  }
  return diff === 0;
}

/** `null` si autorisé, sinon la réponse d'erreur à renvoyer telle quelle. */
export function rejectUnlessBearer(request: Request, envName: string): Response | null {
  const expected = process.env[envName];
  if (!expected) return Response.json({ error: "disabled" }, { status: 503 });
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ") || !constantTimeEqual(auth.slice(7).trim(), expected)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
