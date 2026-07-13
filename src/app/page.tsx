import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6">
      <h1 className="text-3xl font-semibold">Bailly Déménagement</h1>
      <p className="mt-2 text-neutral-500">
        Plateforme interne — réception, analyse et qualification des demandes.
      </p>
      <div className="mt-8 flex gap-4">
        <Link
          href="/dashboard"
          className="rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Dashboard
        </Link>
        <Link
          href="/demande"
          className="rounded-lg border border-neutral-300 px-5 py-2.5 text-sm font-medium hover:bg-neutral-50"
        >
          Formulaire de demande
        </Link>
      </div>
    </main>
  );
}
