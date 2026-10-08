"use client";

import { AppErrorRecovery } from "@/components/errors/AppErrorRecovery";

/** Un onglet qui plante garde la barre d'onglets et la séance (voir `AppErrorRecovery`). */
export default function AppError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <AppErrorRecovery error={error} retry={unstable_retry} />;
}
