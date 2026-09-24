"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dumbbell, TrendingUp, History } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Séance", icon: Dumbbell, match: (p: string) => p === "/" },
  { href: "/progres", label: "Progrès", icon: TrendingUp, match: (p: string) => p.startsWith("/progres") },
  { href: "/historique", label: "Historique", icon: History, match: (p: string) => p.startsWith("/historique") },
];

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav className="sticky bottom-0 z-40 mx-auto w-full max-w-md px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
      <div className="surface-solid flex items-center justify-around rounded-full px-2 py-1.5">
        {TABS.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
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
