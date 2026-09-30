import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import Reveal from "./Reveal";
import SiteHeader from "./SiteHeader";
import { FORMULES, PRESTATIONS, TRANCHES_DISTANCE, TVA_DEFAUT } from "@/lib/pricing/grille";

export const metadata = {
  title: "Bailly Déménagement — devis en ligne et pilotage",
  description:
    "Décrivez votre déménagement, recevez une estimation immédiate établie sur notre grille tarifaire. Et pour l'équipe : demandes, devis et plannings au même endroit.",
};

const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

/* Le nombre de gestes pris en charge par Bailly, formule par formule : il est
   lu dans la grille plutôt que recopié, pour ne jamais mentir sur la page. */
const LIGNES = PRESTATIONS.flatMap((c) => c.lignes);
const COMPTE = {
  eco: LIGNES.filter((l) => l.eco === "Bailly").length,
  standard: LIGNES.filter((l) => l.standard === "Bailly").length,
  luxe: LIGNES.filter((l) => l.luxe === "Bailly").length,
};
// Espace fine insécable entre les milliers : toLocaleString dépend de l'ICU
// embarqué par le serveur, qui ne la met pas toujours.
const PORTEE_KM = String(TRANCHES_DISTANCE[TRANCHES_DISTANCE.length - 1].max).replace(
  /\B(?=(\d{3})+(?!\d))/g,
  "\u2009",
);

export default function Home() {
  return (
    <>
      <SiteHeader />

      <main className="flex-1">
        <Hero />
        <Parcours />
        <Formules />
        <Equipe />
        <Fin />
      </main>

      <Pied />
    </>
  );
}

/* ─────────────────────────── Héros ─────────────────────────── */

function Hero() {
  return (
    <section className="grain relative flex min-h-[100svh] flex-col overflow-hidden bg-ink">
      <Image
        src="/login-interieur.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="ken-burns object-cover object-center"
      />

      {/* Voiles : la photo descend derrière le texte sans l'assombrir d'un bloc. */}
      <div className="absolute inset-0 bg-ink/62" />
      <div className="absolute inset-0 bg-linear-to-b from-ink/85 via-ink/35 to-ink/92" />
      <div className="absolute inset-0 bg-linear-to-tr from-accent/30 via-transparent to-[#ec4899]/18" />
      <div className="drift absolute -left-40 top-24 h-[520px] w-[520px] rounded-full bg-accent/25 blur-3xl" />
      <div
        className="drift absolute -right-32 bottom-[-120px] h-[460px] w-[460px] rounded-full bg-[#8b5cf6]/22 blur-3xl"
        style={{ animationDuration: "26s", animationDelay: "-9s" }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-[1200px] flex-1 flex-col justify-center px-6 pb-16 pt-[100px] lg:px-10 lg:pb-20">
        <div className="reveal max-w-fit" style={delay(60)}>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-[12px] text-white/85 backdrop-blur-md">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-good" />
            Déménagements particuliers et entreprises
          </span>
        </div>

        <h1
          className="font-serif reveal mt-6 max-w-[16ch] text-balance text-[44px] leading-[1.02] text-white sm:text-[56px] lg:text-[64px]"
          style={delay(160)}
        >
          Votre déménagement, <span className="gradient-flow-light">chiffré tout de suite</span>
        </h1>

        <p
          className="reveal mt-5 max-w-[54ch] text-[16px] leading-relaxed text-white/75 sm:text-[17.5px]"
          style={delay(260)}
        >
          Décrivez votre logement en quelques minutes : volume, accès, dates. L&apos;estimation
          tombe aussitôt, calculée sur notre grille tarifaire — la même que celle du commercial,
          au centime près.
        </p>

        {/* Les deux portes de la plateforme. */}
        <div className="mt-9 grid gap-4 md:mt-11 md:grid-cols-2 md:gap-5">
          <Porte
            href="/demande"
            d={380}
            dur="8s"
            accent
            eyebrow="Vous déménagez"
            title="Demander un devis"
            desc="Le parcours client : votre logement, vos accès, votre date. Estimation immédiate, sans engagement."
            points={["Estimation en 3 minutes", "Volume estimé depuis vos photos", "Devis détaillé par e-mail"]}
            icon={<IconDoc />}
            cta="Commencer mon devis"
          />
          <Porte
            href="/dashboard"
            d={480}
            dur="9.5s"
            eyebrow="Vous êtes de l'équipe"
            title="Espace équipe"
            desc="Le poste de pilotage : demandes reçues, chiffrage, devis, agenda et plannings au même endroit."
            points={["Demandes triées et suivies", "Grille tarifaire et simulateur", "Agenda, camions et équipes"]}
            icon={<IconGrid />}
            cta="Ouvrir le poste de pilotage"
          />
        </div>

        {/* Bandeau de chiffres, posé sous les deux portes. */}
        <div
          className="reveal mt-9 grid grid-cols-2 gap-x-8 gap-y-5 border-t border-white/12 pt-6 sm:grid-cols-4"
          style={delay(660)}
        >
          <Chiffre valeur="3 min" legende="pour une estimation complète" />
          <Chiffre valeur="3" legende="formules, de l'économique au premium" />
          <Chiffre valeur={`${PORTEE_KM} km`} legende="de portée, France entière" />
          <Chiffre valeur="1 grille" legende="même tarif en ligne et au bureau" />
        </div>
      </div>

      <a
        href="#parcours"
        aria-label="Voir la suite"
        className="scroll-cue relative z-10 mx-auto mb-7 hidden text-white/70 transition hover:text-white lg:block"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M12 5v14M5 12l7 7 7-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </a>
    </section>
  );
}

function Porte({
  href,
  eyebrow,
  title,
  desc,
  points,
  icon,
  cta,
  accent,
  d,
  dur,
}: {
  href: string;
  eyebrow: string;
  title: string;
  desc: string;
  points: string[];
  icon: ReactNode;
  cta: string;
  accent?: boolean;
  d: number;
  dur: string;
}) {
  return (
    <Link
      href={href}
      className={`edge-glow shine levitate group relative overflow-hidden rounded-[26px] border p-6 backdrop-blur-xl transition-colors sm:p-7 ${
        accent
          ? "border-white/25 bg-linear-to-br from-accent/45 via-white/12 to-white/5 shadow-2xl shadow-accent/25 hover:from-accent/55"
          : "border-white/18 bg-linear-to-br from-white/16 via-white/8 to-white/4 shadow-2xl shadow-ink/35 hover:from-white/24"
      }`}
      style={{ ...delay(d), "--dur": dur, "--shine": "10s", "--shine-delay": `${d + 600}ms` } as CSSProperties}
    >
      <div className="flex items-start justify-between gap-4">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/20 bg-white/12 text-white">
          {icon}
        </span>
        <span className="eyebrow text-white/55">{eyebrow}</span>
      </div>

      <h2 className="font-serif mt-5 text-[25px] leading-tight text-white sm:text-[27px]">{title}</h2>
      <p className="mt-2.5 text-[13.5px] leading-relaxed text-white/72">{desc}</p>

      <ul className="mt-5 space-y-2">
        {points.map((p) => (
          <li key={p} className="flex items-center gap-2.5 text-[13px] text-white/82">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white/15 text-white">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            {p}
          </li>
        ))}
      </ul>

      <span className="mt-7 inline-flex items-center gap-2 text-[13.5px] font-medium text-white">
        {cta}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          className="transition-transform duration-300 group-hover:translate-x-1.5"
        >
          <path d="M5 12h13M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </Link>
  );
}

function Chiffre({ valeur, legende }: { valeur: string; legende: string }) {
  return (
    <div>
      <div className="font-serif text-[27px] leading-none text-white sm:text-[30px]">{valeur}</div>
      <div className="mt-2 text-[11.5px] leading-snug text-white/58">{legende}</div>
    </div>
  );
}

/* ─────────────────────────── Parcours client ─────────────────────────── */

const ETAPES = [
  {
    titre: "Vous décrivez",
    texte:
      "Adresses, volume, étages, ascenseur, distance de portage. Chaque réponse pèse dans le prix — rien n'est demandé pour rien.",
    icon: <IconForm />,
  },
  {
    titre: "Les photos font le volume",
    texte:
      "Pièce par pièce, vos photos donnent une estimation du volume à déménager. Les doublons sont écartés.",
    icon: <IconCamera />,
  },
  {
    titre: "Le prix s'affiche",
    texte:
      "Transport, monte-meubles, portage, garanties : chaque ligne est détaillée, et les trois formules sont comparées côte à côte.",
    icon: <IconEuro />,
  },
  {
    titre: "Un commercial reprend la main",
    texte:
      "Votre demande arrive dans le poste de pilotage. Un devis ferme vous est envoyé, sur la base de ce que vous avez rempli.",
    icon: <IconSend />,
  },
];

function Parcours() {
  return (
    <section id="parcours" className="scroll-mt-20 bg-paper py-24 lg:py-32">
      <div className="mx-auto w-full max-w-[1200px] px-6 lg:px-10">
        <Reveal className="max-w-[46ch]">
          <p className="eyebrow text-accent">Le parcours client</p>
          <h2 className="font-serif mt-4 text-[34px] leading-[1.08] sm:text-[42px]">
            Quatre étapes, et le prix est là
          </h2>
          <p className="mt-5 text-[15.5px] leading-relaxed text-ink-soft">
            Pas de rappel obligatoire, pas de visite pour savoir combien ça coûte. Le calcul est
            le nôtre, appliqué sur place, avec le détail de chaque ligne.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {ETAPES.map((e, i) => (
            <Reveal key={e.titre} delay={i * 90} className="group flex flex-col bg-card p-7 transition-colors hover:bg-subtle/60">
              <div className="flex items-center justify-between">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft text-accent transition-transform duration-500 group-hover:-translate-y-0.5">
                  {e.icon}
                </span>
                <span className="font-serif text-[30px] leading-none text-line-strong">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <h3 className="mt-6 text-[16px] font-medium">{e.titre}</h3>
              <p className="mt-2.5 flex-1 text-[13.5px] leading-relaxed text-ink-soft">{e.texte}</p>
              <div className="mt-auto pt-7">
                <div className="draw-line h-px w-full bg-linear-to-r from-accent/60 to-transparent" />
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={220} className="mt-10 flex flex-wrap items-center gap-4">
          <Link
            href="/demande"
            className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3.5 text-[14px] font-medium text-white shadow-lg shadow-accent/25 transition hover:bg-accent-dark"
          >
            Demander mon estimation
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M5 12h13M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <span className="text-[13px] text-ink-soft">
            Sans engagement · réponse d&apos;un commercial sous 24 h ouvrées
          </span>
        </Reveal>
      </div>
    </section>
  );
}

/* ─────────────────────────── Formules ─────────────────────────── */

function Formules() {
  return (
    <section id="formules" className="scroll-mt-20 border-y border-line bg-card py-24 lg:py-32">
      <div className="mx-auto w-full max-w-[1200px] px-6 lg:px-10">
        <Reveal className="max-w-[48ch]">
          <p className="eyebrow text-accent">Nos formules</p>
          <h2 className="font-serif mt-4 text-[34px] leading-[1.08] sm:text-[42px]">
            Vous choisissez ce que vous nous confiez
          </h2>
          <p className="mt-5 text-[15.5px] leading-relaxed text-ink-soft">
            Trois niveaux de prise en charge, du carton que vous faites vous-même au
            déménagement où vous n&apos;avez rien à toucher.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          {FORMULES.map((f, i) => {
            const vedette = f.key === "standard";
            return (
              <Reveal
                key={f.key}
                delay={i * 110}
                className={`relative flex flex-col rounded-3xl border p-7 transition-shadow ${
                  vedette
                    ? "border-accent bg-linear-to-b from-accent-soft to-card shadow-xl shadow-accent/10"
                    : "border-line bg-card hover:shadow-md"
                }`}
              >
                {vedette && (
                  <span className="absolute -top-3 left-7 rounded-full bg-accent px-3 py-1 text-[11px] font-medium text-white">
                    Le plus choisi
                  </span>
                )}
                <h3 className="font-serif text-[24px] leading-none">{f.label}</h3>
                <p className="mt-3 min-h-[44px] text-[13.5px] leading-relaxed text-ink-soft">
                  {f.description}
                </p>

                <div className="mt-6 flex items-baseline gap-2 border-t border-line pt-6">
                  <span className="font-serif text-[40px] leading-none tnum">{COMPTE[f.key]}</span>
                  <span className="text-[13px] text-ink-soft">gestes pris en charge</span>
                </div>

                <ul className="mt-6 flex-1 space-y-2.5">
                  {RESUME[f.key].map((l) => (
                    <li key={l} className="flex gap-2.5 text-[13.5px] leading-snug">
                      <span className={vedette ? "text-accent" : "text-good"}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
                          <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                      {l}
                    </li>
                  ))}
                </ul>

                <Link
                  href="/demande"
                  className={`mt-8 inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-[13.5px] font-medium transition ${
                    vedette
                      ? "bg-accent text-white shadow-lg shadow-accent/25 hover:bg-accent-dark"
                      : "border border-line-strong bg-card hover:border-ink"
                  }`}
                >
                  Estimer avec cette formule
                </Link>
              </Reveal>
            );
          })}
        </div>

        <Reveal delay={260} className="mt-8 text-[12.5px] text-ink-soft">
          Prix établis au volume et à la distance, sur notre grille. Suppléments détaillés ligne
          par ligne sur le devis : portage, monte-meubles, charges lourdes, garanties. TVA {TVA_DEFAUT} %.
        </Reveal>
      </div>
    </section>
  );
}

const RESUME: Record<string, string[]> = {
  eco: [
    "Vous emballez, nous chargeons et remontons",
    "Démontage et remontage des meubles courants",
    "Véhicule et personnel spécialisé",
  ],
  standard: [
    "Nous emballons le fragile et l'électroménager",
    "Cartons et protections fournis",
    "Démontage, remontage et mise en place",
  ],
  luxe: [
    "Nous emballons et déballons tout",
    "Meubles fixés démontés et reposés",
    "Rangement et évacuation des emballages",
  ],
};

/* ─────────────────────────── Espace équipe ─────────────────────────── */

const OUTILS = [
  { titre: "Demandes", texte: "Tout ce qui entre, trié, qualifié et suivi jusqu'au devis.", icon: <IconInbox /> },
  { titre: "Devis", texte: "Chiffrage sur la grille, édition et envoi au client.", icon: <IconDoc /> },
  { titre: "Simulateur", texte: "Le moteur de calcul à nu : volume, distance, suppléments.", icon: <IconSlider /> },
  { titre: "Agenda", texte: "Plannings, équipes et camions par intervention.", icon: <IconCalendar /> },
  { titre: "Clients", texte: "L'historique d'un client et de ses dossiers, d'un coup d'œil.", icon: <IconUsers /> },
  { titre: "Statistiques", texte: "Flux des demandes, volumes, estimations cumulées.", icon: <IconChart /> },
];

function Equipe() {
  return (
    <section id="equipe" className="grain relative scroll-mt-20 overflow-hidden bg-ink py-24 lg:py-32">
      <div className="drift absolute -right-32 top-0 h-[460px] w-[460px] rounded-full bg-accent/20 blur-3xl" />
      <div
        className="drift absolute -left-40 bottom-0 h-[420px] w-[420px] rounded-full bg-[#7a5af8]/18 blur-3xl"
        style={{ animationDuration: "22s", animationDelay: "-6s" }}
      />

      <div className="relative z-10 mx-auto grid w-full max-w-[1200px] gap-14 px-6 lg:grid-cols-[minmax(0,420px)_1fr] lg:gap-16 lg:px-10">
        <Reveal>
          <p className="eyebrow text-[#a5b4fc]">Réservé à l&apos;équipe</p>
          <h2 className="font-serif mt-4 text-[34px] leading-[1.08] text-white sm:text-[42px]">
            Le <span className="gradient-flow-light">poste de pilotage</span>
          </h2>
          <p className="mt-5 text-[15.5px] leading-relaxed text-white/70">
            Une demande, une estimation, un devis. Plus de ressaisie entre la boîte mail et le
            planning : la demande arrive chiffrée, il ne reste qu&apos;à décider.
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-[13.5px] font-medium text-ink transition hover:bg-white/90"
            >
              Ouvrir l&apos;espace équipe
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M5 12h13M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 px-5 py-3 text-[13.5px] font-medium text-white transition hover:border-white/60 hover:bg-white/10"
            >
              Se connecter
            </Link>
          </div>

          <p className="mt-6 flex items-center gap-2 text-[11.5px] text-white/50">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="4" y="10" width="16" height="11" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" strokeLinecap="round" />
            </svg>
            Connexion chiffrée · accès réservé · hébergement en Europe
          </p>
        </Reveal>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {OUTILS.map((o, i) => (
            <Reveal
              key={o.titre}
              delay={i * 70}
              className="rounded-2xl border border-white/12 bg-white/7 p-5 backdrop-blur-md transition-colors hover:border-white/25 hover:bg-white/12"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white/90">
                {o.icon}
              </span>
              <p className="mt-4 text-[14px] font-medium text-white">{o.titre}</p>
              <p className="mt-1.5 text-[12px] leading-snug text-white/60">{o.texte}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── Dernier appel ─────────────────────────── */

function Fin() {
  return (
    <section className="bg-paper py-24 lg:py-28">
      <Reveal className="mx-auto w-full max-w-[1200px] px-6 lg:px-10">
        <div className="relative overflow-hidden rounded-[32px] border border-line bg-card px-8 py-14 text-center sm:px-14">
          <div className="pointer-events-none absolute -left-24 -top-24 h-[280px] w-[280px] rounded-full bg-accent/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 -right-20 h-[300px] w-[300px] rounded-full bg-[#ec4899]/10 blur-3xl" />
          <div className="relative">
            <h2 className="font-serif mx-auto max-w-[18ch] text-balance text-[32px] leading-[1.1] sm:text-[40px]">
              Combien coûte votre déménagement&nbsp;?
            </h2>
            <p className="mx-auto mt-5 max-w-[52ch] text-[15px] leading-relaxed text-ink-soft">
              La réponse tient en trois minutes. Vous gardez le devis, vous nous rappelez quand
              vous voulez.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Link
                href="/demande"
                className="inline-flex items-center gap-2 rounded-full bg-accent px-7 py-3.5 text-[14px] font-medium text-white shadow-lg shadow-accent/25 transition hover:bg-accent-dark"
              >
                Faire mon estimation
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M5 12h13M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-card px-7 py-3.5 text-[14px] font-medium transition hover:border-ink"
              >
                Espace équipe
              </Link>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/* ─────────────────────────── Pied de page ─────────────────────────── */

function Pied() {
  return (
    <footer className="border-t border-line bg-card">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-6 py-9 text-[12.5px] text-ink-soft sm:flex-row sm:items-center sm:justify-between lg:px-10">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-accent text-white">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
              <path d="M2 8h11v9H2zM13 11h4.5l3.5 3.5V17h-8z" strokeLinejoin="round" />
              <circle cx="6.5" cy="18.5" r="1.8" />
              <circle cx="17.5" cy="18.5" r="1.8" />
            </svg>
          </span>
          <span className="text-ink">Bailly Déménagement</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link href="/demande" className="transition hover:text-ink">
            Demander un devis
          </Link>
          <Link href="/dashboard" className="transition hover:text-ink">
            Espace équipe
          </Link>
          <Link href="/login" className="transition hover:text-ink">
            Connexion
          </Link>
        </div>
        <span>© {new Date().getFullYear()} Bailly Déménagement</span>
      </div>
    </footer>
  );
}

/* ─────────────────────────── Icônes ─────────────────────────── */

const S = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function IconDoc() {
  return (
    <svg {...S}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M8 13h8M8 17h5" />
    </svg>
  );
}
function IconGrid() {
  return (
    <svg {...S}>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.6" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" />
    </svg>
  );
}
function IconForm() {
  return (
    <svg {...S} width={19} height={19}>
      <rect x="4" y="3" width="16" height="18" rx="2.2" />
      <path d="M8 8h8M8 12h8M8 16h4" />
    </svg>
  );
}
function IconCamera() {
  return (
    <svg {...S} width={19} height={19}>
      <path d="M3 8.5A2 2 0 0 1 5 6.5h2l1.4-2h7.2L17 6.5h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <circle cx="12" cy="13" r="3.4" />
    </svg>
  );
}
function IconEuro() {
  return (
    <svg {...S} width={19} height={19}>
      <path d="M17 6.5A6.2 6.2 0 0 0 7.2 9M17 17.5A6.2 6.2 0 0 1 7.2 15M4 10.5h8M4 13.5h8" />
    </svg>
  );
}
function IconSend() {
  return (
    <svg {...S} width={19} height={19}>
      <path d="M21 3 10.5 13.5M21 3l-6.8 18-3.7-7.5L3 9.8z" />
    </svg>
  );
}
function IconInbox() {
  return (
    <svg {...S} width={16} height={16}>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  );
}
function IconSlider() {
  return (
    <svg {...S} width={16} height={16}>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2.2" />
      <circle cx="10" cy="17" r="2.2" />
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg {...S} width={16} height={16}>
      <rect x="3" y="4.5" width="18" height="17" rx="2" />
      <path d="M16 2.5v4M8 2.5v4M3 10h18" />
    </svg>
  );
}
function IconUsers() {
  return (
    <svg {...S} width={16} height={16}>
      <path d="M16 20v-1.6a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20" />
      <circle cx="9" cy="7.5" r="3.4" />
      <path d="M22 20v-1.6a4 4 0 0 0-3-3.87M16.5 4.2a4 4 0 0 1 0 6.6" />
    </svg>
  );
}
function IconChart() {
  return (
    <svg {...S} width={16} height={16}>
      <path d="M3 20h18M7 20v-6M12 20V7M17 20v-9" />
    </svg>
  );
}
