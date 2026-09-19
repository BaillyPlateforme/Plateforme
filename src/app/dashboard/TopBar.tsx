"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { GROUPES, groupeDe } from "./nav-items";
import { signOut } from "@/lib/actions/auth";

/**
 * Barre du haut : la marque, les trois univers de l'espace équipe, et les
 * gestes globaux. Les trois onglets portent leur sous-titre — c'est ce qui
 * dit, sans ouvrir, ce qu'on va trouver derrière.
 */
export default function TopBar({ email }: { email: string }) {
  const pathname = usePathname();
  const actif = groupeDe(pathname).key;
  const [menu, setMenu] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-card">
      <div className="flex items-stretch gap-4 px-5 lg:px-7">
        <Link href="/dashboard" className="flex shrink-0 flex-col justify-center py-3">
          <span className="font-serif text-[19px] font-semibold leading-none sm:text-[21px]">Bailly</span>
          <span className="eyebrow mt-1 hidden text-[9.5px] text-ink-soft sm:block">Déménagement</span>
        </Link>

        <nav className="flex min-w-0 flex-1 items-stretch gap-0.5 overflow-x-auto sm:gap-1">
          {GROUPES.map((g) => {
            const on = g.key === actif;
            return (
              <Link
                key={g.key}
                href={g.items[0].href}
                aria-current={on ? "page" : undefined}
                className={`group relative flex items-center gap-2.5 whitespace-nowrap px-2 py-3 transition sm:px-4 ${
                  on ? "text-ink" : "text-ink-soft hover:text-ink"
                }`}
              >
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-xl transition ${
                    on ? "bg-accent text-white" : "bg-subtle text-ink-soft group-hover:text-ink"
                  }`}
                >
                  {g.icon}
                </span>
                <span className="hidden sm:block">
                  <span className="block text-[14.5px] font-semibold leading-tight">{g.label}</span>
                  <span className="block text-[11.5px] leading-tight text-ink-soft">{g.hint}</span>
                </span>
                <span
                  className={`absolute inset-x-3 -bottom-px h-0.5 rounded-full transition ${
                    on ? "bg-accent" : "bg-transparent"
                  }`}
                />
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2 py-3">
          <Refresh />
          <Link
            href="/demande"
            className="hidden rounded-xl border border-line-strong px-3 py-2 text-[13px] text-ink-soft transition hover:border-ink hover:text-ink lg:block"
          >
            Formulaire client
          </Link>

          <div className="relative">
            <button
              onClick={() => setMenu((v) => !v)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-[13px] font-semibold text-white transition hover:bg-accent-dark"
              title={email}
            >
              {email.charAt(0).toUpperCase()}
            </button>
            {menu && (
              <>
                <button
                  className="fixed inset-0 z-10 cursor-default"
                  onClick={() => setMenu(false)}
                  aria-label="Fermer le menu"
                />
                <div className="absolute right-0 top-11 z-20 w-60 rounded-2xl border border-line bg-card p-1.5 shadow-md">
                  <div className="px-3 py-2">
                    <div className="truncate text-[13px] font-medium" title={email}>
                      {email}
                    </div>
                    <div className="text-[11.5px] text-ink-soft">Équipe Bailly</div>
                  </div>
                  <form action={signOut}>
                    <button
                      type="submit"
                      className="w-full rounded-xl px-3 py-2 text-left text-[13px] text-ink-soft transition hover:bg-subtle hover:text-ink"
                    >
                      Se déconnecter
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function Refresh() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [spinning, setSpinning] = useState(false);

  return (
    <button
      onClick={() => {
        setSpinning(true);
        start(() => {
          router.refresh();
          setTimeout(() => setSpinning(false), 600);
        });
      }}
      disabled={pending}
      title="Actualiser les données"
      className="flex h-9 w-9 items-center justify-center rounded-xl text-ink-soft transition hover:bg-subtle hover:text-ink disabled:opacity-60"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`h-4 w-4 ${spinning ? "animate-spin" : ""}`}
      >
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
        <path d="M21 3v5h-5" />
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        <path d="M3 21v-5h5" />
      </svg>
    </button>
  );
}
