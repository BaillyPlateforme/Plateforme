import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6">
      <div className="animate-fade-up">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1 text-xs text-ink-soft">
          <span className="h-1.5 w-1.5 rounded-full bg-good" />
          Plateforme interne
        </div>
        <h1 className="font-serif text-5xl leading-[1.05] tracking-tight md:text-6xl">
          Bailly Déménagement
        </h1>
        <p className="mt-4 max-w-md text-lg text-ink-soft">
          Réception, analyse et chiffrage des demandes — du formulaire client au devis.
        </p>
        <div className="mt-9 flex gap-3">
          <Link
            href="/dashboard"
            className="rounded-lg bg-accent px-5 py-3 text-sm font-medium text-white transition hover:bg-accent-dark"
          >
            Espace équipe
          </Link>
          <Link
            href="/demande"
            className="rounded-lg border border-line-strong bg-card px-5 py-3 text-sm font-medium transition hover:border-ink"
          >
            Formulaire de demande
          </Link>
        </div>
      </div>
    </main>
  );
}
