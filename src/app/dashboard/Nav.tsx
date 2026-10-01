"use client";

import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/actions/auth";

export type Item = { href: string; label: string; icon: React.ReactNode };

/** Le menu de la maquette : une seule liste, aérée, sans intertitre. */
export const ITEMS: Item[] = [
  { href: "/dashboard/tableau-de-bord", label: "Tableau de bord", icon: <IconGrid /> },
  { href: "/dashboard", label: "Demandes", icon: <IconInbox /> },
  { href: "/dashboard/devis", label: "Devis", icon: <IconDoc /> },
  { href: "/dashboard/clients", label: "Clients", icon: <IconCard /> },
  { href: "/dashboard/agenda", label: "Agenda", icon: <IconCalendar /> },
  { href: "/dashboard/statistiques", label: "Statistiques", icon: <IconTrend /> },
  { href: "/dashboard/messagerie", label: "Messagerie", icon: <IconMail /> },
  { href: "/dashboard/workflow", label: "Workflow", icon: <IconFlow /> },
  { href: "/dashboard/simulateur", label: "Simulateur", icon: <IconCalc /> },
  { href: "/dashboard/campagne", label: "Campagne", icon: <IconDes /> },
  { href: "/dashboard/playground", label: "Playground", icon: <IconBadge /> },
];

/** Les réglages : le jeton du compte, dans la barre du haut, les ouvre. */
export const REGLAGES = [
  { href: "/dashboard/equipe", label: "Équipe", icone: <IconTeam /> },
  { href: "/dashboard/configuration", label: "Configuration", icone: <IconGrid /> },
  { href: "/dashboard/parametres", label: "Paramètres", icone: <IconGear /> },
];

export default function Nav({
  email,
  nouvelles,
  onNaviguer,
}: {
  email: string;
  nouvelles: number;
  onNaviguer?: () => void;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  return (
    <div className="flex h-full w-[248px] flex-col rounded-[22px] bg-card px-4 py-5">
      {/* La marque : le logo de l'enseigne, et le lien de sortie à droite. */}
      <div className="mb-6 flex items-center gap-2.5 px-2">
        <Image
          src="/marque/bailly-symbole.svg"
          alt="Bailly Déménagement"
          width={32}
          height={32}
          className="shrink-0 rounded-[7px]"
          priority
        />
        <span className="flex-1 truncate text-[19px] font-black uppercase tracking-tight">
          Bailly
        </span>
        <Link
          href="/"
          title="Voir le formulaire client"
          onClick={onNaviguer}
          className="text-ink-soft transition hover:text-ink"
        >
          <IconPanneau />
        </Link>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto">
        {ITEMS.map((l) => {
          const active = isActive(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              onClick={onNaviguer}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-[14.5px] transition ${
                active
                  ? "bg-brand font-semibold text-[#1b1a18]"
                  : "text-ink-mid hover:bg-subtle hover:text-ink"
              }`}
            >
              <span className="shrink-0">{l.icon}</span>
              <span className="truncate">{l.label}</span>
            </Link>
          );
        })}
      </nav>

      <FileAttente nouvelles={nouvelles} />

      <form action={signOut} className="mt-1.5">
        <button
          type="submit"
          title={email}
          className="flex w-full items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-left text-[14.5px] text-ink-mid transition hover:bg-danger-soft hover:text-danger"
        >
          <IconSortie />
          Se déconnecter
        </button>
      </form>
    </div>
  );
}

/**
 * L'encart du bas. La maquette y met une demande d'accès avec ses visages et
 * ses deux boutons ; on y met la file d'attente, qui est ce qui appelle une
 * action dans cette application.
 */
function FileAttente({ nouvelles }: { nouvelles: number }) {
  return (
    <div className="relative mt-4 overflow-hidden rounded-[18px] bg-[#1b1a18] p-4 text-white">
      <div className="halo absolute -right-10 -top-12 h-32 w-32" style={{ "--halo": "rgba(245,208,51,0.32)" } as CSSProperties} />
      <div className="relative">
        <div className="mb-3 flex items-center">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="-ml-2 flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#1b1a18] bg-brand text-[#1b1a18] first:ml-0"
            >
              <IconBoite />
            </span>
          ))}
          <span className="-ml-2 flex h-8 items-center rounded-full border-2 border-[#1b1a18] bg-brand px-2 text-[11px] font-bold text-[#1b1a18]">
            {nouvelles > 99 ? "99+" : nouvelles}
          </span>
        </div>
        <p className="text-[12.5px] font-medium leading-snug">
          {nouvelles === 0
            ? "Aucune demande n'attend d'être ouverte."
            : `${nouvelles > 1 ? "Demandes reçues" : "Demande reçue"} et pas encore ouverte${nouvelles > 1 ? "s" : ""}.`}
        </p>
        <div className="mt-3.5 flex gap-2">
          <Link
            href="/dashboard?statut=new"
            className="flex-1 rounded-[10px] border border-white/35 py-1.5 text-center text-[12px] font-semibold transition hover:bg-white/10"
          >
            Les traiter
          </Link>
          <Link
            href="/dashboard"
            className="flex-1 rounded-[10px] bg-brand py-1.5 text-center text-[12px] font-semibold text-[#1b1a18] transition hover:bg-[#e0b81a]"
          >
            Tout voir
          </Link>
        </div>
      </div>
    </div>
  );
}


const S = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function IconPanneau() {
  return (
    <svg {...S} width={18} height={18}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M9.5 4v16" />
    </svg>
  );
}
function IconGrid() { return <svg {...S}><rect x="3" y="3" width="7.5" height="7.5" rx="2" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="2" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="2" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" /></svg>; }
function IconInbox() { return <svg {...S}><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></svg>; }
function IconDoc() { return <svg {...S}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></svg>; }
function IconCard() { return <svg {...S}><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><circle cx="8.5" cy="11" r="2" /><path d="M5.5 16c.6-1.4 1.8-2 3-2s2.4.6 3 2M14.5 10h4M14.5 13.5h3" /></svg>; }
function IconCalendar() { return <svg {...S}><rect x="3" y="4.5" width="18" height="17" rx="2.5" /><path d="M16 2.5v4M8 2.5v4M3 10h18" /></svg>; }
function IconTrend() { return <svg {...S}><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M7.5 14.5 10.5 11l2.5 2.5 3.5-4.5" /></svg>; }
function IconMail() { return <svg {...S}><rect x="2.5" y="4.5" width="19" height="15" rx="2.5" /><path d="m21 7-9 5.5L3 7" /></svg>; }
function IconFlow() { return <svg {...S}><rect x="3" y="4" width="6" height="5" rx="1.5" /><rect x="15" y="4" width="6" height="5" rx="1.5" /><rect x="9" y="15" width="6" height="5" rx="1.5" /><path d="M6 9v3a2 2 0 0 0 2 2h1M18 9v3a2 2 0 0 1-2 2h-1" /></svg>; }
function IconCalc() { return <svg {...S}><rect x="4" y="2.5" width="16" height="19" rx="2.5" /><path d="M8 6.5h8M8 11h2M12 11h2M16 11h.01M8 15h2M12 15h2M16 15v3.5M8 18.5h6" /></svg>; }
function IconDes() { return <svg {...S}><rect x="3" y="3" width="18" height="18" rx="4" /><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor" stroke="none" /><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor" stroke="none" /><circle cx="15.5" cy="8.5" r="1.3" fill="currentColor" stroke="none" /><circle cx="8.5" cy="15.5" r="1.3" fill="currentColor" stroke="none" /></svg>; }
function IconBadge() { return <svg {...S}><circle cx="12" cy="9" r="6" /><path d="m8.5 14.5-1.5 7 5-2.5 5 2.5-1.5-7" /></svg>; }
function IconTeam() { return <svg {...S} width={17} height={17}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>; }
function IconGear() { return <svg {...S} width={17} height={17}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>; }
function IconSortie() { return <svg {...S}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></svg>; }
function IconBoite() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M21 8 12 3 3 8v8l9 5 9-5z" />
      <path d="m3 8 9 5 9-5" />
    </svg>
  );
}
