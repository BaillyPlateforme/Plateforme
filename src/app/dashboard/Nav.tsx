"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/actions/auth";

type Item = { href: string; label: string; icon: React.ReactNode };
const SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: "Pilotage",
    items: [
      { href: "/dashboard", label: "Demandes", icon: <IconInbox /> },
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
    <div className="flex h-full flex-col">
      <div className="px-6 pt-6">
        <div className="font-serif text-[26px] font-semibold leading-none">Bailly</div>
        <div className="eyebrow mt-1.5 text-ink-soft">Déménagement</div>
      </div>

      <nav className="mt-6 flex-1 overflow-y-auto px-3 pb-4">
        {SECTIONS.map((section) => (
          <div key={section.title} className="mb-4">
            <div className="eyebrow px-3.5 pb-1.5 text-[10px] text-ink-soft/70">{section.title}</div>
            <div className="space-y-0.5">
              {section.items.map((l) => {
                const active = isActive(l.href);
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`group relative flex items-center gap-3 rounded-lg px-3.5 py-2 text-sm transition ${
                      active
                        ? "bg-accent-soft font-medium text-accent-dark"
                        : "text-ink-soft hover:bg-subtle hover:text-ink"
                    }`}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent" />
                    )}
                    <span className={active ? "text-accent" : "text-ink-soft/70 group-hover:text-ink"}>
                      {l.icon}
                    </span>
                    {l.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-line p-3">
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-medium text-white">
            {email.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs text-ink" title={email}>{email}</div>
            <div className="text-[11px] text-ink-soft">Équipe Bailly</div>
          </div>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-ink-soft transition hover:bg-subtle hover:text-ink"
          >
            Se déconnecter
          </button>
        </form>
      </div>
    </div>
  );
}

const S = { width: 17, height: 17, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7 } as const;
function IconInbox() { return <svg {...S}><path d="M22 12h-6l-2 3h-4l-2-3H2" strokeLinecap="round" strokeLinejoin="round" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function IconDoc() { return <svg {...S}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinejoin="round" /><path d="M14 2v6h6M8 13h8M8 17h5" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function IconKanban() { return <svg {...S}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M15 3v18" strokeLinecap="round" /></svg>; }
function IconUsers() { return <svg {...S}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" strokeLinecap="round" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" /></svg>; }
function IconCalendar() { return <svg {...S}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" /></svg>; }
function IconChart() { return <svg {...S}><path d="M21 21H3V3" strokeLinecap="round" /><path d="M7 14l3-3 3 3 5-6" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function IconMail() { return <svg {...S}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function IconFlow() { return <svg {...S}><rect x="3" y="4" width="6" height="5" rx="1" /><rect x="15" y="4" width="6" height="5" rx="1" /><rect x="9" y="15" width="6" height="5" rx="1" /><path d="M6 9v3a2 2 0 0 0 2 2h1M18 9v3a2 2 0 0 1-2 2h-1" strokeLinecap="round" /></svg>; }
function IconSparkle() { return <svg {...S}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" strokeLinecap="round" /></svg>; }
function IconTeam() { return <svg {...S}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" strokeLinecap="round" /></svg>; }
function IconGrid() { return <svg {...S}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>; }
function IconGear() { return <svg {...S}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
