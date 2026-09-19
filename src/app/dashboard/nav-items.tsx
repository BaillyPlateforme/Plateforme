// Les trois univers de l'espace équipe, et ce que chacun contient.
// Partagé par la barre du haut (les grands onglets) et le rail (le détail).

export type NavItem = {
  href: string;
  label: string;
  hint: string;
  color: string;
  icon: React.ReactNode;
};

export type NavGroup = {
  key: "pilotage" | "outils" | "reglages";
  label: string;
  hint: string;
  icon: React.ReactNode;
  items: NavItem[];
};

export const GROUPES: NavGroup[] = [
  {
    key: "pilotage",
    label: "Pilotage",
    hint: "Demandes, devis et planning",
    icon: <IconInbox />,
    items: [
      { href: "/dashboard", label: "Demandes", hint: "Tout ce qui arrive", color: "#6b50de", icon: <IconInbox /> },
      { href: "/dashboard/focus", label: "Focus", hint: "À ne pas rater", color: "#f59e0b", icon: <IconStar /> },
      { href: "/dashboard/kanban", label: "Kanban", hint: "Avancement", color: "#4b9fdc", icon: <IconKanban /> },
      { href: "/dashboard/devis", label: "Devis", hint: "Chiffrages envoyés", color: "#d94fb0", icon: <IconDoc /> },
      { href: "/dashboard/clients", label: "Clients", hint: "Historique", color: "#22c55e", icon: <IconUsers /> },
      { href: "/dashboard/agenda", label: "Agenda", hint: "Interventions", color: "#6366f1", icon: <IconCalendar /> },
      { href: "/dashboard/statistiques", label: "Statistiques", hint: "Ce que ça donne", color: "#06b6d4", icon: <IconChart /> },
    ],
  },
  {
    key: "outils",
    label: "Outils",
    hint: "Chiffrage, messagerie, automatisations",
    icon: <IconCalc />,
    items: [
      { href: "/dashboard/simulateur", label: "Simulateur", hint: "Le moteur de chiffrage", color: "#6b50de", icon: <IconCalc /> },
      { href: "/dashboard/messagerie", label: "Messagerie", hint: "Mails entrants", color: "#4b9fdc", icon: <IconMail /> },
      { href: "/dashboard/workflow", label: "Workflow", hint: "Automatisations", color: "#22c55e", icon: <IconFlow /> },
      { href: "/dashboard/playground", label: "Playground", hint: "Analyse d'image, tests", color: "#d94fb0", icon: <IconSparkle /> },
    ],
  },
  {
    key: "reglages",
    label: "Réglages",
    hint: "Équipe, grille, paramètres",
    icon: <IconGear />,
    items: [
      { href: "/dashboard/configuration", label: "Configuration", hint: "Grille, photos, IA", color: "#6b50de", icon: <IconGrid /> },
      { href: "/dashboard/equipe", label: "Équipe", hint: "Qui a accès", color: "#f59e0b", icon: <IconTeam /> },
      { href: "/dashboard/parametres", label: "Paramètres", hint: "Entreprise, devis, envois", color: "#4b9fdc", icon: <IconGear /> },
    ],
  },
];

/** Le groupe auquel appartient une URL — le premier qui la revendique. */
export function groupeDe(pathname: string): NavGroup {
  const exact = GROUPES.find((g) =>
    g.items.some((i) => i.href !== "/dashboard" && pathname.startsWith(i.href)),
  );
  return exact ?? GROUPES[0];
}

export function estActif(href: string, pathname: string): boolean {
  return href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
}

const S = {
  width: 17,
  height: 17,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
} as const;

export function IconInbox() { return <svg {...S}><path d="M22 12h-6l-2 3h-4l-2-3H2" strokeLinecap="round" strokeLinejoin="round" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
export function IconDoc() { return <svg {...S}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinejoin="round" /><path d="M14 2v6h6M8 13h8M8 17h5" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
export function IconKanban() { return <svg {...S}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M15 3v18" strokeLinecap="round" /></svg>; }
export function IconUsers() { return <svg {...S}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" strokeLinecap="round" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" /></svg>; }
export function IconCalendar() { return <svg {...S}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" /></svg>; }
export function IconChart() { return <svg {...S}><path d="M21 21H3V3" strokeLinecap="round" /><path d="M7 14l3-3 3 3 5-6" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
export function IconStar() { return <svg {...S}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
export function IconMail() { return <svg {...S}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
export function IconFlow() { return <svg {...S}><rect x="3" y="4" width="6" height="5" rx="1" /><rect x="15" y="4" width="6" height="5" rx="1" /><rect x="9" y="15" width="6" height="5" rx="1" /><path d="M6 9v3a2 2 0 0 0 2 2h1M18 9v3a2 2 0 0 1-2 2h-1" strokeLinecap="round" /></svg>; }
export function IconSparkle() { return <svg {...S}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" strokeLinecap="round" /></svg>; }
export function IconCalc() { return <svg {...S}><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M8 6h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M16 15v4M8 19h6" strokeLinecap="round" /></svg>; }
export function IconTeam() { return <svg {...S}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" strokeLinecap="round" /></svg>; }
export function IconGrid() { return <svg {...S}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>; }
export function IconGear() { return <svg {...S}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
