"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { metaDe } from "./nav-meta";
import Nav, { REGLAGES } from "./Nav";
import { signOut } from "@/lib/actions/auth";
import { rafraichirTout } from "@/lib/donnees";

/**
 * Barre du haut, reprise de la maquette : le titre de l'écran et la date à
 * gauche, la recherche au centre, puis les gestes et le jeton du compte à
 * droite. C'est là que vivent les réglages.
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
  const [menu, setMenu] = useState(false);
  const [rail, setRail] = useState(false);

  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-line bg-card px-4 py-3 md:gap-5 md:px-6">
      <button
        onClick={() => setRail(true)}
        aria-label="Ouvrir le menu"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line text-ink-soft transition hover:text-ink md:hidden"
      >
        <IconMenu />
      </button>

      <div className="min-w-0">
        <h1 className="truncate text-[18px] font-semibold leading-tight tracking-tight">
          {meta.titre}
        </h1>
        <p className="mt-0.5 truncate text-[12px] text-ink-soft">{jour}</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          router.push(q.trim() ? `/dashboard?q=${encodeURIComponent(q.trim())}` : "/dashboard");
        }}
        className="mx-auto hidden w-full max-w-[380px] items-center gap-2.5 rounded-full border border-line bg-card px-4 py-2.5 transition focus-within:border-line-strong lg:flex"
      >
        <span className="text-ink-soft">
          <IconLoupe />
        </span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un client, une ville…"
          className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-ink-soft"
        />
      </form>

      <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-0">
        {/* Deux gestes dans un même jeton, comme la maquette. */}
        <div className="hidden items-center gap-1 rounded-full border border-line p-1 sm:flex">
          <Refresh />
          <Link
            href="/demande"
            target="_blank"
            title="Ouvrir le formulaire client"
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-soft transition hover:bg-subtle hover:text-ink"
          >
            <IconLien />
          </Link>
        </div>

        <Link
          href="/dashboard?statut=new"
          title={`${nouvelles} demande(s) non traitée(s)`}
          className="relative flex h-10 w-10 items-center justify-center rounded-full border border-line text-ink-soft transition hover:border-line-strong hover:text-ink"
        >
          <IconCloche />
          {nouvelles > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
              {nouvelles > 9 ? "9+" : nouvelles}
            </span>
          )}
        </Link>

        <Compte email={email} ouvert={menu} setOuvert={setMenu} />
      </div>

      {/* Le rail, en tiroir, sur petit écran. */}
      {rail && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            className="absolute inset-0 cursor-default bg-ink/35"
            onClick={() => setRail(false)}
            aria-label="Fermer le menu"
          />
          <div className="absolute inset-y-0 left-0 w-[250px] overflow-hidden bg-card shadow-2xl">
            <Nav email={email} nouvelles={nouvelles} />
          </div>
        </div>
      )}
    </header>
  );
}

/** Le jeton du compte : avatar, identité, et les réglages derrière. */
function Compte({
  email,
  ouvert,
  setOuvert,
}: {
  email: string;
  ouvert: boolean;
  setOuvert: (v: boolean) => void;
}) {
  const nom = email.split("@")[0] || "Compte";

  return (
    <div className="relative">
      <button
        onClick={() => setOuvert(!ouvert)}
        className="flex items-center gap-2.5 rounded-full border border-line py-1 pl-1 pr-2.5 transition hover:border-line-strong"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-[12px] font-semibold text-white">
          {nom.charAt(0).toUpperCase()}
        </span>
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block max-w-[130px] truncate text-[12.5px] font-medium leading-tight">
            {nom}
          </span>
          <span className="block max-w-[130px] truncate text-[10.5px] leading-tight text-ink-soft">
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
          <div className="absolute right-0 top-[calc(100%+0.5rem)] z-20 w-60 rounded-2xl border border-line bg-card p-1.5 shadow-[var(--shadow-md)]">
            <div className="px-2.5 pb-2 pt-1.5">
              <p className="truncate text-[12.5px] font-medium">{nom}</p>
              <p className="truncate text-[11px] text-ink-soft">{email}</p>
            </div>
            <div className="mb-1 h-px bg-line" />
            <p className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft/60">
              Réglages
            </p>
            {REGLAGES.map((r) => (
              <Link
                key={r.href}
                href={r.href}
                onClick={() => setOuvert(false)}
                className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] text-ink/80 transition hover:bg-subtle hover:text-ink"
              >
                <span className="text-ink-soft">{r.icone}</span>
                {r.label}
              </Link>
            ))}
            <div className="my-1 h-px bg-line" />
            <form action={signOut}>
              <button
                type="submit"
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] text-danger transition hover:bg-danger-soft"
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
      className="flex h-8 w-8 items-center justify-center rounded-full text-ink-soft transition hover:bg-subtle hover:text-ink disabled:opacity-60"
    >
      <svg {...S} className={spin ? "animate-spin" : ""}>
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
        <path d="M21 3v5h-5" />
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        <path d="M3 21v-5h5" />
      </svg>
    </button>
  );
}

const S = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function IconLoupe() { return <svg {...S}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>; }
function IconCloche() { return <svg {...S} width={17} height={17}><path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>; }
function IconLien() { return <svg {...S}><path d="M14 4h6v6" /><path d="M20 4 10 14" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>; }
function IconMenu() { return <svg {...S} width={17} height={17}><path d="M4 6h16M4 12h16M4 18h16" /></svg>; }
function IconChevron() { return <svg {...S} width={14} height={14}><path d="m9 6 6 6-6 6" /></svg>; }
function IconSortie() { return <svg {...S} width={15} height={15}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></svg>; }
