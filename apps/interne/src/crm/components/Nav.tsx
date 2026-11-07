"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ic } from "@/crm/lib/icons";

/** Le rail du CRM. Le CRM occupe la racine de l'app interne ; l'espace équipe, sous /dashboard, a sa section à part (EspaceEquipe). */
const NAV: [string, [string, string, string][]][] = [
  ["Exploitation", [["dash", "Tableau de bord", "/tableau-de-bord"], ["cal", "Planning commercial", "/planning"], ["users", "Clients & dossiers", "/dossiers"]]],
  ["Cycle de vente", [["eye", "Visites techniques", "/visites"], ["doc", "Devis", "/devis"], ["check", "Commandes", "/commandes"], ["truck", "Lettres de voiture", "/lettres-de-voiture"], ["receipt", "Factures", "/factures"]]],
  ["Logistique", [["house", "Garde-meuble", "/bientot/garde-meuble"], ["ship", "Conteneurs", "/bientot/conteneurs"]]],
  ["Espaces", [["globe", "Espaces client, RH, partenaires", "/bientot/espaces"]]],
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
