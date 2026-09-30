"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/lib/actions/auth";

export type Item = { href: string; label: string; icon: React.ReactNode };
export const SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: "Pilotage",
    items: [
      { href: "/dashboard/tableau-de-bord", label: "Tableau de bord", icon: <IconGauge /> },
      { href: "/dashboard", label: "Demandes", icon: <IconInbox /> },
      { href: "/dashboard/devis", label: "Devis", icon: <IconDoc /> },
      { href: "/dashboard/clients", label: "Clients", icon: <IconUsers /> },
      { href: "/dashboard/agenda", label: "Agenda", icon: <IconCalendar /> },
      { href: "/dashboard/statistiques", label: "Statistiques", icon: <IconChart /> },
    ],
  },
  {
    title: "Outils",
    items: [
      { href: "/dashboard/messagerie", label: "Messagerie", icon: <IconMail /> },
      { href: "/dashboard/workflow", label: "Workflow", icon: <IconFlow /> },
    ],
  },
  {
    title: "Évaluation",
    items: [
      { href: "/dashboard/simulateur", label: "Simulateur", icon: <IconCalc /> },
      { href: "/dashboard/campagne", label: "Campagne", icon: <IconDes /> },
      { href: "/dashboard/playground", label: "Playground", icon: <IconSparkle /> },
    ],
  },
];

/** Où se trouve une URL dans le menu : sert au fil d'Ariane de la barre du haut. */
export function situer(pathname: string): { section: string; page: string } | null {
  for (const s of SECTIONS) {
    for (const i of s.items) {
      const dessus = i.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(i.href);
      if (dessus) return { section: s.title, page: i.label };
    }
  }
  return null;
}

export default function Nav({ email }: { email: string }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  const [menu, setMenu] = useState(false);

  return (
    <div className="flex h-full flex-col border-r border-line bg-card">
      {/* La marque : tuile pleine et nom, comme la maquette. */}
      <div className="flex items-center gap-2.5 px-4 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white">
          <IconMarque />
        </span>
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold leading-tight tracking-tight">BAILLY</div>
          <div className="truncate text-[11px] leading-tight text-ink-soft">Déménagement</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-3">
        {SECTIONS.map((section) => (
          <div key={section.title} className="mb-4">
            <div className="px-2 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-soft/70">
              {section.title}
            </div>
            <div className="space-y-0.5">
              {section.items.map((l) => {
                const active = isActive(l.href);
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition ${
                      active
                        ? "bg-accent font-medium text-white"
                        : "text-ink/80 hover:bg-subtle hover:text-ink"
                    }`}
                  >
                    <span className={active ? "text-white" : "text-ink-soft"}>{l.icon}</span>
                    {l.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Le compte, en pied de rail — c'est là que la maquette le place. */}
      <div className="relative border-t border-line p-3">
        {menu && (
          <>
            <button
              className="fixed inset-0 z-10 cursor-default"
              onClick={() => setMenu(false)}
              aria-label="Fermer le menu"
            />
            <div className="absolute bottom-[calc(100%-0.25rem)] left-3 right-3 z-20 rounded-xl border border-line bg-card p-1.5 shadow-[var(--shadow-md)]">
              {REGLAGES.map((r) => (
                <Link
                  key={r.href}
                  href={r.href}
                  onClick={() => setMenu(false)}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-ink/80 transition hover:bg-subtle hover:text-ink"
                >
                  <span className="text-ink-soft">{r.icone}</span>
                  {r.label}
                </Link>
              ))}
              <div className="my-1 h-px bg-line" />
              <form action={signOut}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-danger transition hover:bg-danger-soft"
                >
                  <IconSortie />
                  Se déconnecter
                </button>
              </form>
            </div>
          </>
        )}

        <button
          onClick={() => setMenu((v) => !v)}
          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition hover:bg-subtle"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent">
            {email.charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-medium leading-tight">
              {email.split("@")[0]}
            </span>
            <span className="block truncate text-[11px] leading-tight text-ink-soft">{email}</span>
          </span>
          <IconChevron />
        </button>
      </div>
    </div>
  );
}

/** Les réglages, au pied du menu : on ne les ouvre qu'à l'occasion. */
const REGLAGES = [
  { href: "/dashboard/equipe", label: "Équipe", icone: <IconTeam /> },
  { href: "/dashboard/configuration", label: "Configuration", icone: <IconGrid /> },
  { href: "/dashboard/parametres", label: "Paramètres", icone: <IconGear /> },
];

function IconChevron() {
  return (
    <svg {...S} width={14} height={14} className="shrink-0 text-ink-soft">
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconTeam() { return <svg {...S}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" strokeLinecap="round" /></svg>; }
function IconGrid() { return <svg {...S}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>; }
function IconGear() { return <svg {...S}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" strokeLinecap="round" strokeLinejoin="round" /></svg>; }

function IconSortie() { return <svg {...S}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" strokeLinecap="round" /><path d="m16 17 5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function IconMarque() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 16V7a1 1 0 0 1 1-1h10v10" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 10h4l3 3.5V16h-2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7.5" cy="17.5" r="1.8" />
      <circle cx="17" cy="17.5" r="1.8" />
    </svg>
  );
}

const S = { width: 17, height: 17, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7 } as const;
function IconGauge() { return <svg {...S}><path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" /><path d="M13.4 10.6 18 6M3.5 18a9 9 0 1 1 17 0" strokeLinecap="round" /></svg>; }
function IconInbox() { return <svg {...S}><path d="M22 12h-6l-2 3h-4l-2-3H2" strokeLinecap="round" strokeLinejoin="round" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function IconDoc() { return <svg {...S}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinejoin="round" /><path d="M14 2v6h6M8 13h8M8 17h5" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function IconUsers() { return <svg {...S}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" strokeLinecap="round" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" /></svg>; }
function IconCalendar() { return <svg {...S}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" /></svg>; }
function IconChart() { return <svg {...S}><path d="M21 21H3V3" strokeLinecap="round" /><path d="M7 14l3-3 3 3 5-6" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function IconMail() { return <svg {...S}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function IconFlow() { return <svg {...S}><rect x="3" y="4" width="6" height="5" rx="1" /><rect x="15" y="4" width="6" height="5" rx="1" /><rect x="9" y="15" width="6" height="5" rx="1" /><path d="M6 9v3a2 2 0 0 0 2 2h1M18 9v3a2 2 0 0 1-2 2h-1" strokeLinecap="round" /></svg>; }
function IconCalc() { return <svg {...S}><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M8 6h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M16 15v4M8 19h6" strokeLinecap="round" /></svg>; }
function IconDes() { return <svg {...S}><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" /><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" stroke="none" /><circle cx="15.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" /><circle cx="8.5" cy="15.5" r="1.2" fill="currentColor" stroke="none" /></svg>; }
function IconSparkle() { return <svg {...S}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" strokeLinecap="round" /></svg>; }
