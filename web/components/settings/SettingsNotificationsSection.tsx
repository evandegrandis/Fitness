"use client";

import { useEffect, useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { currentSubscription, disablePush, enablePush, pushSupport, type PushSupport } from "@/lib/push/client";

/**
 * Notifications de fin de repos.
 *
 * Sur iOS, Web Push n'existe QUE si l'app a été ajoutée à l'écran d'accueil (16.4+). On l'explique
 * explicitement plutôt que de laisser un bouton échouer sans raison visible — c'est la question
 * que l'utilisateur se poserait sinon en premier.
 */
export function SettingsNotificationsSection() {
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // `pushSupport()` lit `window`/`navigator` : ne peut pas servir d'état initial (SSR). L'état
  // est donc résolu après montage, en une seule passe asynchrone — et ignoré si le composant a
  // été démonté entre-temps.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const support = pushSupport();
      const subscription = await currentSubscription().catch(() => null);
      if (cancelled) return;
      setSupport(support);
      setEnabled(subscription !== null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      if (enabled) {
        await disablePush();
        setEnabled(false);
      } else {
        const result = await enablePush();
        if (result.ok) {
          setEnabled(true);
        } else {
          setError(
            result.reason === "denied"
              ? "Notifications refusées : à réactiver dans les réglages iOS de l'app."
              : result.reason === "missing_key"
                ? "Clé serveur absente : notifications non configurées."
                : "Impossible d'activer les notifications."
          );
        }
      }
    } catch {
      setError("Impossible d'activer les notifications.");
    } finally {
      setBusy(false);
      setSupport(pushSupport());
    }
  }

  return (
    <GlassCard>
      <p className="text-xs font-semibold uppercase tracking-wide text-[--color-fg-muted]">Notifications</p>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-[--color-fg]">Fin de repos</p>
          <p className="text-xs text-[--color-fg-muted]">
            Une alerte quand le minuteur arrive à zéro, même écran éteint.
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          // « denied » inclus : tant que le blocage n'est pas levé côté système, réessayer ne peut
          // qu'échouer — `requestPermission` ne redemande jamais après un refus.
          disabled={busy || support === "needs_install" || support === "unsupported" || support === "denied"}
          aria-pressed={enabled}
          className="pill min-h-11 shrink-0 px-4 disabled:opacity-40"
          style={enabled ? { color: "var(--accent)", background: "rgba(255,138,61,0.14)" } : undefined}
        >
          {busy ? "…" : enabled ? "Activées" : "Activer"}
        </button>
      </div>

      {support === "needs_install" && (
        <p className="mt-3 text-xs text-amber-200/80">
          iOS n&apos;autorise les notifications que depuis une app installée. Ouvre Jeera dans Safari,
          puis Partager → « Sur l&apos;écran d&apos;accueil », et relance-la depuis l&apos;icône.
        </p>
      )}
      {support === "unsupported" && (
        <p className="mt-3 text-xs text-[--color-fg-muted]">Ce navigateur ne gère pas les notifications push.</p>
      )}
      {support === "denied" && (
        <p className="mt-3 text-xs text-rose-300/80">
          Notifications bloquées pour Jeera : à réautoriser dans les réglages du système.
        </p>
      )}
      {error && <p className="mt-3 text-xs text-rose-300/80">{error}</p>}
    </GlassCard>
  );
}
