"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ic } from "@/crm/lib/icons";

/** Le rail du CRM, qui occupe la racine de l'app interne. L'espace équipe (/dashboard) et ce que voient les clients s'ouvrent par le menu des applications, en haut. */
const NAV: [string, [string, string, string][]][] = [
  ["Exploitation", [["dash", "Tableau de bord", "/tableau-de-bord"], ["cal", "Planning commercial", "/planning"], ["grid", "Planning d'exploitation", "/exploitation"], ["users", "Clients & dossiers", "/dossiers"], ["inbox", "Demandes Internet", "/demandes"]]],
  ["Cycle de vente", [["eye", "Visites techniques", "/visites"], ["doc", "Devis", "/devis"], ["check", "Commandes", "/commandes"], ["truck", "Lettres de voiture", "/lettres-de-voiture"], ["receipt", "Factures", "/factures"], ["mail", "Courriers & SMS", "/modeles"]]],
  ["Logistique", [["house", "Garde-meuble", "/garde-meuble"], ["ship", "Conteneurs", "/conteneurs"]]],
];

export function NavLinks() {
  const p = usePathname();
  return (
    <>
      {NAV.map(([g, items]) => (
        <div className="ng" key={g}>
          <small>{g}</small>
          {items.map(([i, l, h]) => (
            <Link key={h} href={h} title={l} className={p === h || p.startsWith(h + "/") ? "on" : ""}>
              <Ic n={i} /><span>{l}</span>
            </Link>
          ))}
        </div>
      ))}
    </>
  );
}

export function Tabs() {
  const p = usePathname();
  const T: [string, string][] = [["/", "Accueil"], ["/tableau-de-bord", "Tableau de bord"], ["/planning", "Planning"], ["/dossiers", "Dossiers"]];
  return (
    <div className="tabs">
      {T.map(([h, l]) => (
        <Link key={h} href={h} className={h === "/" ? (p === "/" ? "on" : "") : p.startsWith(h) ? "on" : ""}>{l}</Link>
      ))}
    </div>
  );
}
