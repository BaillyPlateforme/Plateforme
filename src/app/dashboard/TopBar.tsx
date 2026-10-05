"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { metaDe } from "./nav-meta";
import Nav, { REGLAGES } from "./Nav";
import { signOut } from "@/lib/actions/auth";
import { rafraichirTout } from "@/lib/donnees";

/**
 * La barre du haut de la maquette : le titre et la date à gauche, la
 * recherche et son bouton rond au centre, puis le sélecteur de thème, la
 * cloche et le jeton du compte à droite.
 */
export default function TopBar({
  nouvelles,
  email,
  jour,
}: {
  nouvelles: number;
  email: string;
  jour: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const meta = metaDe(pathname);
  const [q, setQ] = useState("");
  const [rail, setRail] = useState(false);

  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-4 md:gap-5 md:px-7">
      <button
        onClick={() => setRail(true)}
        aria-label="Ouvrir le menu"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-card text-ink transition hover:bg-subtle md:hidden"
      >
        <IconMenu />
      </button>

      <div className="min-w-0">
        <h1 className="truncate text-[21px] font-bold leading-tight tracking-tight md:text-[23px]">
          {meta.titre}
        </h1>
        <p className="mt-0.5 truncate text-[13px] text-ink-soft">{jour}</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          router.push(q.trim() ? `/dashboard?q=${encodeURIComponent(q.trim())}` : "/dashboard");
        }}
        className="hidden w-full max-w-[380px] items-center gap-3 rounded-full bg-card py-2 pl-2 pr-5 lg:flex"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-subtle text-ink">
          <IconLoupe />
        </span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher…"
          className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-ink-soft"
        />
      </form>

      <Refresh />

      <div className="ml-auto flex shrink-0 items-center gap-3">
        {/* Le pendant de la clé du site public : un accès au formulaire de devis,
            sans libellé, pour qui veut voir ce que voit le client. */}
        <Link
          href="/"
          target="_blank"
          rel="noreferrer"
          title="Voir le formulaire de devis"
          aria-label="Voir le formulaire de devis"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-soft opacity-60 transition hover:bg-card hover:text-ink hover:opacity-100"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 3h7v7M21 3l-9 9M10 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-4" />
          </svg>
        </Link>
        <ThemeToggle />

        <Link
          href="/dashboard?statut=new"
          title={`${nouvelles} demande(s) non traitée(s)`}
          className="relative flex h-11 w-11 items-center justify-center rounded-full bg-card text-ink transition hover:bg-subtle"
        >
          <IconCloche />
          {nouvelles > 0 && (
            <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-peach ring-2 ring-[var(--color-card)]" />
          )}
        </Link>

        <Compte email={email} />
      </div>

      {/* Le menu, en tiroir, sur petit écran. */}
      {rail && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            className="absolute inset-0 cursor-default bg-ink/35"
            onClick={() => setRail(false)}
            aria-label="Fermer le menu"
          />
          <div className="absolute inset-y-0 left-0 p-3">
            <Nav email={email} nouvelles={nouvelles} onNaviguer={() => setRail(false)} />
          </div>
        </div>
      )}
    </header>
  );
}

/** Le jeton du compte : avatar, identité, et les réglages derrière. */
function Compte({ email }: { email: string }) {
  const [ouvert, setOuvert] = useState(false);
  const nom = email.split("@")[0] || "Compte";

  return (
    <div className="relative">
      <button
        onClick={() => setOuvert(!ouvert)}
        className="flex items-center gap-2.5 rounded-full bg-card py-1.5 pl-1.5 pr-3 transition hover:bg-subtle"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-[13px] font-bold text-white">
          {nom.charAt(0).toUpperCase()}
        </span>
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block max-w-[130px] truncate text-[13.5px] font-semibold leading-tight">
            {nom}
          </span>
          <span className="block max-w-[130px] truncate text-[11px] leading-tight text-ink-soft">
            Espace équipe
          </span>
        </span>
        <span className={`text-ink-soft transition-transform ${ouvert ? "rotate-90" : ""}`}>
          <IconChevron />
        </span>
      </button>

      {ouvert && (
        <>
          <button
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOuvert(false)}
            aria-label="Fermer le menu"
          />
          <div className="absolute right-0 top-[calc(100%+0.6rem)] z-20 w-60 rounded-[18px] bg-card p-2 shadow-[var(--shadow-md)]">
            <div className="px-2.5 pb-2 pt-1.5">
              <p className="truncate text-[13px] font-semibold">{nom}</p>
              <p className="truncate text-[11.5px] text-ink-soft">{email}</p>
            </div>
            <div className="mb-1 h-px bg-line" />
            {REGLAGES.map((r) => (
              <Link
                key={r.href}
                href={r.href}
                onClick={() => setOuvert(false)}
                className="flex items-center gap-3 rounded-xl px-2.5 py-2 text-[13.5px] text-ink-mid transition hover:bg-subtle hover:text-ink"
              >
                <span className="text-ink-soft">{r.icone}</span>
                {r.label}
              </Link>
            ))}
            <div className="my-1 h-px bg-line" />
            <form action={signOut}>
              <button
                type="submit"
                className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-[13.5px] text-danger transition hover:bg-danger-soft"
              >
                <IconSortie />
                Se déconnecter
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Jour / nuit. Le thème est écrit sur <html> et retenu dans le navigateur ;
 * la lecture est différée, sinon le serveur et le client ne rendraient pas la
 * même chose au premier affichage.
 */
function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const t = setTimeout(() => {
      // On relit le choix retenu : venu du site public, toujours clair, <html>
      // ne le porte plus.
      let retenu: string | null = null;
      try {
        retenu = localStorage.getItem("bailly-theme");
      } catch {
        /* navigation privée */
      }
      const v = retenu === "dark" || document.documentElement.dataset.theme === "dark" ? "dark" : "light";
      document.documentElement.dataset.theme = retenu === "light" ? "light" : v;
      setTheme(retenu === "light" ? "light" : v);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const poser = (v: "light" | "dark") => {
    setTheme(v);
    document.documentElement.dataset.theme = v;
    try {
      localStorage.setItem("bailly-theme", v);
    } catch {
      /* navigation privée : le thème ne sera pas retenu, rien de plus */
    }
  };

  return (
    <div className="flex items-center gap-1 rounded-full bg-card p-1.5">
      <button
        onClick={() => poser("light")}
        aria-pressed={theme === "light"}
        title="Thème clair"
        className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
          theme === "light" ? "bg-subtle text-ink" : "text-ink-soft hover:text-ink"
        }`}
      >
        <IconSoleil />
      </button>
      <button
        onClick={() => poser("dark")}
        aria-pressed={theme === "dark"}
        title="Thème sombre"
        className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
          theme === "dark" ? "bg-subtle text-ink" : "text-ink-soft hover:text-ink"
        }`}
      >
        <IconLune />
      </button>
    </div>
  );
}

function Refresh() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [spin, setSpin] = useState(false);
  return (
    <button
      onClick={() => {
        setSpin(true);
        rafraichirTout(); // les écrans lisent leurs données eux-mêmes
        start(() => {
          router.refresh();
          setTimeout(() => setSpin(false), 600);
        });
      }}
      disabled={pending}
      title="Actualiser les données"
      className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full bg-card text-ink transition hover:bg-subtle disabled:opacity-60 lg:flex"
    >
      <span className={spin ? "animate-spin" : ""}>
        <IconRefresh />
      </span>
    </button>
  );
}

const S = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function IconLoupe() { return <svg {...S} width={15} height={15}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>; }
function IconCloche() { return <svg {...S} width={19} height={19}><path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>; }
function IconRefresh() {
  return (
    <svg {...S}>
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}
function IconSoleil() {
  return (
    <svg {...S} width={17} height={17}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
function IconLune() {
  return (
    <svg {...S} width={17} height={17}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}
function IconMenu() { return <svg {...S}><path d="M4 6h16M4 12h16M4 18h16" /></svg>; }
function IconChevron() { return <svg {...S} width={15} height={15}><path d="m9 6 6 6-6 6" /></svg>; }
function IconSortie() { return <svg {...S} width={16} height={16}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></svg>; }
