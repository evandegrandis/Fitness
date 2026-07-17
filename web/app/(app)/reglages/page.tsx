"use client";

import { useWorkoutStore } from "@/lib/store/workout";
import { SettingsBackupSection } from "@/components/settings/SettingsBackupSection";
import { SettingsGoalsSection } from "@/components/settings/SettingsGoalsSection";
import { SettingsBodySection } from "@/components/settings/SettingsBodySection";
import { SettingsPreferencesSection } from "@/components/settings/SettingsPreferencesSection";
import { SettingsExercisesSection } from "@/components/settings/SettingsExercisesSection";

export default function ReglagesPage() {
  const hasHydratedStorage = useWorkoutStore((s) => s.hasHydratedStorage);
  const goals = useWorkoutStore((s) => s.goals);
  const settings = useWorkoutStore((s) => s.settings);
  const catalog = useWorkoutStore((s) => s.catalog);

  if (!hasHydratedStorage) {
    return (
      <main className="mx-auto w-full max-w-md px-5 py-8">
        <h1 className="font-display text-2xl font-bold text-accent-gradient">Réglages</h1>
        <div className="mt-6 flex flex-col gap-4 animate-pulse">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-white/5" />
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-8">
      <div className="pt-[max(1.25rem,env(safe-area-inset-top))]">
        <h1 className="font-display text-2xl font-bold text-accent-gradient">Réglages</h1>
      </div>

      <div className="mt-4 flex flex-col gap-4">
        <SettingsExercisesSection catalog={catalog} />
        <SettingsGoalsSection goals={goals} />
        <SettingsBodySection settings={settings} />
        <SettingsPreferencesSection settings={settings} />
        <SettingsBackupSection />
      </div>
    </main>
  );
}
