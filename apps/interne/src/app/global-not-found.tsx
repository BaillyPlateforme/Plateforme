import type { Metadata } from "next";
import Link from "next/link";
import "./(interne)/globals.css";

/*
 * La page 404 de l'app interne. L'app a plusieurs mises en page racines
 * (l'interne, la tablette, l'outil terrain) : une adresse qui ne mène à rien
 * n'appartient à aucune, d'où cette page autonome.
 */
export const metadata: Metadata = {
  title: "Page introuvable — Bailly",
  robots: { index: false, follow: false },
};

export default function GlobalNotFound() {
  return (
    <html lang="fr">
      <body className="flex min-h-dvh items-center justify-center bg-shell px-6 text-ink">
        <div className="max-w-md text-center">
          <p className="eyebrow text-brand-ink">Erreur 404</p>
          <h1 className="mt-3 text-[28px] font-bold">Cette page n&apos;existe pas</h1>
          <p className="mt-3 text-[15px] text-ink-soft">L&apos;adresse est peut-être incomplète, ou la page a été déplacée.</p>
          <Link href="/" className="mt-6 inline-flex h-11 items-center rounded-full bg-ink px-5 text-[14px] font-semibold text-shell">
            Retour au CRM
          </Link>
        </div>
      </body>
    </html>
  );
}
