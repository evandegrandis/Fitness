/** Affiché dès le tap sur une séance (préchargé avec le lien), le temps que le détail arrive. */
export default function SessionDetailLoading() {
  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <div className="animate-pulse flex flex-col gap-4">
        <div className="h-28 rounded-2xl bg-white/5" />
        <div className="h-24 rounded-2xl bg-white/5" />
        <div className="h-24 rounded-2xl bg-white/5" />
      </div>
    </main>
  );
}
