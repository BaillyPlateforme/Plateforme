import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import ThemeClair from "@/components/ThemeClair";
import ConnexionRh from "./ConnexionRh";

export const metadata: Metadata = {
  title: "Espace RH — Connexion",
  robots: { index: false, follow: false },
};

/**
 * La porte de l'espace RH. Elle est aux couleurs de Bailly : tant que personne
 * n'est connecté, on ne sait pas de quelle entreprise il s'agit — c'est le
 * compte qui le dira, et l'espace prendra alors ses couleurs.
 */
export default function ConnexionRhPage() {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-paper px-6 py-12 text-ink">
      <ThemeClair />
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="halo absolute left-1/2 top-1/2 h-[820px] w-[820px] -translate-x-1/2 -translate-y-1/2"
          style={{ "--halo": "color-mix(in srgb, var(--color-brand) 30%, transparent)" } as React.CSSProperties}
        />
      </div>
      <div className="relative z-10 w-full max-w-[440px]">
        <Image src="/marque/bailly-logo.svg" alt="Bailly Déménagement" width={200} height={64} priority className="mx-auto h-auto w-[150px]" />
        <div className="bloc reveal mt-8 rounded-[28px] border border-line bg-card p-7 sm:p-9">
          <p className="eyebrow text-brand-ink">Espace RH</p>
          <h1 className="font-serif mt-2 text-[30px] leading-tight">
            Suivez la mobilité de vos <span className="gradient-text">collaborateurs</span>
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">
            Demandes, avancement, budget estimé : tout ce que Bailly Déménagement prépare pour votre entreprise, au même endroit.
          </p>
          <div className="mt-6">
            <ConnexionRh />
          </div>
        </div>
        <p className="mt-6 text-center text-[12.5px] text-ink-soft">
          Pas encore d&apos;accès ? Votre interlocuteur Bailly Déménagement vous en ouvre un.{" "}
          <a href="tel:+33169103520" className="font-semibold text-ink underline-offset-4 hover:underline">
            01 69 10 35 20
          </a>
        </p>
        {/* Un compte de l'équipe se connecte ici aussi : il choisit ensuite
            l'entreprise dont il veut voir l'espace. L'ancien libellé (« Vous
            êtes de l'équipe ? » → autre page) laissait croire le contraire. */}
        <p className="mt-2 text-center text-[12.5px] text-ink-soft">
          Équipe Bailly : votre compte fonctionne ici aussi, vous choisirez ensuite l&apos;entreprise à afficher.{" "}
          <Link href="/login" className="font-medium text-ink underline-offset-4 hover:underline">
            Aller à l&apos;espace équipe
          </Link>
        </p>
      </div>
    </div>
  );
}
