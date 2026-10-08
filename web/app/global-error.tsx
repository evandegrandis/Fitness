"use client";

import "./globals.css";
import { AppErrorRecovery } from "@/components/errors/AppErrorRecovery";

/** Dernier filet, à la place de l'écran anglais de Next : même récupération, en français. */
export default function GlobalError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return (
    <html lang="fr" className="h-full">
      <body className="min-h-full flex flex-col">
        <title>Jeera</title>
        <AppErrorRecovery error={error} retry={unstable_retry} />
      </body>
    </html>
  );
}
