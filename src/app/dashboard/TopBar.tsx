"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { metaDe } from "./nav-meta";
import { signOut } from "@/lib/actions/auth";

/** Barre du haut : titre de l'écran, recherche, gestes globaux et compte. */
export default function TopBar({ email, nouvelles }: { email: string; nouvelles: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const meta = metaDe(pathname);
  const [menu, setMenu] = useState(false);
  const [q, setQ] = useState("");

  return (
    <header className="sticky top-0 z-40 flex items-center gap-4 border-b border-line bg-card px-5 py-3 md:px-7">
      <div className="min-w-0 shrink-0">
        <h1 className="font-serif text-[25px] leading-none">{meta.titre}</h1>
        {meta.sous && <p className="mt-1 truncate text-[12px] text-ink-soft">{meta.sous}</p>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          router.push(q.trim() ? `/dashboard?q=${encodeURIComponent(q.trim())}` : "/dashboard");
        }}
        className="mx-auto hidden w-full max-w-lg items-center gap-2.5 rounded-full bg-subtle px-4 py-2.5 lg:flex"
      >
        <IconSearch />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un client, une ville…"
          className="w-full bg-transparent text-[13.5px] outline-none placeholder:text-ink-soft"
        />
      </form>

      <div className="ml-auto flex shrink-0 items-center gap-1.5 lg:ml-0">
        <Refresh />

        <Link
          href="/demande"
          className="hidden rounded-xl border border-line-strong px-3 py-2 text-[13px] text-ink-soft transition hover:border-ink hover:text-ink xl:block"
        >
          Formulaire client
        </Link>

        <Link
          href="/dashboard?statut=new"
          title={`${nouvelles} demande(s) non traitée(s)`}
          className="relative flex h-9 w-9 items-center justify-center rounded-xl text-ink-soft transition hover:bg-subtle hover:text-ink"
        >
          <IconBell />
          {nouvelles > 0 && (
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[#ef4444] ring-2 ring-card" />
          )}
        </Link>

        <div className="relative ml-1">
          <button
            onClick={() => setMenu((v) => !v)}
            className="flex items-center gap-2.5 rounded-xl py-1 pl-1 pr-2 transition hover:bg-subtle"
          >
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-semibold text-white"
              style={{ background: "linear-gradient(145deg, #f4501e 0%, #ff8a3d 100%)" }}
            >
              {email.charAt(0).toUpperCase()}
            </span>
            <span className="hidden text-left md:block">
              <span className="block max-w-[140px] truncate text-[13px] font-semibold leading-tight">
                {email.split("@")[0]}
              </span>
              <span className="block text-[11px] leading-tight text-ink-soft">Équipe Bailly</span>
            </span>
            <IconChevron />
          </button>

          {menu && (
            <>
              <button
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setMenu(false)}
                aria-label="Fermer le menu"
              />
              <div className="absolute right-0 top-12 z-20 w-64 rounded-2xl border border-line bg-card p-1.5 shadow-[0_12px_32px_-8px_rgba(28,28,34,0.18)]">
                <div className="px-3 py-2">
                  <div className="truncate text-[13px] font-medium" title={email}>
                    {email}
                  </div>
                  <div className="text-[11.5px] text-ink-soft">Connecté</div>
                </div>
                <Link
                  href="/dashboard/parametres"
                  onClick={() => setMenu(false)}
                  className="block rounded-xl px-3 py-2 text-[13px] text-ink-soft transition hover:bg-subtle hover:text-ink"
                >
                  Paramètres
                </Link>
                <form action={signOut}>
                  <button
                    type="submit"
                    className="w-full rounded-xl px-3 py-2 text-left text-[13px] text-[#e0654a] transition hover:bg-[#e0654a]/8"
                  >
                    Se déconnecter
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
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
        start(() => {
          router.refresh();
          setTimeout(() => setSpin(false), 600);
        });
      }}
      disabled={pending}
      title="Actualiser les données"
      className="flex h-9 w-9 items-center justify-center rounded-xl text-ink-soft transition hover:bg-subtle hover:text-ink disabled:opacity-60"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 ${spin ? "animate-spin" : ""}`}>
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
        <path d="M21 3v5h-5" />
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        <path d="M3 21v-5h5" />
      </svg>
    </button>
  );
}

const S = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
function IconSearch() { return <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-ink-soft" {...S}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>; }
function IconBell() { return <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" {...S}><path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>; }
function IconChevron() { return <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-ink-soft" {...S}><path d="m6 9 6 6 6-6" /></svg>; }
