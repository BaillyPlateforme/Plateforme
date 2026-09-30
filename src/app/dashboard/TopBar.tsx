"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { metaDe } from "./nav-meta";
import { situer } from "./Nav";
import { rafraichirTout } from "@/lib/donnees";

/**
 * Barre du haut : le titre de l'écran, son fil d'Ariane, et trois gestes en
 * boutons cerclés — recherche, actualisation, notifications. Le compte, lui,
 * est au pied du menu.
 */
export default function TopBar({ nouvelles }: { nouvelles: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const meta = metaDe(pathname);
  const place = situer(pathname);
  const [recherche, setRecherche] = useState(false);
  const [q, setQ] = useState("");

  return (
    <header className="sticky top-0 z-40 flex items-center gap-4 border-b border-line bg-card px-5 py-3.5 md:px-7">
      <div className="min-w-0">
        <h1 className="truncate text-[19px] font-semibold leading-tight tracking-tight">{meta.titre}</h1>
        <nav className="mt-1 flex items-center gap-1.5 text-[12px] text-ink-soft">
          <span>{place?.section ?? "Espace équipe"}</span>
          <span className="text-line-strong">/</span>
          <span className="text-ink">{place?.page ?? meta.titre}</span>
        </nav>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {recherche ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              router.push(q.trim() ? `/dashboard?q=${encodeURIComponent(q.trim())}` : "/dashboard");
              setRecherche(false);
            }}
            className="flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-2"
          >
            <IconLoupe />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onBlur={() => !q && setRecherche(false)}
              placeholder="Rechercher un client, une ville…"
              className="w-56 bg-transparent text-[13px] outline-none placeholder:text-ink-soft"
            />
          </form>
        ) : (
          <Bouton titre="Rechercher" onClick={() => setRecherche(true)}>
            <IconLoupe />
          </Bouton>
        )}

        <Refresh />

        <Link
          href="/dashboard?statut=new"
          title={`${nouvelles} demande(s) non traitée(s)`}
          className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-line text-ink-soft transition hover:border-line-strong hover:text-ink"
        >
          <IconCloche />
          {nouvelles > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
              {nouvelles > 9 ? "9+" : nouvelles}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}

function Bouton({
  titre,
  onClick,
  children,
}: {
  titre: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={titre}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-ink-soft transition hover:border-line-strong hover:text-ink"
    >
      {children}
    </button>
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
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-ink-soft transition hover:border-line-strong hover:text-ink disabled:opacity-60"
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
function IconCloche() { return <svg {...S}><path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>; }
