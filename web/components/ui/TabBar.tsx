"use client";

import { useEffect, useRef, type MouseEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dumbbell, TrendingUp, History } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Séance", icon: Dumbbell, match: (p: string) => p === "/" },
  { href: "/progres", label: "Progrès", icon: TrendingUp, match: (p: string) => p.startsWith("/progres") },
  { href: "/historique", label: "Historique", icon: History, match: (p: string) => p.startsWith("/historique") },
];

/**
 * Au-delà, le changement d'onglet par le routeur est jugé bloqué (réseau capté mais muet, onglet
 * pas encore préchargé) : on charge l'onglet comme une page, que le service worker sert de son
 * cache en moins d'une seconde. Mesuré le 08/10/2026 : sans ce filet, Progrès restait 30 s et
 * plus sur l'écran précédent quand la 3G ne répondait plus.
 */
const TAB_NAVIGATION_FALLBACK_MS = 1_500;

export function TabBar() {
  const pathname = usePathname();
  const fallbackTimer = useRef<number | null>(null);

  // Navigation aboutie (ou partie ailleurs) : le filet n'a plus lieu d'être.
  useEffect(() => {
    if (fallbackTimer.current !== null) window.clearTimeout(fallbackTimer.current);
    fallbackTimer.current = null;
  }, [pathname]);

  const onTabClick = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (fallbackTimer.current !== null) window.clearTimeout(fallbackTimer.current);
    if (navigator.onLine === false) {
      event.preventDefault();
      window.location.assign(href);
      return;
    }
    fallbackTimer.current = window.setTimeout(() => {
      fallbackTimer.current = null;
      if (window.location.pathname !== href) window.location.assign(href);
    }, TAB_NAVIGATION_FALLBACK_MS);
  };

  return (
    <nav className="sticky bottom-0 z-40 mx-auto w-full max-w-md px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
      <div className="surface-solid flex items-center justify-around rounded-full px-2 py-1.5">
        {TABS.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              onClick={active ? undefined : (event) => onTabClick(event, href)}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 rounded-full py-2 text-[0.68rem] font-semibold transition",
                active ? "text-(--color-fg)" : "text-(--color-fg-faint)",
              )}
            >
              <Icon
                size={20}
                className={cn("transition", active && "text-accent-gradient")}
                style={active ? { color: "var(--accent)" } : undefined}
              />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
