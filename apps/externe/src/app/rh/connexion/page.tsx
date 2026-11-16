import { PastilleEnvironnement } from "@/components/PastilleEnvironnement";
import type { Metadata } from "next";
import Image from "next/image";
import ThemeClair from "@/components/ThemeClair";
import { versInterne } from "@/lib/adresses";
import { TEL_AGENCE, TEL_AGENCE_LIEN } from "@/lib/messaging";
import { Picto, type NomPicto } from "../_ui/Icones";
import ConnexionRh from "./ConnexionRh";

export const metadata: Metadata = {
  title: "Espace RH — Connexion",
  robots: { index: false, follow: false },
};

/*
 * TEXTES À VALIDER — la promesse aux RH (titre et quatre points) est une
 * proposition, pas un texte de Bailly. Les quatre points reprennent ce que
 * l'espace montre réellement : les mobilités, le budget, les factures (quand
 * le CRM en porte), le lien des salariés.
 */
const PROMESSE: { picto: NomPicto; titre: string; texte: string }[] = [
  { picto: "personnes", titre: "Suivi des mobilités", texte: "Chaque collaborateur, de sa demande au jour du déménagement." },
  { picto: "euro", titre: "Budget", texte: "Engagé, signé, facturé : vos montants HT et TTC, mois par mois." },
  { picto: "document", titre: "Factures", texte: "Les factures de vos mobilités, réunies au même endroit." },
  { picto: "lien", titre: "Un lien unique", texte: "À transmettre à vos salariés : leurs demandes arrivent ici." },
];

/**
 * La porte de l'espace RH, en deux panneaux : à gauche la photo de jour du
 * site (nette, sans voile — la règle de David : « héros = photo de jour
 * nette »), la promesse posée dessus dans une carte pleine ; à droite le
 * formulaire. Sur téléphone, la photo devient un bandeau en tête.
 *
 * Aux couleurs de Bailly : tant que personne n'est connecté, on ne sait pas de
 * quelle entreprise il s'agit — c'est le compte qui le dira, et l'espace
 * prendra alors ses couleurs.
 */
export default async function ConnexionRhPage({ searchParams }: { searchParams: Promise<{ refus?: string }> }) {
  // ?refus=1 : la session ouverte n'a pas accès à l'espace RH (PortailRh, proxy.ts).
  const { refus } = await searchParams;
  return (
    <div className="min-h-dvh bg-paper text-ink lg:grid lg:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)]">
      <ThemeClair />

      {/* ── La photo ── */}
      <section className="relative h-[236px] overflow-hidden bg-[#d8d3c8] sm:h-[320px] lg:sticky lg:top-0 lg:h-dvh">
        <Image
          src="/marque/hero-salon.jpg"
          alt="Un salon baigné de lumière, grandes baies ouvertes sur la ville"
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 56vw"
          className="object-cover object-[28%_55%]"
        />
        <div className="absolute left-5 top-5 flex items-center gap-3 rounded-full bg-white py-2 pl-4 pr-3.5 shadow-[0_10px_30px_-12px_rgba(27,26,24,0.45)] sm:left-8 sm:top-7 lg:left-10 lg:top-9">
          <Image src="/marque/bailly-logo.svg" alt="Bailly Déménagement" width={200} height={64} priority className="h-auto w-[104px]" />
          <PastilleEnvironnement style={{ marginLeft: 0 }} />
          <span className="h-5 w-px bg-line-strong" />
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-mid">Espace RH</span>
        </div>
        <div className="absolute bottom-10 left-10 right-10 hidden max-w-[560px] lg:block">
          <Promesse />
        </div>
      </section>

      {/* ── Le formulaire ── */}
      <main className="relative flex flex-col px-5 pb-8 pt-8 sm:px-10 lg:min-h-dvh lg:px-14 lg:pb-10 lg:pt-9 xl:px-20">
        <p className="hidden text-right text-[13px] text-ink-soft lg:block">
          Pas encore d&apos;accès ? Votre interlocuteur Bailly vous en ouvre un —{" "}
          <a href={TEL_AGENCE_LIEN} className="whitespace-nowrap font-semibold text-ink underline-offset-4 hover:underline">
            {TEL_AGENCE}
          </a>
        </p>

        <div className="mx-auto my-auto w-full max-w-[420px] py-4 lg:py-10">
          <p className="reveal flex items-center gap-2.5 text-[11.5px] font-bold uppercase tracking-[0.18em] text-ink-mid" style={{ "--d": "0.05s" } as React.CSSProperties}>
            <span className="h-2.5 w-2.5 rounded-[3px] bg-[#f5d033]" />
            Espace RH · Entreprises
          </p>
          <h1 className="font-serif reveal mt-4 text-[34px] leading-[1.05] sm:text-[40px]" style={{ "--d": "0.12s" } as React.CSSProperties}>
            Connexion à votre espace
          </h1>
          {/* TEXTE À VALIDER */}
          <p className="reveal mt-3 text-[15px] leading-relaxed text-ink-soft" style={{ "--d": "0.18s" } as React.CSSProperties}>
            Les déménagements de vos collaborateurs avec Bailly Déménagement, aux couleurs de votre entreprise.
          </p>

          <div className="reveal mt-8" style={{ "--d": "0.24s" } as React.CSSProperties}>
            <ConnexionRh refus={refus !== undefined} />
          </div>

          {/* Un compte de l'équipe se connecte ici aussi : il choisit ensuite
              l'entreprise dont il veut voir l'espace. L'ancien libellé (« Vous
              êtes de l'équipe ? » → autre page) laissait croire le contraire. */}
          <div className="reveal mt-8 flex gap-3.5 rounded-[18px] border border-line bg-card px-4 py-3.5" style={{ "--d": "0.3s" } as React.CSSProperties}>
            <Image src="/marque/bailly-symbole.svg" alt="" width={36} height={36} className="h-9 w-9 shrink-0" />
            <p className="text-[12.5px] leading-relaxed text-ink-soft">
              <span className="font-semibold text-ink">Équipe Bailly :</span> votre compte fonctionne ici aussi, vous choisirez ensuite l&apos;entreprise à afficher.{" "}
              {/* Un simple lien, vers l'adresse complète : l'espace équipe vit dans l'autre app. Un <Link>
                  vers /login était préchargé par Next, redirigé vers cette autre origine, et refusé (CORS). */}
              <a href={versInterne("/login")} className="font-semibold text-ink underline-offset-4 hover:underline">
                Aller à l&apos;espace équipe
              </a>
            </p>
          </div>
        </div>

        {/* Sur téléphone et tablette, la promesse passe sous le formulaire. */}
        <div className="mx-auto mt-4 w-full max-w-[560px] lg:hidden">
          <Promesse />
        </div>

        {/* Sur ordinateur, la même phrase est en tête du panneau. */}
        <footer className="mx-auto mt-8 w-full max-w-[420px] text-center text-[12.5px] leading-relaxed text-ink-soft lg:hidden">
          Pas encore d&apos;accès ? Votre interlocuteur Bailly Déménagement vous en ouvre un —{" "}
          <a href={TEL_AGENCE_LIEN} className="whitespace-nowrap font-semibold text-ink">
            {TEL_AGENCE}
          </a>
          .
        </footer>
      </main>
    </div>
  );
}

/** La promesse aux RH : une carte noire pleine, posée sur la photo sans la voiler. */
function Promesse() {
  return (
    <div className="reveal rounded-[28px] bg-[#1b1a18] p-6 text-white shadow-[0_30px_60px_-30px_rgba(27,26,24,0.75)] sm:p-8" style={{ "--d": "0.2s" } as React.CSSProperties}>
      <span className="block h-1 w-10 rounded-full bg-[#f5d033]" />
      <h2 className="font-serif mt-5 text-balance text-[24px] leading-[1.12] sm:text-[28px]">
        Les mobilités de vos collaborateurs, <span className="text-[#f5d033]">suivies d&apos;un seul endroit.</span>
      </h2>
      <ul className="mt-6 grid gap-x-6 gap-y-5 sm:grid-cols-2">
        {PROMESSE.map((p) => (
          <li key={p.titre} className="flex gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-white/10 text-[#f5d033]">
              <Picto nom={p.picto} taille={18} />
            </span>
            <span>
              <span className="block text-[14px] font-semibold">{p.titre}</span>
              <span className="mt-0.5 block text-[13px] leading-snug text-white/70">{p.texte}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
