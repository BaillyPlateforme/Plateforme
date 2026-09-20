"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/actions/auth";

type Item = { href: string; label: string; icon: React.ReactNode };
const SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: "Pilotage",
    items: [
      { href: "/dashboard/tableau-de-bord", label: "Tableau de bord", icon: <IconGauge /> },
      { href: "/dashboard", label: "Demandes", icon: <IconInbox /> },
      { href: "/dashboard/focus", label: "Focus", icon: <IconStar /> },
      { href: "/dashboard/kanban", label: "Kanban", icon: <IconKanban /> },
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
      { href: "/dashboard/simulateur", label: "Simulateur", icon: <IconCalc /> },
      { href: "/dashboard/playground", label: "Playground", icon: <IconSparkle /> },
    ],
  },
  {
    title: "Réglages",
    items: [
      { href: "/dashboard/equipe", label: "Équipe", icon: <IconTeam /> },
      { href: "/dashboard/configuration", label: "Configuration", icon: <IconGrid /> },
      { href: "/dashboard/parametres", label: "Paramètres", icon: <IconGear /> },
    ],
  },
];

export default function Nav({ email }: { email: string }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  return (
    <div className="flex h-full flex-col bg-[#fbfaf9]">
      {/* La marque : tuile dégradée et nom, comme la référence. */}
      <div className="flex items-center gap-3 px-6 pt-6">
        <span
          className="flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-[0_4px_12px_-4px_rgba(232,80,42,0.6)]"
          style={{ background: "linear-gradient(145deg, #f4501e 0%, #ff8a3d 100%)" }}
        >
          <IconMarque />
        </span>
        <div>
          <div className="text-[19px] font-bold leading-none tracking-tight">Bailly</div>
          <div className="mt-1 text-[10.5px] uppercase tracking-[0.14em] text-ink-soft">
            Déménagement
          </div>
        </div>
      </div>

      <nav className="mt-7 flex-1 overflow-y-auto px-3 pb-4">
        {SECTIONS.map((section) => (
          <div key={section.title} className="mb-5">
            <div className="px-4 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-soft/70">
              {section.title}
            </div>
            <div className="space-y-0.5">
              {section.items.map((l) => {
                const active = isActive(l.href);
                return (
                  <Link key={l.href} href={l.href} className="relative block">
                    {/* Le halo orange qui déborde à droite de la pastille active. */}
                    {active && (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-y-0.5 left-8 right-[-26px] rounded-full blur-xl"
                        style={{
                          background:
                            "linear-gradient(90deg, rgba(244,80,30,0.55) 0%, rgba(255,138,61,0.34) 45%, rgba(255,138,61,0) 100%)",
                        }}
                      />
                    )}
                    <span
                      className={`relative flex items-center gap-3.5 rounded-2xl px-4 py-3 transition ${
                        active
                          ? "bg-white shadow-[0_2px_10px_-2px_rgba(28,28,34,0.10)]"
                          : "hover:bg-black/[0.035]"
                      }`}
                    >
                      <span className={active ? "text-[#e8502a]" : "text-ink-soft"}>{l.icon}</span>
                      <span
                        className={`text-[14.5px] ${active ? "font-semibold text-ink" : "font-medium text-ink/75"}`}
                      >
                        {l.label}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-line/70 p-3">
        <div className="flex items-center gap-2.5 px-3 py-1.5">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
            style={{ background: "linear-gradient(145deg, #f4501e 0%, #ff8a3d 100%)" }}
          >
            {email.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs text-ink" title={email}>
              {email}
            </div>
            <div className="text-[11px] text-ink-soft">Équipe Bailly</div>
          </div>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="mt-1 w-full rounded-2xl px-4 py-2 text-left text-[14px] text-ink-soft transition hover:bg-black/[0.035] hover:text-ink"
          >
            Se déconnecter
          </button>
        </form>
      </div>
    </div>
  );
}

function IconMarque() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 9.5 12 4l8 5.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" strokeLinejoin="round" />
      <path d="M9.5 20v-6h5v6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const S = { width: 19, height: 19, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7 } as const;
function IconGauge() { return <svg {...S}><path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" /><path d="M13.4 10.6 18 6M3.5 18a9 9 0 1 1 17 0" strokeLinecap="round" /></svg>; }
function IconInbox() { return <svg {...S}><path d="M22 12h-6l-2 3h-4l-2-3H2" strokeLinecap="round" strokeLinejoin="round" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function IconDoc() { return <svg {...S}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinejoin="round" /><path d="M14 2v6h6M8 13h8M8 17h5" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function IconKanban() { return <svg {...S}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M15 3v18" strokeLinecap="round" /></svg>; }
function IconUsers() { return <svg {...S}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" strokeLinecap="round" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" /></svg>; }
function IconCalendar() { return <svg {...S}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" /></svg>; }
function IconChart() { return <svg {...S}><path d="M21 21H3V3" strokeLinecap="round" /><path d="M7 14l3-3 3 3 5-6" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function IconStar() { return <svg {...S}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function IconMail() { return <svg {...S}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function IconFlow() { return <svg {...S}><rect x="3" y="4" width="6" height="5" rx="1" /><rect x="15" y="4" width="6" height="5" rx="1" /><rect x="9" y="15" width="6" height="5" rx="1" /><path d="M6 9v3a2 2 0 0 0 2 2h1M18 9v3a2 2 0 0 1-2 2h-1" strokeLinecap="round" /></svg>; }
function IconCalc() { return <svg {...S}><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M8 6h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M16 15v4M8 19h6" strokeLinecap="round" /></svg>; }
function IconSparkle() { return <svg {...S}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" strokeLinecap="round" /></svg>; }
function IconTeam() { return <svg {...S}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" strokeLinecap="round" /></svg>; }
function IconGrid() { return <svg {...S}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>; }
function IconGear() { return <svg {...S}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
