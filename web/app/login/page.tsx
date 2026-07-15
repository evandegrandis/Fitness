import { login } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; from?: string }>;
}) {
  const { error, from } = await searchParams;

  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <div className="glass glass-card w-full max-w-sm text-center">
        <div className="mx-auto mb-5 h-14 w-14 rounded-2xl btn-accent grid place-items-center text-2xl font-display font-bold">
          J
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Jeera</h1>
        <p className="mt-1 text-sm text-[--color-fg-muted]">Entre ton code d'accès</p>

        <form action={login} className="mt-6 space-y-3">
          <input type="hidden" name="from" value={from ?? "/"} />
          <input
            name="passcode"
            type="password"
            inputMode="numeric"
            autoFocus
            placeholder="Code"
            className="w-full rounded-2xl bg-white/5 border border-white/10 px-4 py-3 text-center tnum text-lg outline-none focus:border-[--accent] transition"
          />
          {error && (
            <p className="text-sm text-[--color-danger]">Code incorrect</p>
          )}
          <button type="submit" className="btn-accent w-full py-3 text-sm">
            Entrer
          </button>
        </form>
      </div>
    </main>
  );
}
