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

  redirect(from.startsWith("/") ? from : "/");
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete("jeera_session");
  redirect("/login");
}
