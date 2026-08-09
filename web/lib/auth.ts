"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Vérifie le passcode et pose le cookie de session.
 * `APP_PASSCODE` et `SESSION_SECRET` proviennent des variables d'env Vercel.
 */
export async function login(formData: FormData): Promise<void> {
  const passcode = String(formData.get("passcode") ?? "");
  const from = String(formData.get("from") ?? "/");

  const expected = process.env.APP_PASSCODE;
  const secret = process.env.SESSION_SECRET;

  if (!expected || !secret || passcode !== expected) {
    redirect(`/login?error=1&from=${encodeURIComponent(from)}`);
  }

  const store = await cookies();
  store.set("jeera_session", secret, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  // Refuse aussi les URLs protocol-relative (`//evil.example`) : elles commencent bien par `/`
  // mais quitteraient l'origine dans un navigateur.
  redirect(from.startsWith("/") && !from.startsWith("//") ? from : "/");
}

/**
 * Les Server Actions sont des endpoints réseau à part entière. Le proxy protège l'UI, mais chaque
 * mutation revérifie aussi le cookie au point d'écriture (défense en profondeur). En développement
 * local sans `SESSION_SECRET`, on conserve le mode sans authentification déjà prévu par le proxy.
 */
export async function requireAuthenticatedSession(): Promise<void> {
  if (process.env.JEERA_PUBLIC_MODE === "true") return;

  const expected = process.env.SESSION_SECRET;
  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Authentification serveur non configurée");
    }
    return;
  }
  const store = await cookies();
  if (store.get("jeera_session")?.value !== expected) {
    throw new Error("Non autorisé");
  }
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete("jeera_session");
  redirect("/login");
}
