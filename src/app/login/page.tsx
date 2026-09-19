import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import DevisCarousel from "./DevisCarousel";
import LoginForm from "./LoginForm";
import Parallax from "./Parallax";

export const metadata = { title: "Connexion — Bailly" };

// Décalage d'apparition : les blocs entrent les uns après les autres.
const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect } = await searchParams;
  // On n'accepte qu'une redirection interne, pour éviter les renvois vers un autre domaine.
  const target = redirect?.startsWith("/") && !redirect.startsWith("//") ? redirect : "/dashboard";

  return (
    <div className="relative z-10 flex min-h-screen flex-col lg:flex-row">
      {/* Gauche — formulaire */}
      <section className="relative flex flex-1 flex-col px-6 py-8 lg:max-w-[540px] lg:px-14 lg:py-10">
        {/* Mobile : le panneau de droite disparaît, la photo devient une bande en tête. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[210px] overflow-hidden lg:hidden">
          <Image
            src="/login-interieur.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="ken-burns object-cover object-center"
          />
          <div className="absolute inset-0 bg-ink/30" />
          <div className="absolute inset-0 bg-linear-to-b from-transparent via-paper/45 to-paper" />
        </div>

        <header className="reveal relative z-10 flex items-center justify-between" style={delay(0)}>
          <div>
            <div className="font-serif text-[26px] font-semibold leading-none text-white lg:text-ink">
              Bailly
            </div>
            <div className="eyebrow mt-1.5 text-white/75 lg:text-ink-soft">Déménagement</div>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1 text-xs text-ink-soft">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-good" />
            Espace équipe
          </span>
        </header>

        <div className="relative z-10 flex max-w-[420px] flex-1 flex-col justify-center py-14">
          <p className="eyebrow reveal mb-4 text-ink-soft" style={delay(120)}>
            Plateforme interne
          </p>
          <h1
            className="font-serif reveal mb-3 text-balance text-[30px] leading-[1.08] sm:text-[34px]"
            style={delay(200)}
          >
            Connectez-vous à votre <span className="gradient-flow">poste de pilotage</span>
          </h1>
          <p className="reveal mb-8 text-[14px] leading-relaxed text-ink-soft" style={delay(300)}>
            Demandes, estimations, devis et plannings au même endroit — du formulaire client
            au camion chargé.
          </p>

          <div className="reveal" style={delay(400)}>
            <LoginForm redirect={target} />
          </div>

          <div
            className="reveal flex items-center gap-2 pt-5 text-[11.5px] text-ink-soft"
            style={delay(520)}
          >
            <IconLock />
            <span>Connexion chiffrée · Accès réservé à l&apos;équipe · Hébergement Europe</span>
          </div>
        </div>

        <footer
          className="reveal relative z-10 flex items-center justify-between text-[11.5px] text-ink-soft"
          style={delay(620)}
        >
          <span>© {new Date().getFullYear()} Bailly Déménagement</span>
          <div className="flex items-center gap-4">
            <Link href="/demande" className="transition hover:text-ink">
              Formulaire client
            </Link>
            <Link href="/" className="transition hover:text-ink">
              Accueil
            </Link>
          </div>
        </footer>
      </section>

      {/* Droite — photo et cartes en verre */}
      <aside className="grain relative hidden flex-1 overflow-hidden border-l border-line lg:flex">
        <Image
          src="/login-interieur.jpg"
          alt=""
          fill
          priority
          sizes="50vw"
          className="ken-burns object-cover"
        />

        {/* Voiles : lisibilité du texte et teinte accent. */}
        <div className="absolute inset-0 bg-ink/50" />
        <div className="absolute inset-0 bg-linear-to-t from-ink/90 via-ink/25 to-ink/5" />
        <div className="absolute inset-0 bg-linear-to-bl from-accent/35 via-transparent to-transparent" />
        {/* Halo qui dérive lentement derrière les cartes. */}
        <div className="drift absolute -left-24 top-1/4 h-[460px] w-[460px] rounded-full bg-accent/25 blur-3xl" />
        <div
          className="drift absolute -right-20 bottom-0 h-[380px] w-[380px] rounded-full bg-[#ec4899]/20 blur-3xl"
          style={{ animationDuration: "24s", animationDelay: "-8s" }}
        />

        <Parallax className="relative z-10 mx-auto flex w-full max-w-[560px] flex-col justify-center p-12">
          <div className="space-y-5">
            <DevisCarousel />

            <div className="grid grid-cols-2 gap-3">
              <Feature color="#93c5fd" icon={<IconInbox />} title="Demandes" d={400} dur="9s">
                Réception, tri et suivi des dossiers entrants.
              </Feature>
              <Feature color="#c4b5fd" icon={<IconSparkle />} title="Photos" d={480} dur="7.5s">
                Volume estimé à partir des photos du logement.
              </Feature>
              <Feature color="#f9a8d4" icon={<IconDoc />} title="Devis" d={560} dur="10s">
                Chiffrage, grilles tarifaires et envoi au client.
              </Feature>
              <Feature color="#6ee7b7" icon={<IconCalendar />} title="Agenda" d={640} dur="8.5s">
                Plannings, équipes et camions par intervention.
              </Feature>
            </div>

            <p
              className="reveal max-w-md text-[15px] leading-[1.45] text-white/85"
              style={delay(760)}
            >
              «&nbsp;Une demande, une estimation, un devis. Plus de ressaisie entre la boîte
              mail et le planning.&nbsp;»
            </p>
          </div>
        </Parallax>
      </aside>
    </div>
  );
}

function Feature({
  color,
  icon,
  title,
  children,
  d,
  dur,
}: {
  color: string;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  d: number;
  dur: string;
}) {
  return (
    <div
      className="shine levitate relative overflow-hidden rounded-3xl border border-white/20 bg-linear-to-br from-white/20 via-white/9 to-white/5 p-4 shadow-xl shadow-ink/30 backdrop-blur-xl transition-colors hover:from-white/28 hover:via-white/14"
      style={{ ...delay(d), "--dur": dur, "--shine": "11s", "--shine-delay": `${d}ms` } as CSSProperties}
    >
      <span
        className="mb-3 inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/15"
        style={{ color, background: `color-mix(in srgb, ${color} 22%, transparent)` }}
      >
        {icon}
      </span>
      <p className="text-[14px] font-medium leading-none text-white">{title}</p>
      <p className="mt-1.5 text-[11.5px] leading-snug text-white/75">{children}</p>
    </div>
  );
}

const S = {
  width: 15,
  height: 15,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
} as const;

function IconLock() {
  return (
    <svg {...S} width={12} height={12}>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" strokeLinecap="round" />
    </svg>
  );
}
function IconInbox() {
  return (
    <svg {...S}>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconDoc() {
  return (
    <svg {...S}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinejoin="round" />
      <path d="M14 2v6h6M8 13h8M8 17h5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg {...S}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" />
    </svg>
  );
}
function IconSparkle() {
  return (
    <svg {...S}>
      <path
        d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
