import Image from "next/image";
import Link from "next/link";
import LoginForm from "./LoginForm";

export const metadata = { title: "Connexion — Bailly" };

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
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[210px] lg:hidden">
          <Image
            src="/login-interieur.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-center"
          />
          <div className="absolute inset-0 bg-ink/30" />
          <div className="absolute inset-0 bg-linear-to-b from-transparent via-paper/45 to-paper" />
        </div>

        <header className="relative z-10 flex items-center justify-between">
          <div>
            <div className="font-serif text-[26px] font-semibold leading-none text-white lg:text-ink">Bailly</div>
            <div className="eyebrow mt-1.5 text-white/75 lg:text-ink-soft">Déménagement</div>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1 text-xs text-ink-soft">
            <span className="h-1.5 w-1.5 rounded-full bg-good" />
            Espace équipe
          </span>
        </header>

        <div className="relative z-10 flex max-w-[420px] flex-1 flex-col justify-center py-14 animate-fade-up">
          <p className="eyebrow mb-4 text-ink-soft">Plateforme interne</p>
          <h1 className="font-serif mb-3 text-balance text-[30px] leading-[1.08] sm:text-[34px]">
            Connectez-vous à votre{" "}
            <span className="gradient-text">poste de pilotage</span>
          </h1>
          <p className="mb-8 text-[14px] leading-relaxed text-ink-soft">
            Demandes, estimations, devis et plannings au même endroit — du formulaire client
            au camion chargé.
          </p>

          <LoginForm redirect={target} />

          <div className="flex items-center gap-2 pt-5 text-[11.5px] text-ink-soft">
            <IconLock />
            <span>Connexion chiffrée · Accès réservé à l&apos;équipe · Hébergement Europe</span>
          </div>
        </div>

        <footer className="relative z-10 flex items-center justify-between text-[11.5px] text-ink-soft">
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

      {/* Droite — aperçu */}
      <aside className="relative hidden flex-1 overflow-hidden border-l border-line lg:flex">
        <Image
          src="/login-interieur.jpg"
          alt=""
          fill
          priority
          sizes="50vw"
          className="object-cover"
        />
        {/* Voiles : lisibilité du texte, teinte accent, fondu avec la colonne de gauche. */}
        <div className="absolute inset-0 bg-ink/45" />
        <div className="absolute inset-0 bg-linear-to-t from-ink/90 via-ink/25 to-ink/5" />
        <div className="absolute inset-0 bg-linear-to-bl from-accent/30 via-transparent to-transparent" />

        <div className="relative z-10 mx-auto flex w-full max-w-[560px] flex-col justify-center p-12">
          <div className="space-y-5">
            <div className="rounded-2xl border border-white/50 bg-white/85 p-6 shadow-lg shadow-ink/10 backdrop-blur-md">
              <div className="mb-3 flex items-center justify-between">
                <p className="eyebrow text-[10px] text-ink-soft">Exemple de demande</p>
                <span className="inline-flex items-center gap-1.5 rounded-md bg-accent-soft px-2 py-1 text-[11px] font-semibold text-accent-dark">
                  Estimation instantanée
                </span>
              </div>

              <div className="display-num gradient-text mb-1 text-[44px] leading-none">
                2 640 €
              </div>
              <p className="mb-5 text-[12.5px] text-ink-soft">
                fourchette 2 400 – 2 900 € · formule standard
              </p>

              <div className="flex items-center gap-3 border-t border-line pt-4 text-[13px]">
                <span className="font-medium">Paris 15e</span>
                <span className="h-px flex-1 bg-line-strong" />
                <IconTruck />
                <span className="h-px flex-1 bg-line-strong" />
                <span className="font-medium">Nantes</span>
              </div>
              <div className="mt-2 flex items-center gap-4 text-[11.5px] text-ink-soft">
                <span>385 km</span>
                <span>32 m³</span>
                <span>3e étage sans ascenseur</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Feature color="#3b82f6" icon={<IconInbox />} title="Demandes">
                Réception, tri et suivi des dossiers entrants.
              </Feature>
              <Feature color="#8b5cf6" icon={<IconSparkle />} title="Photos">
                Volume estimé à partir des photos du logement.
              </Feature>
              <Feature color="#ec4899" icon={<IconDoc />} title="Devis">
                Chiffrage, grilles tarifaires et envoi au client.
              </Feature>
              <Feature color="#10b981" icon={<IconCalendar />} title="Agenda">
                Plannings, équipes et camions par intervention.
              </Feature>
            </div>

            <p className="max-w-md text-[15px] leading-[1.45] text-white/90 drop-shadow-sm">
              «&nbsp;Une demande, une estimation, un devis. Plus de ressaisie entre la boîte
              mail et le planning.&nbsp;»
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Feature({
  color,
  icon,
  title,
  children,
}: {
  color: string;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/50 bg-white/80 p-4 shadow-md shadow-ink/5 backdrop-blur-md">
      <span
        className="mb-3 inline-flex h-7 w-7 items-center justify-center rounded-lg"
        style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
      >
        {icon}
      </span>
      <p className="text-[14px] font-medium leading-none">{title}</p>
      <p className="mt-1.5 text-[11.5px] leading-snug text-ink-soft">{children}</p>
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
function IconTruck() {
  return (
    <svg {...S} width={17} height={17} className="text-ink-soft">
      <path d="M2 16V6a1 1 0 0 1 1-1h11v11" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 9h4l3 3.5V16h-2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7" cy="17.5" r="1.8" />
      <circle cx="17" cy="17.5" r="1.8" />
      <path d="M8.8 16h6.4" strokeLinecap="round" />
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
