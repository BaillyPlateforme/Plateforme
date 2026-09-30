"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

export default function Nav({ email, nouvelles }: { email: string; nouvelles: number }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  return (
    <div className="flex h-full w-full flex-col bg-card">
      {/* La marque : un jeton vert et le nom, comme la maquette. */}
      <div className="flex items-center gap-2.5 px-5 pb-2 pt-5">
        <span className="text-accent">
          <IconMarque />
        </span>
        <div className="min-w-0">
          <div className="truncate text-[15.5px] font-semibold leading-none tracking-tight">
            Bailly
          </div>
          <div className="mt-1 truncate text-[10.5px] leading-none text-ink-soft">
            Déménagement
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {SECTIONS.map((section) => (
          <div key={section.title} className="mb-5 last:mb-0">
            <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft/60">
              {section.title}
            </div>
            <div className="space-y-1">
              {section.items.map((l) => {
                const active = isActive(l.href);
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] transition ${
                      active
                        ? "bg-peach-soft font-medium text-ink"
                        : "text-ink/75 hover:bg-subtle hover:text-ink"
                    }`}
                  >
                    <span className={active ? "text-accent" : "text-ink-soft"}>{l.icon}</span>
                    {l.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* La file d'attente, en carte chaude — la maquette pose ici un encart. */}
      <div className="px-3 pb-2">
        <FileAttente nouvelles={nouvelles} />
      </div>

      {/* Le compte vit dans la barre du haut : il ne reste ici que la sortie. */}
      <div className="border-t border-line p-3">
        <form action={signOut}>
          <button
            type="submit"
            title={email}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px] text-ink/75 transition hover:bg-danger-soft hover:text-danger"
          >
            <IconSortie />
            Se déconnecter
          </button>
        </form>
      </div>
    </div>
  );
}

/**
 * L'encart du bas : ce qui attend d'être traité. La maquette y met une carte
 * en dégradé ; on y met le seul chiffre qui appelle une action.
 */
function FileAttente({ nouvelles }: { nouvelles: number }) {
  if (nouvelles === 0) {
    return (
      <div className="rounded-2xl border border-line bg-subtle p-4">
        <p className="text-[12.5px] font-medium">Rien en attente</p>
        <p className="mt-1 text-[11.5px] leading-snug text-ink-soft">
          Toutes les demandes reçues ont été ouvertes.
        </p>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-[#c9a46c] via-[#6d9a63] to-accent p-4 text-white">
      <div className="absolute -right-6 -top-8 h-24 w-24 rounded-full bg-white/15 blur-2xl" />
      <div className="relative">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[24px] font-semibold leading-none tnum">{nouvelles}</span>
          <span className="text-[12px] text-white/85">
            {nouvelles > 1 ? "nouvelles" : "nouvelle"}
          </span>
        </div>
        <p className="mt-2 text-[11.5px] leading-snug text-white/85">
          {nouvelles > 1 ? "Demandes reçues" : "Demande reçue"} et pas encore ouverte
          {nouvelles > 1 ? "s" : ""}.
        </p>
        <div className="mt-3.5 flex gap-2">
          <Link
            href="/dashboard?statut=new"
            className="rounded-xl bg-white px-3 py-1.5 text-[11.5px] font-medium text-ink transition hover:bg-white/90"
          >
            Les traiter
          </Link>
          <Link
            href="/dashboard"
            className="rounded-xl border border-white/45 px-3 py-1.5 text-[11.5px] font-medium transition hover:bg-white/15"
          >
            Tout voir
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Les réglages : le jeton du compte, dans la barre du haut, les ouvre. */
export const REGLAGES = [
  { href: "/dashboard/equipe", label: "Équipe", icone: <IconTeam /> },
  { href: "/dashboard/configuration", label: "Configuration", icone: <IconGrid /> },
  { href: "/dashboard/parametres", label: "Paramètres", icone: <IconGear /> },
];

function IconTeam() { return <svg {...S}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" strokeLinecap="round" /></svg>; }
function IconGrid() { return <svg {...S}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>; }
function IconGear() { return <svg {...S}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" strokeLinecap="round" strokeLinejoin="round" /></svg>; }

function IconSortie() { return <svg {...S}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" strokeLinecap="round" /><path d="m16 17 5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function IconMarque() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 1.8 21 7v10l-9 5.2L3 17V7z"
        fill="currentColor"
        fillOpacity="0.14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M7.2 14V9.6h5.2V14M12.4 11h2.1l1.9 2v1h-1.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9.3" cy="14.9" r="1" fill="currentColor" />
      <circle cx="14.6" cy="14.9" r="1" fill="currentColor" />
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
