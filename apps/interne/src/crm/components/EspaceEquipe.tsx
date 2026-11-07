"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Ic } from "@/crm/lib/icons";

/*
 * La section « Espace équipe », tout en bas du rail, à part des rubriques du
 * CRM : elle mène à l'ancien back-office, resté sous /dashboard avec sa propre
 * mise en page. Y aller recharge la page entière, c'est voulu.
 *
 * Le rail n'a la place que pour des icônes : le bouton ouvre un panneau qui
 * nomme chaque page en toutes lettres.
 */
const SECTIONS: { titre: string; sous: string; icone: string; liens: [string, string][] }[] = [
  {
    titre: "Questionnaires",
    sous: "Particuliers, mutations, entreprises",
    icone: "inbox",
    liens: [
      ["/dashboard/tableau-de-bord", "Tableau de bord"],
      ["/dashboard/leads", "Suivi des leads"],
      ["/dashboard", "Demandes"],
      ["/dashboard/rappels", "Rappels"],
      ["/dashboard/statistiques", "Statistiques"],
      ["/dashboard/espaces-pro", "Espaces pro"],
      ["/dashboard/messagerie", "Messagerie"],
    ],
  },
  {
    titre: "Espace client",
    sous: "Les dossiers, de la visite au SAV",
    icone: "users",
    liens: [["/dashboard/espace-client", "Dossiers"]],
  },
];

export function EspaceEquipe() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", h); document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, []);
  return (
    <div className="eq" ref={ref}>
      <button className={`eq-btn ${open ? "on" : ""}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="dialog" title="Espace équipe : questionnaires, espace client">
        <Ic n="apps" /><span>Équipe</span>
      </button>
      {open && (
        <div className="eq-panel" role="dialog" aria-label="Espace équipe">
          <div className="eq-h"><b>Espace équipe</b><small>L&apos;ancien back-office, à part du CRM. La page se recharge en y allant.</small></div>
          {SECTIONS.map((s) => (
            <div className="eq-s" key={s.titre}>
              <div className="eq-t"><i><Ic n={s.icone} /></i><span><b>{s.titre}</b><small>{s.sous}</small></span></div>
              {s.liens.map(([href, label]) => (
                <Link key={href} href={href} className="eq-l" onClick={() => setOpen(false)}>{label}<Ic n="right" /></Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
